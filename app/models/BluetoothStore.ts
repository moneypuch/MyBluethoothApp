// app/models/BluetoothStore.ts
import { Instance, SnapshotIn, SnapshotOut, types, flow } from "mobx-state-tree"
import RNBluetoothClassic, {
  BluetoothDevice,
  BluetoothEventSubscription,
} from "react-native-bluetooth-classic"
import { Platform, PermissionsAndroid } from "react-native"
import { SEmgCircularBuffer, type SEmgSample } from "@/utils/CircularBuffer"

// MST model for Bluetooth Session
export const BluetoothSessionModel = types.model("BluetoothSession", {
  id: types.string,
  deviceName: types.string,
  deviceAddress: types.string,
  startTime: types.number,
  endTime: types.maybe(types.number),
  sampleCount: types.number,
})

export const BluetoothStoreModel = types
  .model("BluetoothStore", {
    // Connection state
    bluetoothEnabled: types.optional(types.boolean, false),
    connected: types.optional(types.boolean, false),
    isConnecting: types.optional(types.boolean, false),
    statusMessage: types.optional(types.string, ""),

    // Data streaming state
    isStreaming: types.optional(types.boolean, false),
    currentSessionId: types.maybeNull(types.string),
    packetCount: types.optional(types.number, 0),

    // Command state
    isSending: types.optional(types.boolean, false),

    // Sessions
    sessions: types.optional(types.array(BluetoothSessionModel), []),

    // Device connection configuration
    delimiter: types.optional(types.string, "\r\n"),
    encoding: types.optional(types.string, "utf-8"),

    // Device management (observable for UI reactivity)
    pairedDevices: types.optional(types.array(types.frozen<BluetoothDevice>()), []),
    selectedDevice: types.maybeNull(types.frozen<BluetoothDevice>()),

    // Performance counters (observable for UI updates)
    downsampleCounter: types.optional(types.number, 0),
    totalSamplesProcessed: types.optional(types.number, 0),
    bufferOverflowCount: types.optional(types.number, 0),

    // Buffer update triggers (observable - increment on buffer changes to trigger UI reactivity)
    buffer1kHzUpdateCount: types.optional(types.number, 0),
    buffer100HzUpdateCount: types.optional(types.number, 0),
    buffer10HzUpdateCount: types.optional(types.number, 0),
    lastDataTimestamp: types.optional(types.number, 0),
  })
  .volatile((_self) => ({
    // High-performance circular buffers (O(1) operations) - Non-observable by design
    buffer1kHz: new SEmgCircularBuffer(10000), // 10 seconds at 1kHz
    buffer100Hz: new SEmgCircularBuffer(6000), // 60 seconds at 100Hz
    buffer10Hz: new SEmgCircularBuffer(3600), // 360 seconds (6 minutes) at 10Hz
    backendQueue: new SEmgCircularBuffer(5000), // Backend upload queue

    // Configuration
    MAX_1KHZ: 10000,
    MAX_100HZ: 6000,
    MAX_10HZ: 3600,

    // Subscription management
    dataSubscription: null as BluetoothEventSubscription | null,
    backendSyncInterval: null as NodeJS.Timeout | null,

    // Mock testing support
    mockStreamingInterval: null as NodeJS.Timeout | null,
  }))
  .views((self) => ({
    get latest1kHzSamples(): SEmgSample[] {
      // Include reactive trigger to ensure UI updates when buffer changes
      if (self.buffer1kHzUpdateCount >= 0) {
        return self.buffer1kHz.getLatest(10)
      }
      return []
    },

    get latest100HzSamples(): SEmgSample[] {
      // Include reactive trigger to ensure UI updates when buffer changes
      if (self.buffer100HzUpdateCount >= 0) {
        return self.buffer100Hz.getLatest(10)
      }
      return []
    },

    get all1kHzSamples(): SEmgSample[] {
      // Include reactive trigger to ensure UI updates when buffer changes
      if (self.buffer1kHzUpdateCount >= 0) {
        return self.buffer1kHz.getAll()
      }
      return []
    },

    get all100HzSamples(): SEmgSample[] {
      // Include reactive trigger to ensure UI updates when buffer changes
      if (self.buffer100HzUpdateCount >= 0) {
        return self.buffer100Hz.getAll()
      }
      return []
    },

    get all10HzSamples(): SEmgSample[] {
      // Include reactive trigger to ensure UI updates when buffer changes
      if (self.buffer10HzUpdateCount >= 0) {
        return self.buffer10Hz.getAll()
      }
      return []
    },

    get pairedDevicesList(): BluetoothDevice[] {
      return self.pairedDevices.slice()
    },

    get currentDevice(): BluetoothDevice | null {
      return self.selectedDevice
    },

    get connectionStatus() {
      return {
        enabled: self.bluetoothEnabled,
        connected: self.connected,
        connecting: self.isConnecting,
        streaming: self.isStreaming,
        sending: self.isSending,
        device: self.selectedDevice,
        message: self.statusMessage,
        packetCount: self.packetCount,
        buffer1kHzCount: self.buffer1kHz.getSize(),
        buffer100HzCount: self.buffer100Hz.getSize(),
        buffer10HzCount: self.buffer10Hz.getSize(),
        lastUpdate: self.lastDataTimestamp, // Make status reactive to data changes
        samplesPerSecond: self.isStreaming ? 1000 : 0,
        bufferStats: {
          realTime: self.buffer1kHz.getStats(),
          mediumTerm: self.buffer100Hz.getStats(),
          longTerm: self.buffer10Hz.getStats(),
        },
        performance: {
          totalProcessed: self.totalSamplesProcessed,
          bufferOverflows: self.bufferOverflowCount,
        },
        pairedDevicesCount: self.pairedDevices.length,
      }
    },
  }))
  .actions((self) => {
    return {
      // Basic state setters
      setBluetoothEnabled(enabled: boolean) {
        self.bluetoothEnabled = enabled
      },

      setConnected(connected: boolean) {
        self.connected = connected
      },

      setConnecting(connecting: boolean) {
        self.isConnecting = connecting
      },

      setStreaming(streaming: boolean) {
        self.isStreaming = streaming
      },

      setSending(sending: boolean) {
        self.isSending = sending
      },

      setStatusMessage(message: string) {
        self.statusMessage = message
      },

      setPairedDevices(devices: BluetoothDevice[]) {
        self.pairedDevices.replace(devices)
      },

      setSelectedDevice(device: BluetoothDevice | null) {
        self.selectedDevice = device
      },

      setCurrentSessionId(sessionId: string | null) {
        self.currentSessionId = sessionId
      },

      setSessions(sessions: any[]) {
        self.sessions.replace(sessions)
      },

      setDelimiter(delimiter: string) {
        self.delimiter = delimiter
      },

      setEncoding(encoding: string) {
        self.encoding = encoding
      },

      // CRITICAL: High-performance data processing with O(1) circular buffer operations
      processSampleData(line: string) {
        if (!line || !self.currentSessionId) return

        const values = line
          .split(/\s+/)
          .map((n) => Number(n))
          .filter((n) => !isNaN(n))

        if (values.length === 10) {
          const sample: SEmgSample = {
            timestamp: Date.now(),
            values,
            sessionId: self.currentSessionId,
          }

          // Add to 1kHz buffer - O(1) operation!
          self.buffer1kHz.push(sample)
          self.totalSamplesProcessed++
          
          // Only trigger UI reactivity every 50 samples (throttle to ~2Hz UI updates)
          if (self.totalSamplesProcessed % 50 === 0) {
            self.buffer1kHzUpdateCount++ // Trigger UI reactivity
          }
          self.lastDataTimestamp = sample.timestamp

          // Update packet count (for UI display)
          self.packetCount++

          // Downsample for 100Hz buffer (every 10th sample)
          self.downsampleCounter++
          if (self.downsampleCounter >= 10) {
            self.buffer100Hz.push(sample) // O(1) operation!
            self.buffer100HzUpdateCount++ // Trigger UI reactivity
            self.downsampleCounter = 0

            // Downsample for 10Hz buffer (every 100th sample from 1kHz)
            if (self.totalSamplesProcessed % 100 === 0) {
              self.buffer10Hz.push(sample) // O(1) operation!
              self.buffer10HzUpdateCount++ // Trigger UI reactivity
            }
          }

          // Add to backend queue if streaming (O(1) operation!)
          if (self.isStreaming) {
            self.backendQueue.push(sample)
          }
        }
      },

      // Clear buffers action - O(1) operations!
      clearBuffersAction() {
        self.buffer1kHz.clear()
        self.buffer100Hz.clear()
        self.buffer10Hz.clear()
        self.backendQueue.clear()
        self.downsampleCounter = 0
        self.packetCount = 0
        self.totalSamplesProcessed = 0
        self.bufferOverflowCount = 0
        // Reset update counters to trigger UI refresh
        self.buffer1kHzUpdateCount = 0
        self.buffer100HzUpdateCount = 0
        self.buffer10HzUpdateCount = 0
        self.lastDataTimestamp = 0
      },

      // Utility methods - High performance data access with reactivity
      getLatestSamples(count: number, frequency: "1kHz" | "100Hz" | "10Hz" = "1kHz"): SEmgSample[] {
        // Access reactive counters to trigger UI updates
        const updateCount =
          frequency === "1kHz"
            ? self.buffer1kHzUpdateCount
            : frequency === "100Hz"
              ? self.buffer100HzUpdateCount
              : self.buffer10HzUpdateCount

        if (updateCount >= 0) {
          const buffer =
            frequency === "1kHz"
              ? self.buffer1kHz
              : frequency === "100Hz"
                ? self.buffer100Hz
                : self.buffer10Hz
          return buffer.getLatest(count) // O(count) operation, not O(buffer_size)!
        }
        return []
      },

      // High-performance channel statistics using circular buffer's built-in methods
      getChannelStatistics(sampleCount: number = 1000) {
        try {
          // Include reactive trigger to ensure UI updates when buffer changes
          if (self.buffer1kHzUpdateCount >= 0) {
            const stats: Record<
              string,
              { min: number; max: number; avg: number; rms: number; count: number }
            > = {}

            for (let ch = 0; ch < 10; ch++) {
              // Use the circular buffer's optimized statistics method
              const channelStats = self.buffer1kHz.getChannelStatistics(ch, sampleCount)
              stats[`ch${ch}`] = channelStats
            }

            return stats
          }
          return {}
        } catch (error) {
          console.error("Error calculating channel statistics:", error)
          const defaultStats: Record<
            string,
            { min: number; max: number; avg: number; rms: number; count: number }
          > = {}
          for (let i = 0; i < 10; i++) {
            defaultStats[`ch${i}`] = { min: 0, max: 0, avg: 0, rms: 0, count: 0 }
          }
          return defaultStats
        }
      },

      // Chart data methods for high-performance visualization with reactivity
      getChartData(
        channel: number,
        count?: number,
        frequency: "1kHz" | "100Hz" | "10Hz" = "1kHz",
      ): Array<{ x: number; y: number }> {
        // Access reactive counters to trigger UI updates
        const updateCount =
          frequency === "1kHz"
            ? self.buffer1kHzUpdateCount
            : frequency === "100Hz"
              ? self.buffer100HzUpdateCount
              : self.buffer10HzUpdateCount

        if (updateCount >= 0) {
          const buffer =
            frequency === "1kHz"
              ? self.buffer1kHz
              : frequency === "100Hz"
                ? self.buffer100Hz
                : self.buffer10Hz
          return buffer.getChartData(channel, count)
        }
        return []
      },

      getDownsampledChartData(
        channel: number,
        maxPoints: number = 1000,
        timeRange?: { start: number; end: number },
        frequency: "1kHz" | "100Hz" | "10Hz" = "1kHz",
      ): Array<{ x: number; y: number }> {
        const buffer =
          frequency === "1kHz"
            ? self.buffer1kHz
            : frequency === "100Hz"
              ? self.buffer100Hz
              : self.buffer10Hz
        return buffer.getDownsampledChartData(channel, maxPoints, timeRange)
      },

      // Get data for a specific time range
      getTimeRangeData(
        startTime: number,
        endTime: number,
        frequency: "1kHz" | "100Hz" | "10Hz" = "1kHz",
      ): SEmgSample[] {
        const buffer =
          frequency === "1kHz"
            ? self.buffer1kHz
            : frequency === "100Hz"
              ? self.buffer100Hz
              : self.buffer10Hz
        return buffer.getTimeRange(startTime, endTime)
      },

      // Get buffer performance statistics
      getBufferStats() {
        return {
          buffer1kHz: self.buffer1kHz.getStats(),
          buffer100Hz: self.buffer100Hz.getStats(),
          buffer10Hz: self.buffer10Hz.getStats(),
          backendQueue: self.backendQueue.getStats(),
          performance: {
            totalSamplesProcessed: self.totalSamplesProcessed,
            bufferOverflows: self.bufferOverflowCount,
            samplesPerSecond: self.isStreaming ? 1000 : 0,
          },
        }
      },

      // Main actions with flow
      checkBluetooth: flow(function* () {
        try {
          // Request permissions
          let hasPermissions = true
          if (Platform.OS === "android") {
            try {
              if (Platform.Version >= 31) {
                const permissions = yield PermissionsAndroid.requestMultiple([
                  PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                  PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                  PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                ])
                hasPermissions = Object.values(permissions).every(
                  (p) => p === PermissionsAndroid.RESULTS.GRANTED,
                )
              } else {
                const permissions = yield PermissionsAndroid.requestMultiple([
                  PermissionsAndroid.PERMISSIONS.BLUETOOTH,
                  PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADMIN,
                  PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
                ])
                hasPermissions = Object.values(permissions).every(
                  (p) => p === PermissionsAndroid.RESULTS.GRANTED,
                )
              }
            } catch (error) {
              console.warn("Permission request failed:", error)
              hasPermissions = false
            }
          }

          if (!hasPermissions) {
            self.statusMessage = "Bluetooth permissions not granted"
            return
          }

          const enabled = yield RNBluetoothClassic.isBluetoothEnabled()
          self.bluetoothEnabled = enabled

          if (enabled) {
            const paired = yield RNBluetoothClassic.getBondedDevices()
            self.pairedDevices.replace(paired || [])
            self.statusMessage = `Found ${(paired || []).length} paired devices`
          } else {
            self.statusMessage = "Bluetooth not enabled"
          }
        } catch (error: any) {
          console.error("Bluetooth check error:", error)
          self.statusMessage = `Bluetooth check error: ${error.message}`
        }
      }),

      connectToDevice: flow(function* (device: BluetoothDevice) {
        if (self.isConnecting) return

        self.isConnecting = true
        self.statusMessage = "Connecting..."

        try {
          const connected = yield device.connect()

          self.connected = connected
          self.selectedDevice = device
          self.statusMessage = connected
            ? `Connected to ${device.name || device.address}`
            : "Connection failed"

          if (connected) {
            // Clear buffers - O(1) operations!
            self.buffer1kHz.clear()
            self.buffer100Hz.clear()
            self.buffer10Hz.clear()
            self.backendQueue.clear()
            self.downsampleCounter = 0
            self.packetCount = 0
            self.totalSamplesProcessed = 0
          }
        } catch (error: any) {
          console.error("Connection error:", error)
          self.statusMessage = `Connection error: ${error.message}`
          self.connected = false
          self.selectedDevice = null
        } finally {
          self.isConnecting = false
        }
      }),

      disconnectDevice: flow(function* () {
        try {
          if (self.selectedDevice && self.connected) {
            self.isStreaming = false

            if (self.dataSubscription) {
              self.dataSubscription.remove()
              self.dataSubscription = null
            }

            yield self.selectedDevice.disconnect()
            self.statusMessage = `Disconnected`
          }
        } catch (error) {
          console.warn("Disconnect error:", error)
        }

        self.connected = false
        self.selectedDevice = null
      }),

      sendCommand: flow(function* (command: string) {
        if (!self.selectedDevice || !self.connected) {
          self.statusMessage = "No device connected"
          return false
        }

        // Check if this is a real device (not mock)
        const isRealDevice = self.selectedDevice.address !== "00:11:22:33:44:55"
        console.log("=== DEVICE TYPE CHECK ===")
        console.log("Device name:", self.selectedDevice.name)
        console.log("Device address:", self.selectedDevice.address)
        console.log("Is real device:", isRealDevice)

        const fullCommand = command + self.delimiter
        self.isSending = true

        try {
          console.log("=== SENDING COMMAND ===")
          console.log("Command:", command)
          console.log("Current delimiter:", JSON.stringify(self.delimiter))
          console.log("Full command with delimiter:", JSON.stringify(fullCommand))
          console.log("Encoding:", self.encoding)
          
          const writeResult = yield self.selectedDevice.write(fullCommand, self.encoding as "utf-8")
          console.log("Write result:", writeResult)
          console.log("Command sent successfully!")
          self.statusMessage = `Command sent: ${command}`

          // Handle Start/Stop commands
          if (command.toLowerCase() === "start") {
            console.log("Setting up REAL DEVICE data streaming...")
            
            // IMPORTANT: Stop any mock streaming that might be running
            if (self.mockStreamingInterval) {
              console.log("Stopping mock streaming to avoid interference")
              clearInterval(self.mockStreamingInterval)
              self.mockStreamingInterval = null
            }
            
            const sessionId = `session_${Date.now()}`
            self.isStreaming = true
            self.currentSessionId = sessionId

            // Start session
            if (self.selectedDevice) {
              const session = {
                id: sessionId,
                deviceName: self.selectedDevice.name || "Unknown",
                deviceAddress: self.selectedDevice.address,
                startTime: Date.now(),
                sampleCount: 0,
              }
              self.sessions.unshift(session)
            }

            // Setup data subscription - THE KEY FIX
            if (self.dataSubscription) {
              console.log("Removing existing data subscription")
              self.dataSubscription.remove()
              self.dataSubscription = null
            }

            // Store reference to this for the callback
            const store = self
            
            console.log("Setting up data listener...")
            self.dataSubscription = self.selectedDevice.onDataReceived((event) => {
              console.log("=== RAW DATA RECEIVED ===")
              console.log("Event object:", event)
              console.log("Data:", event.data)
              console.log("Data type:", typeof event.data)
              console.log("Data length:", event.data?.length)
              console.log("Current delimiter for splitting:", JSON.stringify(store.delimiter))

              const receivedData = event.data
              if (receivedData && typeof receivedData === "string") {
                console.log("Processing string data...")
                console.log("Raw data chars:", receivedData.split('').map(c => c.charCodeAt(0)))
                
                // Try different delimiters to see which one works
                const delimiterTests = [
                  { name: "\\r\\n", delimiter: "\r\n" },
                  { name: "\\n", delimiter: "\n" },
                  { name: "\\r", delimiter: "\r" },
                ]
                
                delimiterTests.forEach(test => {
                  const testLines = receivedData.split(test.delimiter).filter((line) => line.trim().length > 0)
                  console.log(`Testing delimiter ${test.name}: split into ${testLines.length} lines:`, testLines)
                })
                
                const lines = receivedData
                  .split(store.delimiter)
                  .filter((line) => line.trim().length > 0)
                console.log("Using current delimiter, split into lines:", lines)
                lines.forEach((line) => {
                  console.log("Processing line:", line.trim())
                  // CRITICAL: Call the action to modify state safely
                  ;(store as any).processSampleData(line.trim())
                })
              } else {
                console.log("Data is not a string or is empty")
              }
            })
          } else if (command.toLowerCase() === "stop") {
            self.isStreaming = false

            // End session
            if (self.currentSessionId) {
              const sessionIndex = self.sessions.findIndex((s) => s.id === self.currentSessionId)
              if (sessionIndex !== -1) {
                self.sessions[sessionIndex].endTime = Date.now()
                self.sessions[sessionIndex].sampleCount = self.packetCount
              }
              self.currentSessionId = null as string | null
            }

            // Clean up subscription
            if (self.dataSubscription) {
              self.dataSubscription.remove()
              self.dataSubscription = null
            }
          }

          return true
        } catch (error: any) {
          console.error("Command error:", error)
          self.statusMessage = `Command error: ${error.message}`
          return false
        } finally {
          self.isSending = false
        }
      }),

      startStreamingCommand: flow(function* () {
        return yield (self as any).sendCommand("Start")
      }),

      stopStreamingCommand: flow(function* () {
        return yield (self as any).sendCommand("Stop")
      }),

      loadPreviousSessions: flow(function* () {
        // Implement if needed
      }),

      loadSessionData: flow(function* (_sessionId: string) {
        return []
      }),

      // Mock functions for testing without real Bluetooth device
      startMockBluetooth() {
        // Simulate Bluetooth enabled
        self.bluetoothEnabled = true
        self.statusMessage = "Mock Bluetooth enabled"

        // Add mock devices
        const mockDevice = {
          id: "mock-device-1",
          name: "Mock sEMG Device",
          address: "00:11:22:33:44:55",
          isConnected: () => Promise.resolve(false),
          connect: () => Promise.resolve(true),
          disconnect: () => Promise.resolve(true),
          available: () => Promise.resolve(0),
          write: () => Promise.resolve(true),
          read: () => Promise.resolve(""),
          clear: () => Promise.resolve(true),
        } as unknown as BluetoothDevice

        self.pairedDevices.clear()
        self.pairedDevices.push(mockDevice)
      },

      connectToMockDevice() {
        if (self.pairedDevices.length === 0) {
          ;(self as any).startMockBluetooth()
        }

        self.selectedDevice = self.pairedDevices[0]
        self.connected = true
        self.statusMessage = "Connected to mock device"
        self.currentSessionId = `mock-session-${Date.now()}`

        console.log("🔧 Mock device connected")
      },

      disconnectMockDevice() {
        self.connected = false
        self.isStreaming = false
        self.selectedDevice = null
        self.statusMessage = "Mock device disconnected"
        self.currentSessionId = null

        if (self.mockStreamingInterval) {
          clearInterval(self.mockStreamingInterval)
          self.mockStreamingInterval = null
        }

        console.log("🔧 Mock device disconnected")
      },

      startMockStreaming() {
        if (!self.connected) {
          ;(self as any).connectToMockDevice()
        }

        self.isStreaming = true
        self.statusMessage = "Mock streaming active"

        // Generate realistic EMG data at 10Hz (very conservative for debugging)
        self.mockStreamingInterval = setInterval(() => {
          if (self.isStreaming) {
            const mockData = (self as any).generateMockEmgData()
            ;(self as any).processSampleData(mockData)
          }
        }, 100) // 100ms = 10Hz

        console.log("🔧 Mock streaming started at 10Hz (conservative)")
      },

      stopMockStreaming() {
        self.isStreaming = false
        self.statusMessage = "Mock streaming stopped"

        if (self.mockStreamingInterval) {
          clearInterval(self.mockStreamingInterval)
          self.mockStreamingInterval = null
        }

        console.log("🔧 Mock streaming stopped")
      },

      generateMockEmgData(): string {
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

          // Add some realistic EMG characteristics
          if (Math.random() < 0.1) {
            // Occasional spikes (10% chance)
            signal += (Math.random() - 0.5) * amplitude * 2
          }

          // Clamp to realistic EMG range (-200 to +200 μV)
          signal = Math.max(-200, Math.min(200, signal))

          values.push(parseFloat(signal.toFixed(1)))
        }

        return values.join(" ")
      },

      destroy() {
        if (self.selectedDevice && self.connected) {
          self.selectedDevice.disconnect().catch(console.warn)
        }
        if (self.dataSubscription) {
          self.dataSubscription.remove()
          self.dataSubscription = null
        }
      },

      afterCreate() {
        setTimeout(() => {
          ;(self as any).checkBluetooth()
        }, 100)
      },
    }
  })

export interface BluetoothStore extends Instance<typeof BluetoothStoreModel> {}
export interface BluetoothStoreSnapshotOut extends SnapshotOut<typeof BluetoothStoreModel> {}
export interface BluetoothStoreSnapshotIn extends SnapshotIn<typeof BluetoothStoreModel> {}
