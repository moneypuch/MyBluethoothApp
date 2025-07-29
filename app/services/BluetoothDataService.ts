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
  private backendQueue = new SEmgCircularBuffer(5000) // Backend upload queue

  // Performance counters (no MST reactivity)
  private totalSamplesProcessed = 0
  private packetCount = 0
  private downsampleCounter = 0
  private lastDataTimestamp = 0

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
  /**
   * CURRENT METHOD: Using basic device.connect() with default settings
   * - Uses default CONNECTOR_TYPE: "rfcomm"
   * - Uses default DELIMITER: "\n"
   * - Uses default READ_SIZE: 1024 bytes
   * - Uses default DEVICE_CHARSET: platform-specific
   *
   * ALTERNATIVE: Could use device.connect(options) with custom settings:
   * await device.connect({
   *   CONNECTOR_TYPE: 'rfcomm',
   *   DELIMITER: '\r\n',  // Match HC-05 line endings
   *   DEVICE_CHARSET: 'utf-8',
   *   READ_SIZE: 2048  // Larger buffer for 1000Hz data
   * })
   *
   * This might improve data reception rate if current 1000Hz is not achieved
   */
  async connectToDevice(device: BluetoothDevice): Promise<boolean> {
    try {
      this.connectionStatus.connecting = true
      this.connectionStatus.message = "Connecting..."
      this.notifyStatusChange()

      /**
       * READ_SIZE Calculation for 1000Hz streaming:
       * - Data format: "val1 val2 val3 ... val10\r\n"
       * - Average line size: ~51 bytes (10 values × 4 chars + 9 spaces + \r\n)
       * - Data rate: 1000 samples/sec × 51 bytes = 51,000 bytes/second
       * - 8192 bytes buffer = ~160 samples = 160ms of data
       *
       * Benefits of 8192:
       * - Large enough to prevent data loss from Bluetooth latency
       * - Small enough to maintain low latency (160ms max delay)
       * - Power of 2 for efficient memory allocation
       * - Handles burst data without overflow
       */
      const connected = await device.connect({
        delimiter: "\r\n", // Match HC-05 line endings (was using default '\n')
        readSize: 8192, // Increased from default 1024 for 1000Hz data
        charset: "utf-8",
      })

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
        this.startBackendSync()
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
      // Send stop command
      const success = await this.sendCommand("Stop")

      // Stop backend sync
      this.stopBackendSync()

      // Update status
      this.connectionStatus.streaming = false
      this.connectionStatus.message = "Streaming stopped"

      // End session
      if (this.currentSession) {
        this.currentSession.endTime = Date.now()
        this.currentSession.sampleCount = this.packetCount

        // End API session in background
        this.endApiSession(this.currentSession.id)

        this.currentSession = null
      }

      // Cleanup subscription
      if (this.dataSubscription) {
        this.dataSubscription.remove()
        this.dataSubscription = null
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
    if (!this.selectedDevice || !this.connectionStatus.connected) {
      return false
    }

    try {
      // Use slow write for HC-05 compatibility
      for (const char of command) {
        await this.selectedDevice.write(char)
        await new Promise((res) => setTimeout(res, 50))
      }
      await this.selectedDevice.write("\r")

      debugLog(`Command sent: ${command}`)
      return true
    } catch (error: any) {
      debugError("Command error:", error)
      return false
    }
  }

  /**
   * CURRENT METHOD: Using onDataReceived event listener
   * - Asynchronous event-driven approach
   * - Data arrives as it's received from the device
   * - Splits by \r\n which may not match default \n delimiter
   *
   * ISSUES THAT MAY AFFECT 1000Hz:
   * 1. Default delimiter mismatch (\n vs \r\n)
   * 2. Default READ_SIZE of 1024 bytes may be too small for 1000Hz data
   * 3. Data may be buffered/chunked by the native layer
   *
   * ALTERNATIVES:
   * 1. Use read() in a loop:
   *    while (streaming) {
   *      const message = await device.read()
   *      processData(message.data)
   *    }
   *
   * 2. Use readUntilDelimiter() for precise line reading:
   *    const line = await device.readUntilDelimiter('\r\n')
   *
   * 3. Check available() before reading:
   *    if (await device.available() > 0) {
   *      const data = await device.read()
   *    }
   *
   * 4. Configure connection with matching delimiter:
   *    device.connect({ DELIMITER: '\r\n', READ_SIZE: 4096 })
   */
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

        const result = await api.createSession(sessionRequest)
        if (result.kind === "ok") {
          debugLog("API session created successfully")
        } else {
          debugWarn("Failed to create API session, continuing locally")
        }
      } catch (error) {
        debugError("Failed to create API session:", error)
      }
    }, 0)
  }

  private endApiSession(sessionId: string): void {
    setTimeout(async () => {
      try {
        const endData = {
          endTime: new Date().toISOString(),
          totalSamples: this.packetCount,
        }

        const result = await api.endSession(sessionId, endData)
        if (result.kind === "ok") {
          debugLog("API session ended successfully")
        } else {
          debugWarn("Failed to end API session")
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

    // Start mock data generation at 100Hz for better testing
    // Note: Real hardware would send at 1000Hz, but for mock we use 100Hz to avoid overwhelming
    this.mockStreamingInterval = setInterval(() => {
      if (this.connectionStatus.streaming) {
        const mockData = this.generateMockEmgData()
        this.processSampleData(mockData)
      }
    }, 10) // 10ms = 100Hz (increased from 10Hz for better testing)

    // Start backend sync if enabled (for mock testing)
    if (this.backendSyncEnabled) {
      this.startBackendSync()
    }

    this.notifyStatusChange()
    this.notifySessionUpdate()

    debugLog("🔧 Mock streaming started at 100Hz")
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
      this.currentSession.sampleCount = this.packetCount
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
    // Generate realistic sEMG signals for 10 channels in the range 1-5000
    const values: number[] = []
    const time = Date.now() / 1000 // Current time in seconds

    for (let channel = 0; channel < 10; channel++) {
      // Base value around middle of range
      const baseValue = 2500
      // Base frequency for each channel (slightly different for variety)
      const baseFreq = 20 + channel * 2 // 20-38 Hz range
      const amplitude = 500 + channel * 100 // Different amplitudes per channel
      const noise = (Math.random() - 0.5) * 200 // Random noise

      // Simulate muscle activation with varying intensities
      const activation = Math.sin(time * 0.5 + channel) * 0.5 + 0.5 // 0-1 range
      const burstPattern = Math.sin(time * baseFreq * 2 * Math.PI + channel)

      // Combine signals: base + burst pattern + noise, scaled by activation
      let signal = baseValue + burstPattern * amplitude * activation + noise

      // Add occasional spikes (10% chance)
      if (Math.random() < 0.1) {
        signal += (Math.random() - 0.5) * amplitude * 2
      }

      // Clamp to data range (1 to 5000)
      signal = Math.max(1, Math.min(5000, signal))
      values.push(Math.round(signal))
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

    debugLog("Starting backend sync...")
    this.backendSyncInterval = setInterval(() => {
      // Use setTimeout to avoid blocking the main thread
      setTimeout(async () => {
        if (this.backendQueue.getSize() >= 500) {
          // Larger batches, less frequent
          const batch = this.backendQueue.getLatest(500)
          const batchCopy = [...batch] // Copy to avoid issues if queue is cleared

          try {
            await this.sendBatchToBackend(batchCopy)
            // Clear queue only after successful send
            this.backendQueue.clear()
            debugLog(`Successfully sent ${batchCopy.length} samples to backend`)
          } catch (error) {
            debugError("Backend sync failed:", error)
            // Re-add to queue on failure if there's space
            if (this.backendQueue.getSize() + batchCopy.length <= 5000) {
              batchCopy.forEach((sample) => this.backendQueue.push(sample))
            }
          }
        }
      }, 0)
    }, 5000) // Sync every 5 seconds instead of every second
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

    const result = await api.uploadBatch(batchRequest)

    if (result.kind !== "ok") {
      throw new Error("Backend sync failed")
    }
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
