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
  private backendSyncEnabled = false
  private uiUpdateThrottle = 100 // Update UI every 100 samples (~10Hz)

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

  // Cleanup
  destroy(): void {
    this.stopStreaming()
    if (this.backendSyncInterval) {
      clearInterval(this.backendSyncInterval)
    }
    debugLog("BluetoothDataService destroyed")
  }
}

// Singleton instance
export const bluetoothDataService = new BluetoothDataService()
