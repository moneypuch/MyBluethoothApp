// app/services/BluetoothDataService.ts
/**
 * High-performance Bluetooth data service for high-frequency data streaming
 * - sEMG (HC-05): 1000Hz with 10 channels
 * - IMU: 100Hz with 9 channels (Accel XYZ, Gyro XYZ, Mag XYZ)
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
  deviceType?: "HC-05" | "IMU" | null
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
  private backendQueue: SEmgSample[] = [] // FIFO queue for backend upload

  // Performance counters (no MST reactivity)
  private totalSamplesProcessed = 0
  private packetCount = 0
  private downsampleCounter = 0
  private lastDataTimestamp = 0
  private pollingStartTime = 0
  private samplesPerSecondActual = 0
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
  private pollingInterval: NodeJS.Timeout | null = null
  private isPolling = false
  private dataBuffer = "" // Buffer for incomplete lines in polling mode

  // Event callbacks for UI updates (throttled)
  private onStatusChange?: (status: BluetoothConnectionStatus) => void
  private onDataUpdate?: (stats: DataStatistics) => void
  private onSessionUpdate?: (sessions: SessionInfo[]) => void

  // Configuration
  private backendSyncEnabled = true // Enabled with new non-blocking architecture
  private uiUpdateThrottle = 100 // Update UI every 100 samples (~10Hz)
  private usePollingMode = false // Temporarily disable polling to debug - back to events

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
        delimiter: "", // No delimiter for maximum speed
        readSize: 512, // Smaller buffer for lower latency
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
      // Ensure clean state before starting
      if (this.dataSubscription) {
        debugLog("Cleaning up existing data subscription...")
        this.dataSubscription.remove()
        this.dataSubscription = null
      }

      // Clear any residual data buffer
      this.dataBuffer = ""

      // Send start command
      const success = await this.sendCommand("Start")
      if (!success) return false

      // Create session immediately (non-blocking)
      const sessionId = `session_${Date.now()}_${Date.now().toString(36)}`

      // Detect device type based on device name
      const deviceName = this.selectedDevice.name || "Unknown"
      let deviceType: "HC-05" | "IMU" | null = null
      if (deviceName.toLowerCase().includes("hc-05") || deviceName.toLowerCase().includes("hc05")) {
        deviceType = "HC-05"
      } else if (deviceName.toLowerCase().includes("imu")) {
        deviceType = "IMU"
      }

      this.currentSession = {
        id: sessionId,
        deviceName: deviceName,
        deviceAddress: this.selectedDevice.address,
        deviceType: deviceType,
        startTime: Date.now(),
        sampleCount: 0,
      }
      this.sessions.unshift(this.currentSession)

      // Update status
      this.connectionStatus.streaming = true
      this.connectionStatus.message = "Streaming active"

      // Setup data listener (fresh subscription)
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

      // Update status to indicate we're flushing data
      this.connectionStatus.streaming = false
      this.connectionStatus.message = "Flushing remaining data..."
      this.notifyStatusChange()

      // Flush all remaining data in the backend queue before stopping (blocking to ensure completion)
      await this.flushBackendQueue()

      // Now stop backend sync
      this.stopBackendSync()

      // Cleanup subscription and polling BEFORE setting final status
      if (this.dataSubscription) {
        this.dataSubscription.remove()
        this.dataSubscription = null
      }

      // Stop polling if active
      if (this.isPolling) {
        this.stopPolling()
      }

      // HC-05 Reset: Send additional stop command to ensure HC-05 is in clean state
      debugLog("Sending HC-05 reset sequence...")
      await new Promise((resolve) => setTimeout(resolve, 100)) // Small delay
      await this.sendCommand("Stop") // Double stop command for HC-05 reliability
      await new Promise((resolve) => setTimeout(resolve, 100)) // Small delay

      // Update final status
      this.connectionStatus.message = "Streaming stopped"

      // End session AFTER flushing is complete
      if (this.currentSession) {
        this.currentSession.endTime = Date.now()
        this.currentSession.sampleCount = this.packetCount

        // End API session in background
        this.endApiSession(this.currentSession.id)

        this.currentSession = null
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

      // Performance monitoring: Calculate actual samples per second every 5 seconds
      const now = Date.now()
      if (now - this.lastFrequencyCheck >= 5000) {
        const timeDiff = (now - this.lastFrequencyCheck) / 1000 // seconds
        const recentSamples = this.totalSamplesProcessed - this.samplesPerSecondActual * timeDiff
        this.samplesPerSecondActual =
          this.totalSamplesProcessed / ((now - this.pollingStartTime) / 1000)
        const recentHz = recentSamples / timeDiff

        debugLog(
          `📊 PERFORMANCE: ${recentHz.toFixed(1)} Hz recent, ${this.samplesPerSecondActual.toFixed(1)} Hz average (target: 1000 Hz)`,
        )
        debugLog(
          `📊 Total samples: ${this.totalSamplesProcessed}, Session time: ${((now - this.pollingStartTime) / 1000).toFixed(1)}s`,
        )
        this.lastFrequencyCheck = now
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
   * NEW POLLING APPROACH: Continuously read data using device.read()
   * - Bypasses JavaScript bridge event limitations (~60Hz max)
   * - Uses direct read() calls for maximum data throughput
   * - Handles partial data with buffer accumulation
   * - Should achieve true 1000Hz data reception
   */
  private setupDataListener(): void {
    if (!this.selectedDevice) return

    if (this.usePollingMode) {
      debugLog("Setting up high-frequency polling mode for 1000Hz...")
      this.startPolling()
    } else {
      debugLog("Setting up event-driven mode...")
      this.pollingStartTime = Date.now() // For performance monitoring
      this.lastFrequencyCheck = Date.now()

      this.dataSubscription = this.selectedDevice.onDataReceived((event) => {
        const receivedData = event.data

        if (receivedData && typeof receivedData === "string") {
          // Add to buffer
          this.dataBuffer += receivedData

          // Process complete samples with robust parsing
          this.processBufferedData()
        }
      })
    }
  }

  /**
   * High-frequency polling loop to achieve 1000Hz data reception
   * - Polls every 1ms to ensure no data is missed
   * - Accumulates partial data in buffer
   * - Processes complete lines when \r\n delimiter is found
   */
  private startPolling(): void {
    if (this.isPolling || !this.selectedDevice) return

    this.isPolling = true
    this.dataBuffer = ""
    this.pollingStartTime = Date.now()
    this.lastFrequencyCheck = Date.now()

    debugLog("Starting polling loop for 1000Hz data...")

    const poll = async () => {
      if (!this.isPolling || !this.selectedDevice || !this.connectionStatus.streaming) {
        return
      }

      try {
        // Check if data is available
        const available = await this.selectedDevice.available()
        if (available > 0) {
          // Read available data
          const result = await this.selectedDevice.read()
          if (result && typeof result === "string") {
            // Add to buffer
            this.dataBuffer += result

            // Process complete lines
            const lines = this.dataBuffer.split("\r\n")

            // Keep last incomplete line in buffer
            this.dataBuffer = lines.pop() || ""

            // Process complete lines
            lines.forEach((line) => {
              if (line.trim().length > 0) {
                this.processSampleData(line.trim())
              }
            })
          }
        }
      } catch (error) {
        debugError("Polling error:", error)
        // Continue polling despite errors
      }

      // Schedule next poll - aggressive 1ms polling for maximum throughput
      if (this.isPolling) {
        this.pollingInterval = setTimeout(poll, 1)
      }
    }

    // Start polling
    poll()
  }

  private stopPolling(): void {
    this.isPolling = false

    if (this.pollingInterval) {
      clearTimeout(this.pollingInterval)
      this.pollingInterval = null
    }

    // Process any remaining data in buffer
    if (this.dataBuffer.trim().length > 0) {
      this.processSampleData(this.dataBuffer.trim())
      this.dataBuffer = ""
    }

    debugLog("Polling stopped")
  }

  /**
   * Robust data processing for incomplete/corrupted Bluetooth streams
   * Handles cases like: "2348 2348 2348 2" and reconstructs missing data
   */
  private processBufferedData(): void {
    // Prevent blocking - process in chunks with yielding
    setTimeout(() => {
      this.doProcessBufferedData()
    }, 0)
  }

  private doProcessBufferedData(): void {
    if (!this.dataBuffer || this.dataBuffer.length === 0) {
      return
    }

    // Strategy 1: Look for complete 10-number samples first
    const completePattern = /(\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+)[\r\n\s]*/g
    let match
    let lastProcessedIndex = 0
    let samplesFound = 0

    // Process all complete samples
    while ((match = completePattern.exec(this.dataBuffer)) !== null) {
      this.processSampleData(match[1])
      lastProcessedIndex = match.index + match[0].length
      samplesFound++
    }

    // Remove processed complete samples from buffer
    if (lastProcessedIndex > 0) {
      this.dataBuffer = this.dataBuffer.substring(lastProcessedIndex)
    }

    // Strategy 2: Handle partial/corrupted data
    if (this.dataBuffer.length > 100) {
      // Buffer getting large, need to process partial data
      this.processPartialData()
    }

    // Strategy 3: Buffer overflow protection
    if (this.dataBuffer.length > 500) {
      debugWarn(`Buffer overflow protection: clearing ${this.dataBuffer.length} chars`)
      // Keep only the last 100 characters which might contain a partial sample
      this.dataBuffer = this.dataBuffer.slice(-100)
    }

    // Debug logging every 50 samples to reduce noise
    if (samplesFound > 0 && this.totalSamplesProcessed % 50 === 0) {
      debugLog(
        `📡 Processed ${samplesFound} samples, ${this.totalSamplesProcessed} total, buffer: ${this.dataBuffer.length} chars`,
      )
    }
  }

  private processPartialData(): void {
    // Extract all numbers from the buffer
    const numbers = this.dataBuffer.match(/\d+/g)
    if (!numbers || numbers.length < 10) {
      return // Not enough data to form even one sample
    }

    // Process complete groups of 10 numbers
    let processedNumbers = 0
    while (numbers.length >= 10) {
      const sampleNumbers = numbers.splice(0, 10)
      const sampleLine = sampleNumbers.join(" ")
      this.processSampleData(sampleLine)
      processedNumbers += 10
    }

    // Reconstruct buffer with remaining numbers and non-numeric characters
    if (numbers.length > 0) {
      // Keep remaining numbers for next processing cycle
      this.dataBuffer = numbers.join(" ")
    } else {
      // Clear buffer if all numbers were processed
      this.dataBuffer = ""
    }

    if (processedNumbers > 0) {
      debugLog(`🔧 Recovered ${processedNumbers / 10} samples from partial data`)
    }
  }

  private clearBuffers(): void {
    this.buffer1kHz.clear()
    this.buffer100Hz.clear()
    this.buffer10Hz.clear()
    this.backendQueue = [] // Clear array
    this.totalSamplesProcessed = 0
    this.packetCount = 0
    this.downsampleCounter = 0
    this.lastDataTimestamp = 0
    this.dataBuffer = "" // Reset polling buffer
  }

  private createApiSession(sessionId: string): void {
    if (!this.selectedDevice) return

    setTimeout(async () => {
      try {
        // Detect device type for API
        const deviceName = this.selectedDevice?.name || "Unknown Device"
        let deviceType: "HC-05" | "IMU" | null = null
        if (
          deviceName.toLowerCase().includes("hc-05") ||
          deviceName.toLowerCase().includes("hc05")
        ) {
          deviceType = "HC-05"
        } else if (deviceName.toLowerCase().includes("imu")) {
          deviceType = "IMU"
        }

        const sessionRequest = {
          sessionId: sessionId,
          deviceId: this.selectedDevice?.address || "unknown",
          deviceName: deviceName,
          deviceType: deviceType,
          startTime: new Date().toISOString(),
          sampleRate: deviceType === "IMU" ? 100 : 1000, // IMU: 100Hz, sEMG: 1000Hz
          channelCount: deviceType === "IMU" ? 9 : 10, // IMU has 9 channels, HC-05 has 10
          metadata: {
            appVersion: "1.0.0",
            deviceInfo: {
              name: this.selectedDevice?.name,
              address: this.selectedDevice?.address,
              type: deviceType,
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
      deviceType: "HC-05", // Mock as HC-05 device
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

  // Get expected sample rate based on device type
  private getExpectedSampleRate(): number {
    if (!this.selectedDevice?.name) return 1000 // Default to sEMG rate

    const deviceName = this.selectedDevice.name.toLowerCase()
    if (deviceName.includes("imu")) {
      return 100 // IMU devices typically run at 100Hz
    } else {
      return 1000 // sEMG devices run at 1000Hz
    }
  }

  // Utility method to check if backend is working
  isBackendWorking(): boolean {
    return this.backendSyncEnabled
  }

  // Get current queue size for monitoring
  getBackendQueueSize(): number {
    return this.backendQueue.length
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
        const queueSize = this.backendQueue.length
        if (queueSize > 0) {
          // Send all available samples, up to 500 at a time
          const batchSize = Math.min(queueSize, 500)
          const batch = this.backendQueue.slice(0, batchSize)

          try {
            await this.sendBatchToBackend(batch)
            // Remove only the sent samples from the beginning
            this.backendQueue.splice(0, batchSize)

            debugLog(
              `Successfully sent ${batch.length} samples to backend, ${this.backendQueue.length} remaining in queue`,
            )
          } catch (error) {
            debugError("Backend sync failed:", error)
            // Data stays in queue for next attempt
          }
        }
      }, 0)
    }, 2000) // Check every 2 seconds for more responsive syncing
  }

  private stopBackendSync(): void {
    if (this.backendSyncInterval) {
      clearInterval(this.backendSyncInterval)
      this.backendSyncInterval = null
      debugLog("Backend sync stopped")
    }
  }

  private async flushBackendQueue(): Promise<void> {
    const initialCount = this.backendQueue.length
    debugLog(`Flushing ${initialCount} remaining samples to backend...`)

    // If backend is not working, just clear the queue to avoid blocking
    if (!this.backendSyncEnabled) {
      debugWarn("Backend sync disabled, clearing queue without sending")
      this.backendQueue = []
      return
    }

    let retryCount = 0
    const maxRetries = 3

    while (this.backendQueue.length > 0 && retryCount < maxRetries) {
      // Send all remaining samples, up to 500 at a time
      const batchSize = Math.min(this.backendQueue.length, 500)
      const batch = this.backendQueue.slice(0, batchSize)

      try {
        await this.sendBatchToBackend(batch)
        // Remove only the sent samples from the beginning
        this.backendQueue.splice(0, batchSize)

        debugLog(
          `Flushed ${batch.length} samples to backend, ${this.backendQueue.length} remaining`,
        )
        retryCount = 0 // Reset retry count on success
      } catch (error) {
        debugError(`Flush failed (attempt ${retryCount + 1}/${maxRetries}):`, error)
        retryCount++

        // If max retries reached, clear the queue to avoid infinite blocking
        if (retryCount >= maxRetries) {
          debugWarn(
            `Backend unreachable after ${maxRetries} attempts, clearing ${this.backendQueue.length} samples from queue`,
          )
          this.backendQueue = []
          break
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }
    }

    debugLog("Backend queue flush completed")
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
