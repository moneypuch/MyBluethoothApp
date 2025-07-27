// app/services/BluetoothDataService.ts
/**
 * High-performance Bluetooth data service for 1000Hz data streaming
 * Operates outside of MST to avoid reactivity overhead
 */

import { SEmgCircularBuffer, type SEmgSample } from "@/utils/CircularBuffer"
import { debugLog, debugError, debugWarn } from "@/utils/logger"
import { api } from "@/services/api"
import type { BluetoothDevice, BluetoothEventSubscription } from "react-native-bluetooth-classic"

export interface BluetoothConnectionStatus {
  enabled: boolean
  connected: boolean
  connecting: boolean
  streaming: boolean
  device: BluetoothDevice | null
  message: string
}

export interface SessionInfo {
  id: string
  deviceName: string
  deviceAddress: string
  startTime: number
  endTime?: number
  sampleCount: number
}

export interface DataStatistics {
  totalSamples: number
  packetsReceived: number
  samplesPerSecond: number
  bufferSizes: {
    buffer1kHz: number
    buffer100Hz: number
    buffer10Hz: number
  }
  lastUpdate: number
}

/**
 * Event-driven Bluetooth data service
 * Handles high-frequency data without MST overhead
 */
export class BluetoothDataService {
  // High-performance circular buffers (no MST reactivity)
  private buffer1kHz = new SEmgCircularBuffer(10000) // 10 seconds at 1kHz
  private buffer100Hz = new SEmgCircularBuffer(6000) // 60 seconds at 100Hz
  private buffer10Hz = new SEmgCircularBuffer(3600) // 6 minutes at 10Hz
  private backendQueue = new SEmgCircularBuffer(20000) // 20s buffer for 1kHz data

  // Performance counters (no MST reactivity)
  private totalSamplesProcessed = 0
  private packetCount = 0
  private downsampleCounter = 0
  private lastDataTimestamp = 0
  private lastFrequencyCheck = 0

  // Connection state
  private connectionStatus: BluetoothConnectionStatus = {
    enabled: false,
    connected: false,
    connecting: false,
    streaming: false,
    device: null,
    message: "Initializing...",
  }

  // Session management
  private currentSession: SessionInfo | null = null
  private sessions: SessionInfo[] = []

  // Bluetooth management
  private dataSubscription: BluetoothEventSubscription | null = null
  private backendSyncInterval: NodeJS.Timeout | null = null
  private selectedDevice: BluetoothDevice | null = null

  // Event callbacks for UI updates (throttled)
  private onStatusChange?: (status: BluetoothConnectionStatus) => void
  private onDataUpdate?: (stats: DataStatistics) => void
  private onSessionUpdate?: (sessions: SessionInfo[]) => void

  // Configuration
  private backendSyncEnabled = true // Enabled with new non-blocking architecture
  private uiUpdateThrottle = 100 // Update UI every 100 samples (~10Hz)

  // Mock functionality
  private mockStreamingInterval: NodeJS.Timeout | null = null
  private isMockMode = false

  constructor() {
    debugLog("BluetoothDataService initialized")
  }

  // Event subscription methods
  setOnStatusChange(callback: (status: BluetoothConnectionStatus) => void) {
    this.onStatusChange = callback
  }

  setOnDataUpdate(callback: (stats: DataStatistics) => void) {
    this.onDataUpdate = callback
  }

  setOnSessionUpdate(callback: (sessions: SessionInfo[]) => void) {
    this.onSessionUpdate = callback
  }

  // Connection management
  async connectToDevice(device: BluetoothDevice): Promise<boolean> {
    try {
      this.connectionStatus.connecting = true
      this.connectionStatus.message = "Connecting..."
      this.notifyStatusChange()

      const connected = await device.connect()

      this.connectionStatus.connected = connected
      this.connectionStatus.connecting = false
      this.connectionStatus.device = connected ? device : null
      this.connectionStatus.message = connected
        ? `Connected to ${device.name || device.address}`
        : "Connection failed"

      if (connected) {
        this.selectedDevice = device
        this.clearBuffers()
      }

      this.notifyStatusChange()
      return connected
    } catch (error: any) {
      debugError("Connection error:", error)
      this.connectionStatus.connecting = false
      this.connectionStatus.connected = false
      this.connectionStatus.message = `Connection error: ${error.message}`
      this.notifyStatusChange()
      return false
    }
  }

  async disconnectDevice(): Promise<void> {
    try {
      this.stopStreaming()

      if (this.selectedDevice && this.connectionStatus.connected) {
        await this.selectedDevice.disconnect()
      }

      this.connectionStatus.connected = false
      this.connectionStatus.device = null
      this.connectionStatus.message = "Disconnected"
      this.selectedDevice = null

      this.notifyStatusChange()
    } catch (error) {
      debugWarn("Disconnect error:", error)
    }
  }

  // Streaming control
  async startStreaming(): Promise<boolean> {
    if (!this.selectedDevice || !this.connectionStatus.connected) {
      return false
    }

    try {
      // Send start command
      const success = await this.sendCommand("Start")
      if (!success) return false

      // Clear buffers and reset counters for new session
      this.clearBuffers()
      debugLog(`🔄 Buffers cleared, packetCount reset to: ${this.packetCount}`)

      // Create session immediately (non-blocking)
      const sessionId = `session_${Date.now()}_${Date.now().toString(36)}`
      this.currentSession = {
        id: sessionId,
        deviceName: this.selectedDevice.name || "Unknown",
        deviceAddress: this.selectedDevice.address,
        startTime: Date.now(),
        sampleCount: 0,
      }
      this.sessions.unshift(this.currentSession)

      // Update status
      this.connectionStatus.streaming = true
      this.connectionStatus.message = "Streaming active"

      // Setup data listener
      this.setupDataListener()

      // Create API session in background
      this.createApiSession(sessionId)

      // Start backend sync if enabled
      if (this.backendSyncEnabled) {
        debugLog("🚀 Starting backend sync for real-time data capture")
        this.startBackendSync()
      } else {
        debugWarn("⚠️ Backend sync is disabled - data will not be saved!")
      }

      this.notifyStatusChange()
      this.notifySessionUpdate()

      return true
    } catch (error) {
      debugError("Failed to start streaming:", error)
      return false
    }
  }

  async stopStreaming(): Promise<boolean> {
    try {
      debugLog(`🛑 Stopping streaming... Device connected: ${this.connectionStatus.connected}`)
      
      // Send stop command
      const success = await this.sendCommand("Stop")
      debugLog(`🛑 Stop command result: ${success}`)

      // Stop backend sync
      this.stopBackendSync()

      // Update status
      this.connectionStatus.streaming = false
      this.connectionStatus.message = "Streaming stopped"

      // Prepare session data before ending
      let sessionId = null;
      let sessionSampleCount = 0;
      
      if (this.currentSession) {
        this.currentSession.endTime = Date.now()
        // Store the current packet count for this session before resetting
        sessionSampleCount = this.packetCount
        this.currentSession.sampleCount = sessionSampleCount
        sessionId = this.currentSession.id

        debugLog(`📊 Session ending: ${this.currentSession.id} with ${sessionSampleCount} samples`)

        this.currentSession = null
      }

      // Send any remaining data in the queue before closing session
      if (this.backendSyncEnabled && sessionId) {
        const remainingData = this.backendQueue.getSize()
        if (remainingData > 0) {
          debugLog(`📤 Sending ${remainingData} remaining samples before stopping...`)
          
          // Send all remaining data in batches
          while (this.backendQueue.getSize() > 0) {
            const batchSize = Math.min(this.backendQueue.getSize(), 3000)
            const batch = this.backendQueue.getLatest(batchSize)
            
            if (batch.length > 0) {
              try {
                await this.sendBatchToBackend(batch)
                
                // Remove sent samples from queue
                for (let i = 0; i < batch.length; i++) {
                  this.backendQueue.removeOldest()
                }
                
                debugLog(`✅ Final batch sent: ${batch.length} samples`)
              } catch (error) {
                debugError("❌ Failed to send final batch:", error)
                break // Exit loop on error
              }
            }
          }
        }

        // End API session AFTER all data has been sent
        debugLog(`🔚 All data sent, now ending session ${sessionId}`)
        this.endApiSession(sessionId, sessionSampleCount)
      }

      // Cleanup subscription
      if (this.dataSubscription) {
        this.dataSubscription.remove()
        this.dataSubscription = null
      }

      // Check if device is still connected after stop command
      // Some HC-05 boards disconnect after receiving "Stop"
      if (this.selectedDevice) {
        let isStillConnected = false
        
        try {
          isStillConnected = await this.selectedDevice.isConnected()
        } catch (connectionError) {
          // If isConnected() throws an exception, device is disconnected
          debugLog(`🔍 Device disconnected after Stop (expected behavior for HC-05): ${connectionError.message}`)
          isStillConnected = false
        }
        
        if (!isStillConnected) {
          debugWarn(`⚠️ Device disconnected after Stop command, attempting to reconnect...`)
          
          try {
            // Try to reconnect
            const reconnected = await this.selectedDevice.connect()
            if (reconnected) {
              this.connectionStatus.connected = true
              this.connectionStatus.message = "Reconnected after stop command"
              debugLog(`✅ Successfully reconnected after Stop command`)
            } else {
              this.connectionStatus.connected = false
              this.connectionStatus.message = "Device disconnected after stop command"
              debugError(`❌ Failed to reconnect after Stop command`)
            }
          } catch (reconnectError) {
            debugError(`❌ Reconnection failed:`, reconnectError)
            this.connectionStatus.connected = false
            this.connectionStatus.message = "Failed to reconnect after stop command"
          }
        } else {
          debugLog(`✅ Device still connected after Stop command`)
        }
      }

      this.notifyStatusChange()
      this.notifySessionUpdate()

      return success
    } catch (error) {
      debugError("Failed to stop streaming:", error)
      return false
    }
  }

  // High-performance data processing
  private processSampleData(line: string): void {
    if (!line || !this.currentSession) {
      return
    }

    const values = line
      .split(/\s+/)
      .map((n) => Number(n))
      .filter((n) => !isNaN(n))

    if (values.length === 10) {
      // Log first 10 samples and then every 1000 samples to monitor frequency
      if (this.totalSamplesProcessed < 10) {
        debugLog(`📊 Sample #${this.totalSamplesProcessed + 1}: ${values.join(' ')}`)
      }
      
      // Monitor actual sampling rate every 1000 samples (should be every ~1 second at 1kHz)
      if (this.totalSamplesProcessed % 1000 === 0 && this.totalSamplesProcessed > 0) {
        const now = Date.now()
        const elapsed = now - (this.lastFrequencyCheck || now)
        const actualFreq = elapsed > 0 ? 1000 / (elapsed / 1000) : 0
        debugLog(`📈 Frequency check: ${this.totalSamplesProcessed} samples processed, actual rate: ${actualFreq.toFixed(1)}Hz`)
        this.lastFrequencyCheck = now
      }
      const sample: SEmgSample = {
        timestamp: Date.now(),
        values,
        sessionId: this.currentSession.id,
      }

      // High-performance buffer operations (no MST overhead)
      this.buffer1kHz.push(sample)
      this.totalSamplesProcessed++
      this.packetCount++
      this.lastDataTimestamp = sample.timestamp

      // Downsample for lower frequency buffers
      this.downsampleCounter++
      if (this.downsampleCounter >= 10) {
        this.buffer100Hz.push(sample)
        this.downsampleCounter = 0

        // 10Hz buffer (every 100th sample)
        if (this.totalSamplesProcessed % 100 === 0) {
          this.buffer10Hz.push(sample)
        }
      }

      // Add to backend queue
      if (this.backendSyncEnabled) {
        this.backendQueue.push(sample)
        
        // Debug: Log every 100 samples
        if (this.totalSamplesProcessed % 100 === 0) {
          debugLog(`📊 Backend queue size: ${this.backendQueue.getSize()} samples | Total processed: ${this.totalSamplesProcessed}`)
        }
        
        // Debug: Log first few samples to verify data is being queued
        if (this.totalSamplesProcessed <= 5) {
          debugLog(`🔍 Sample #${this.totalSamplesProcessed} queued:`, sample)
        }
      }

      // Throttled UI updates (every 100 samples = ~10Hz)
      if (this.totalSamplesProcessed % this.uiUpdateThrottle === 0) {
        this.notifyDataUpdate()
      }
    }
  }

  // Data access methods
  getLatestSamples(count: number, frequency: "1kHz" | "100Hz" | "10Hz" = "1kHz"): SEmgSample[] {
    const buffer =
      frequency === "1kHz"
        ? this.buffer1kHz
        : frequency === "100Hz"
          ? this.buffer100Hz
          : this.buffer10Hz
    return buffer.getLatest(count)
  }

  getChartData(
    channel: number,
    count?: number,
    frequency: "1kHz" | "100Hz" | "10Hz" = "1kHz",
  ): Array<{ x: number; y: number }> {
    const buffer =
      frequency === "1kHz"
        ? this.buffer1kHz
        : frequency === "100Hz"
          ? this.buffer100Hz
          : this.buffer10Hz
    return buffer.getChartData(channel, count)
  }

  getStatistics(): DataStatistics {
    return {
      totalSamples: this.totalSamplesProcessed,
      packetsReceived: this.packetCount,
      samplesPerSecond: this.connectionStatus.streaming ? 1000 : 0,
      bufferSizes: {
        buffer1kHz: this.buffer1kHz.getSize(),
        buffer100Hz: this.buffer100Hz.getSize(),
        buffer10Hz: this.buffer10Hz.getSize(),
      },
      lastUpdate: this.lastDataTimestamp,
    }
  }

  getConnectionStatus(): BluetoothConnectionStatus {
    return { ...this.connectionStatus }
  }

  getSessions(): SessionInfo[] {
    return [...this.sessions]
  }

  // Private helper methods
  private async sendCommand(command: string): Promise<boolean> {
    debugLog(`🔧 Attempting to send command: ${command}`)
    debugLog(`🔧 Device status - connected: ${this.connectionStatus.connected}, device: ${this.selectedDevice ? 'exists' : 'null'}`)
    
    if (!this.selectedDevice || !this.connectionStatus.connected) {
      debugError(`❌ Cannot send command: device=${this.selectedDevice ? 'exists' : 'null'}, connected=${this.connectionStatus.connected}`)
      return false
    }

    try {
      // Check if device is still actually connected
      let isConnected = false
      try {
        isConnected = await this.selectedDevice.isConnected()
      } catch (connectionCheckError) {
        // If isConnected() throws an exception, the device is definitely not connected
        debugLog(`🔍 Connection check failed (device disconnected): ${connectionCheckError.message}`)
        isConnected = false
      }
      
      if (!isConnected) {
        debugError(`❌ Device not actually connected despite status saying it is`)
        this.connectionStatus.connected = false
        this.connectionStatus.message = "Device disconnected unexpectedly"
        this.notifyStatusChange()
        return false
      }

      // Use slow write for HC-05 compatibility
      for (const char of command) {
        await this.selectedDevice.write(char)
        await new Promise((res) => setTimeout(res, 50))
      }
      await this.selectedDevice.write("\r")

      debugLog(`✅ Command sent successfully: ${command}`)
      return true
    } catch (error: any) {
      debugError("❌ Command error:", error)
      
      // Check if error indicates disconnection
      if (error.message && error.message.includes("Not connected")) {
        debugError("❌ Device appears to be disconnected, updating status")
        this.connectionStatus.connected = false
        this.connectionStatus.message = "Device disconnected unexpectedly"
        this.notifyStatusChange()
      }
      
      return false
    }
  }

  private setupDataListener(): void {
    if (!this.selectedDevice) return

    debugLog("Setting up data listener...")
    this.dataSubscription = this.selectedDevice.onDataReceived((event) => {
      const receivedData = event.data
      if (receivedData && typeof receivedData === "string") {
        const lines = receivedData.split("\r\n").filter((line) => line.trim().length > 0)
        lines.forEach((line) => {
          this.processSampleData(line.trim())
        })
      }
    })
  }

  private clearBuffers(): void {
    this.buffer1kHz.clear()
    this.buffer100Hz.clear()
    this.buffer10Hz.clear()
    this.backendQueue.clear()
    this.totalSamplesProcessed = 0
    this.packetCount = 0
    this.downsampleCounter = 0
    this.lastDataTimestamp = 0
  }

  private createApiSession(sessionId: string): void {
    if (!this.selectedDevice) return

    setTimeout(async () => {
      try {
        const sessionRequest = {
          sessionId: sessionId,
          deviceId: this.selectedDevice?.address || "unknown",
          deviceName: this.selectedDevice?.name || "Unknown Device",
          startTime: new Date().toISOString(),
          sampleRate: 1000,
          channelCount: 10,
          metadata: {
            appVersion: "1.0.0",
            deviceInfo: {
              name: this.selectedDevice?.name,
              address: this.selectedDevice?.address,
            },
          },
        }

        debugLog(`🚀 Creating API session with data:`, sessionRequest)
        const result = await api.createSession(sessionRequest)
        if (result.kind === "ok") {
          debugLog("✅ API session created successfully:", result.data)
        } else {
          debugError("❌ Failed to create API session:", result)
          debugWarn("⚠️ Continuing with local session only")
        }
      } catch (error) {
        debugError("Failed to create API session:", error)
      }
    }, 0)
  }

  private endApiSession(sessionId: string, sampleCount?: number): void {
    setTimeout(async () => {
      try {
        const endData = {
          endTime: new Date().toISOString(),
          totalSamples: sampleCount || this.packetCount,
        }

        debugLog(`🔚 Calling endSession API for ${sessionId} with ${endData.totalSamples} samples`)
        
        const result = await api.endSession(sessionId, endData)
        if (result.kind === "ok") {
          debugLog(`✅ API session ended successfully with ${endData.totalSamples} samples`)
          debugLog(`📊 Session finalization result:`, result.data)
        } else {
          if (result.kind === "unauthorized") {
            debugError("❌ API session end failed: Not authenticated. Please login again.")
          } else {
            debugError("❌ Failed to end API session:", result)
          }
        }
      } catch (error) {
        debugError("Failed to end API session:", error)
      }
    }, 0)
  }

  // Notification methods (throttled)
  private notifyStatusChange(): void {
    if (this.onStatusChange) {
      this.onStatusChange(this.getConnectionStatus())
    }
  }

  private notifyDataUpdate(): void {
    if (this.onDataUpdate) {
      this.onDataUpdate(this.getStatistics())
    }
  }

  private notifySessionUpdate(): void {
    if (this.onSessionUpdate) {
      this.onSessionUpdate(this.getSessions())
    }
  }

  // Mock functionality for testing
  startMockBluetooth(): void {
    this.isMockMode = true
    this.connectionStatus.enabled = true
    this.connectionStatus.message = "Mock Bluetooth enabled"

    // Create mock device
    const mockDevice = {
      id: "mock-device-1",
      name: "Mock sEMG Device",
      address: "00:11:22:33:44:55",
      connect: () => Promise.resolve(true),
      disconnect: () => Promise.resolve(true),
      write: () => Promise.resolve(true),
    } as unknown as BluetoothDevice

    this.selectedDevice = mockDevice
    this.connectionStatus.device = mockDevice

    debugLog("🔧 Mock Bluetooth enabled")
    this.notifyStatusChange()
  }

  connectToMockDevice(): void {
    if (!this.isMockMode) {
      this.startMockBluetooth()
    }

    this.connectionStatus.connected = true
    this.connectionStatus.message = "Connected to mock device"
    this.clearBuffers()

    debugLog("🔧 Mock device connected")
    this.notifyStatusChange()
  }

  async startMockStreaming(): Promise<boolean> {
    if (!this.connectionStatus.connected) {
      this.connectToMockDevice()
    }

    // Create mock session
    const sessionId = `mock-session-${Date.now()}`
    this.currentSession = {
      id: sessionId,
      deviceName: "Mock sEMG Device",
      deviceAddress: "00:11:22:33:44:55",
      startTime: Date.now(),
      sampleCount: 0,
    }
    this.sessions.unshift(this.currentSession)

    // Update status
    this.connectionStatus.streaming = true
    this.connectionStatus.message = "Mock streaming active"

    // Create API session for mock (same as real streaming)
    this.createApiSession(sessionId)

    // Start mock data generation at 1000Hz to simulate real HC-05 board
    this.mockStreamingInterval = setInterval(() => {
      if (this.connectionStatus.streaming) {
        const mockData = this.generateMockEmgData()
        this.processSampleData(mockData)
      }
    }, 1) // 1ms = 1000Hz (realistic sEMG sampling rate)

    // Start backend sync if enabled (for mock testing)
    if (this.backendSyncEnabled) {
      this.startBackendSync()
    }

    this.notifyStatusChange()
    this.notifySessionUpdate()

    debugLog("🔧 Mock streaming started at 1000Hz")
    return true
  }

  async stopMockStreaming(): Promise<boolean> {
    this.connectionStatus.streaming = false
    this.connectionStatus.message = "Mock streaming stopped"

    // Stop backend sync
    this.stopBackendSync()

    if (this.mockStreamingInterval) {
      clearInterval(this.mockStreamingInterval)
      this.mockStreamingInterval = null
    }

    // End session
    if (this.currentSession) {
      this.currentSession.endTime = Date.now()
      const sessionSampleCount = this.packetCount
      this.currentSession.sampleCount = sessionSampleCount
      const sessionId = this.currentSession.id
      
      debugLog(`📊 Mock session ending: ${sessionId} with ${sessionSampleCount} samples`)
      
      // End API session for mock (same as real streaming)
      this.endApiSession(sessionId, sessionSampleCount)
      
      this.currentSession = null
    }

    this.notifyStatusChange()
    this.notifySessionUpdate()

    debugLog("🔧 Mock streaming stopped")
    return true
  }

  disconnectMockDevice(): void {
    this.stopMockStreaming()
    this.connectionStatus.connected = false
    this.connectionStatus.device = null
    this.connectionStatus.message = "Mock device disconnected"
    this.selectedDevice = null

    debugLog("🔧 Mock device disconnected")
    this.notifyStatusChange()
  }

  private generateMockEmgData(): string {
    // Generate realistic sEMG signals for 10 channels
    const values: number[] = []
    const time = Date.now() / 1000 // Current time in seconds

    for (let channel = 0; channel < 10; channel++) {
      // Base frequency for each channel (slightly different for variety)
      const baseFreq = 20 + channel * 2 // 20-38 Hz range
      const amplitude = 50 + channel * 10 // Different amplitudes per channel
      const noise = (Math.random() - 0.5) * 20 // Random noise

      // Simulate muscle activation with varying intensities
      const activation = Math.sin(time * 0.5 + channel) * 0.5 + 0.5 // 0-1 range
      const burstPattern = Math.sin(time * baseFreq * 2 * Math.PI + channel)

      // Combine signals: base + burst pattern + noise, scaled by activation
      let signal = burstPattern * amplitude * activation + noise

      // Add occasional spikes (10% chance)
      if (Math.random() < 0.1) {
        signal += (Math.random() - 0.5) * amplitude * 2
      }

      // Clamp to realistic EMG range (-200 to +200 μV)
      signal = Math.max(-200, Math.min(200, signal))
      values.push(parseFloat(signal.toFixed(1)))
    }

    return values.join(" ")
  }

  // Backend sync functionality
  enableBackendSync(): void {
    this.backendSyncEnabled = true
    if (this.connectionStatus.streaming) {
      this.startBackendSync()
    }
    debugLog("Backend sync enabled")
  }

  disableBackendSync(): void {
    this.backendSyncEnabled = false
    this.stopBackendSync()
    debugLog("Backend sync disabled")
  }

  private startBackendSync(): void {
    if (this.backendSyncInterval) {
      debugLog("Backend sync already running")
      return
    }

    debugLog("Starting optimized backend sync for 1000Hz data...")
    
    // Optimized sync strategy for 1000Hz without data loss
    let syncInProgress = false
    
    this.backendSyncInterval = setInterval(async () => {
      // Skip if previous sync still running
      if (syncInProgress) return
      
      const queueSize = this.backendQueue.getSize()
      
      // Send when we have enough data (1000 samples = 1 second)
      if (queueSize >= 1000) {
        syncInProgress = true
        debugLog(`🔄 Backend sync triggered: ${queueSize} samples in queue`)
        
        // Send up to 3000 samples per batch (3 seconds of data)
        const batchSize = Math.min(queueSize, 3000)
        const batch = this.backendQueue.getLatest(batchSize)
        debugLog(`📦 Preparing batch of ${batchSize} samples from ${queueSize} total`)
        
        if (batch.length === 0) {
          syncInProgress = false
          return
        }
        
        // Create a copy for async operation
        const batchCopy = batch.map(sample => ({...sample}))
        
        try {
          // Send batch without blocking
          await this.sendBatchToBackend(batchCopy)
          
          // Remove sent samples from queue
          for (let i = 0; i < batchCopy.length; i++) {
            this.backendQueue.removeOldest()
          }
          
          debugLog(`✅ Sent ${batchCopy.length} samples | Queue: ${this.backendQueue.getSize()} | Total: ${this.totalSamplesProcessed}`)
        } catch (error) {
          debugError("❌ Backend sync failed:", error)
          // Keep data in queue for retry
        } finally {
          syncInProgress = false
        }
      }
    }, 1500) // Check every 1.5 seconds (balanced for 1kHz data)
  }

  private stopBackendSync(): void {
    if (this.backendSyncInterval) {
      clearInterval(this.backendSyncInterval)
      this.backendSyncInterval = null
      debugLog("Backend sync stopped")
    }
  }

  private async sendBatchToBackend(batch: SEmgSample[]): Promise<void> {
    if (!this.currentSession) {
      throw new Error("No active session")
    }

    debugLog(`📤 Sending batch of ${batch.length} samples to backend for session ${this.currentSession.id}`)

    const batchRequest = {
      sessionId: this.currentSession.id,
      samples: batch.map((sample) => ({
        timestamp: sample.timestamp,
        values: sample.values,
        sessionId: sample.sessionId,
      })),
      deviceInfo: {
        name: this.selectedDevice?.name || "Unknown",
        address: this.selectedDevice?.address || "Unknown",
      },
      batchInfo: {
        size: batch.length,
        startTime: batch[0]?.timestamp || Date.now(),
        endTime: batch[batch.length - 1]?.timestamp || Date.now(),
      },
    }

    debugLog(`🚀 Calling api.uploadBatch with ${batchRequest.samples.length} samples...`)
    const result = await api.uploadBatch(batchRequest)

    if (result.kind !== "ok") {
      debugError(`❌ Backend sync failed for ${batch.length} samples:`, result)
      if (result.kind === "unauthorized") {
        debugError(`❌ Unauthorized - token may have expired`)
      }
      throw new Error(`Backend sync failed: ${result.kind}`)
    }

    debugLog(`✅ Successfully sent ${batch.length} samples to backend`)
    debugLog(`📊 Backend response:`, result.data)
  }

  // Cleanup
  destroy(): void {
    this.stopStreaming()
    if (this.backendSyncInterval) {
      clearInterval(this.backendSyncInterval)
    }
    if (this.mockStreamingInterval) {
      clearInterval(this.mockStreamingInterval)
      this.mockStreamingInterval = null
    }
    debugLog("BluetoothDataService destroyed")
  }
}

// Singleton instance
export const bluetoothDataService = new BluetoothDataService()
