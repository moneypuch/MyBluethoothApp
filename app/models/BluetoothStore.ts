// app/models/BluetoothStore.ts
import { Instance, SnapshotIn, SnapshotOut, types, flow } from "mobx-state-tree"
import RNBluetoothClassic, {
  BluetoothDevice,
  BluetoothEventSubscription,
} from "react-native-bluetooth-classic"
import { Platform, PermissionsAndroid } from "react-native"

export interface SEmgSample {
  timestamp: number
  values: number[] // 10 channels
  sessionId: string
}

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
    currentSessionId: types.maybe(types.string),
    packetCount: types.optional(types.number, 0),

    // Command state
    isSending: types.optional(types.boolean, false),

    // Sessions
    sessions: types.optional(types.array(BluetoothSessionModel), []),

    // Device connection configuration
    delimiter: types.optional(types.string, "\r\n"),
    encoding: types.optional(types.string, "utf-8"),

    // ✅ MOVED FROM VOLATILE: Now MobX observable!
    buffer1kHz: types.optional(types.array(types.frozen<SEmgSample>()), []),
    buffer100Hz: types.optional(types.array(types.frozen<SEmgSample>()), []),
    downsampleCounter: types.optional(types.number, 0),
    backendQueue: types.optional(types.array(types.frozen<SEmgSample>()), []),
  })
  .volatile((self) => ({
    // Non-persisted volatile state (NON-observable)
    pairedDevices: [] as BluetoothDevice[],
    selectedDevice: null as BluetoothDevice | null,

    // Configuration
    MAX_1KHZ: 10000,
    MAX_100HZ: 1000,

    // Subscription management
    dataSubscription: null as BluetoothEventSubscription | null,

    backendSyncInterval: null as NodeJS.Timeout | null,
  }))
  .views((self) => ({
    get latest1kHzSamples(): SEmgSample[] {
      return self.buffer1kHz.slice(0, 10)
    },

    get latest100HzSamples(): SEmgSample[] {
      return self.buffer100Hz.slice(0, 10)
    },

    get all1kHzSamples(): SEmgSample[] {
      return [...self.buffer1kHz]
    },

    get all100HzSamples(): SEmgSample[] {
      return [...self.buffer100Hz]
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
        buffer1kHzCount: self.buffer1kHz.length,
        buffer100HzCount: self.buffer100Hz.length,
        samplesPerSecond: self.isStreaming ? 1000 : 0,
        bufferStats: {
          realTime: self.buffer1kHz.length,
        },
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
        self.pairedDevices = devices
      },

      setSelectedDevice(device: BluetoothDevice | null) {
        self.selectedDevice = device
      },

      setCurrentSessionId(sessionId: string | null) {
        self.currentSessionId = sessionId
      },

      setSessions(sessions: (typeof BluetoothSessionModel.Type)[]) {
        self.sessions.replace(sessions)
      },

      setDelimiter(delimiter: string) {
        self.delimiter = delimiter
      },

      setEncoding(encoding: string) {
        self.encoding = encoding
      },

      // CRITICAL: This action will be called from the onDataReceived callback
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

          // Add to 1kHz buffer - CORRECT MST syntax
          self.buffer1kHz.unshift(sample)
          if (self.buffer1kHz.length > self.MAX_1KHZ) {
            self.buffer1kHz = self.buffer1kHz.slice(0, self.MAX_1KHZ)
          }

          // Update packet count
          self.packetCount++

          // Downsample for 100Hz buffer
          self.downsampleCounter++
          if (self.downsampleCounter >= 10) {
            self.buffer100Hz.unshift(sample)
            if (self.buffer100Hz.length > self.MAX_100HZ) {
              self.buffer100Hz = self.buffer100Hz.slice(0, self.MAX_100HZ)
            }
            self.downsampleCounter = 0
          }

          // Send to backend if streaming
          if (self.isStreaming) {
            self.backendQueue.push(sample)
            if (self.backendQueue.length > 1000) {
              self.backendQueue = self.backendQueue.slice(-500)
            }
          }
        }
      },

      // Clear buffers action - CORRECT MST syntax
      clearBuffersAction() {
        self.buffer1kHz = []
        self.buffer100Hz = []
        self.backendQueue = []
        self.downsampleCounter = 0
        self.packetCount = 0
      },

      // Utility methods
      getLatestSamples(count: number, frequency: "1kHz" | "100Hz" = "1kHz"): SEmgSample[] {
        const buffer = frequency === "1kHz" ? self.buffer1kHz : self.buffer100Hz
        return buffer.slice(0, Math.min(count, buffer.length))
      },

      getChannelStatistics() {
        try {
          const recentSamples = self.buffer1kHz.slice(0, 1000)
          const stats: Record<string, { min: number; max: number; avg: number; rms: number }> = {}

          for (let ch = 0; ch < 10; ch++) {
            const channelValues = recentSamples.map((sample) => sample.values[ch] || 0)

            if (channelValues.length === 0) {
              stats[`ch${ch}`] = { min: 0, max: 0, avg: 0, rms: 0 }
              continue
            }

            const min = Math.min(...channelValues)
            const max = Math.max(...channelValues)
            const avg = channelValues.reduce((sum, val) => sum + val, 0) / channelValues.length
            const rms = Math.sqrt(
              channelValues.reduce((sum, val) => sum + val * val, 0) / channelValues.length,
            )

            stats[`ch${ch}`] = { min, max, avg, rms }
          }

          return stats
        } catch (error) {
          console.error("Error calculating channel statistics:", error)
          const defaultStats: Record<
            string,
            { min: number; max: number; avg: number; rms: number }
          > = {}
          for (let i = 0; i < 10; i++) {
            defaultStats[`ch${i}`] = { min: 0, max: 0, avg: 0, rms: 0 }
          }
          return defaultStats
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
            self.pairedDevices = paired || []
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
            // Clear buffers - CORRECT MST syntax
            self.buffer1kHz = []
            self.buffer100Hz = []
            self.backendQueue = []
            self.downsampleCounter = 0
            self.packetCount = 0
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

        const fullCommand = command + self.delimiter
        self.isSending = true

        try {
          yield self.selectedDevice.write(fullCommand, self.encoding)
          self.statusMessage = `Command sent: ${command}`

          // Handle Start/Stop commands
          if (command.toLowerCase() === "start") {
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
              self.dataSubscription.remove()
              self.dataSubscription = null
            }

            // Store reference to this for the callback
            const store = self

            self.dataSubscription = self.selectedDevice.onDataReceived((event) => {
              console.log("RAW DATA RECEIVED:", event.data)

              const receivedData = event.data
              if (receivedData && typeof receivedData === "string") {
                const lines = receivedData
                  .split(store.delimiter)
                  .filter((line) => line.trim().length > 0)
                lines.forEach((line) => {
                  // CRITICAL: Call the action to modify state safely
                  store.processSampleData(line.trim())
                })
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
              self.currentSessionId = null
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
        return yield self.sendCommand("Start")
      }),

      stopStreamingCommand: flow(function* () {
        return yield self.sendCommand("Stop")
      }),

      loadPreviousSessions: flow(function* () {
        // Implement if needed
      }),

      loadSessionData: flow(function* (sessionId: string) {
        return []
      }),

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
          self.checkBluetooth()
        }, 100)
      },
    }
  })

export interface BluetoothStore extends Instance<typeof BluetoothStoreModel> {}
export interface BluetoothStoreSnapshotOut extends SnapshotOut<typeof BluetoothStoreModel> {}
export interface BluetoothStoreSnapshotIn extends SnapshotIn<typeof BluetoothStoreModel> {}
