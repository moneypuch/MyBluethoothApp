// app/models/BluetoothStore.ts
import { Instance, SnapshotIn, SnapshotOut, types, flow } from "mobx-state-tree"
import RNBluetoothClassic, {
  BluetoothDevice,
  BluetoothEventType,
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
  })
  .volatile((self) => ({
    // Non-persisted volatile state
    pairedDevices: [] as BluetoothDevice[],
    selectedDevice: null as BluetoothDevice | null,

    // Optimized data buffers (non-observable for performance)
    buffer1kHz: [] as SEmgSample[],
    buffer100Hz: [] as SEmgSample[],
    downsampleCounter: 0,

    // Configuration
    MAX_1KHZ: 10000,
    MAX_100HZ: 1000,

    // Subscription management
    dataSubscription: null as BluetoothEventSubscription | null,
    bluetoothStateSubscription: null as BluetoothEventSubscription | null,
    deviceConnectionSubscription: null as BluetoothEventSubscription | null,
    deviceDisconnectionSubscription: null as BluetoothEventSubscription | null,

    backendSyncInterval: null as NodeJS.Timeout | null,
    backendQueue: [] as SEmgSample[],
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
    // Helper functions for permissions
    async function requestBluetoothPermissions(): Promise<boolean> {
      if (Platform.OS === "android") {
        try {
          if (Platform.Version >= 31) {
            // Android 12+ requires new permissions
            const permissions = await PermissionsAndroid.requestMultiple([
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
              PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
            ])

            return (
              permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] ===
                PermissionsAndroid.RESULTS.GRANTED &&
              permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] ===
                PermissionsAndroid.RESULTS.GRANTED &&
              permissions[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] ===
                PermissionsAndroid.RESULTS.GRANTED
            )
          } else {
            // Legacy Android permissions
            const permissions = await PermissionsAndroid.requestMultiple([
              PermissionsAndroid.PERMISSIONS.BLUETOOTH,
              PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADMIN,
              PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
            ])

            return (
              permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH] ===
                PermissionsAndroid.RESULTS.GRANTED &&
              permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_ADMIN] ===
                PermissionsAndroid.RESULTS.GRANTED &&
              permissions[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] ===
                PermissionsAndroid.RESULTS.GRANTED
            )
          }
        } catch (error) {
          console.warn("Permission request failed:", error)
          return false
        }
      }
      return true // iOS doesn't need runtime permissions for External Accessory
    }

    function processDataLine(line: string) {
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

        // Use the safe buffer modification function
        addSampleToBuffers(sample)

        // Send to backend if streaming
        if (self.isStreaming) {
          queueBackendSample(sample)
        }
      }
    }

    function subscribeToData(device: BluetoothDevice) {
      unsubscribeFromData()

      // Use the official onDataReceived method from react-native-bluetooth-classic
      self.dataSubscription = device.onDataReceived((event) => {
        console.log("RAW DATA RECEIVED:", event.data)

        // Handle the received data string
        const receivedData = event.data
        if (receivedData && typeof receivedData === "string") {
          // Split by delimiter to handle multiple lines of data
          const lines = receivedData.split(self.delimiter).filter((line) => line.trim().length > 0)

          lines.forEach((line) => {
            processDataLine(line.trim())
          })
        }
      })
    }

    function unsubscribeFromData() {
      if (self.dataSubscription) {
        self.dataSubscription.remove()
        self.dataSubscription = null
      }
    }

    function setupBluetoothEventListeners() {
      // Listen for bluetooth state changes
      self.bluetoothStateSubscription = RNBluetoothClassic.onStateChanged((state) => {
        console.log("Bluetooth state changed:", state)
        self.bluetoothEnabled = state.enabled
        if (!state.enabled && self.connected) {
          // Bluetooth was disabled, clean up connections
          self.connected = false
          self.selectedDevice = null
          stopStreamingInternal()
        }
      })

      // Listen for device connection events
      self.deviceConnectionSubscription = RNBluetoothClassic.onDeviceConnected((device) => {
        console.log("Device connected:", device.name || device.address)
        if (self.selectedDevice && device.address === self.selectedDevice.address) {
          self.connected = true
          self.statusMessage = `Connected to ${device.name || device.address}`
        }
      })

      // Listen for device disconnection events
      self.deviceDisconnectionSubscription = RNBluetoothClassic.onDeviceDisconnected((device) => {
        console.log("Device disconnected:", device.name || device.address)
        if (self.selectedDevice && device.address === self.selectedDevice.address) {
          self.connected = false
          self.selectedDevice = null
          self.statusMessage = `Disconnected from ${device.name || device.address}`
          stopStreamingInternal()
        }
      })
    }

    function cleanupBluetoothEventListeners() {
      if (self.bluetoothStateSubscription) {
        self.bluetoothStateSubscription.remove()
        self.bluetoothStateSubscription = null
      }
      if (self.deviceConnectionSubscription) {
        self.deviceConnectionSubscription.remove()
        self.deviceConnectionSubscription = null
      }
      if (self.deviceDisconnectionSubscription) {
        self.deviceDisconnectionSubscription.remove()
        self.deviceDisconnectionSubscription = null
      }
    }

    function clearBuffers() {
      // Use action to modify volatile state safely
      self.buffer1kHz.clear()
      self.buffer100Hz.clear()
      self.downsampleCounter = 0
      self.backendQueue.clear()
      self.packetCount = 0
    }

    function addSampleToBuffers(sample: SEmgSample) {
      // Add to 1kHz buffer (keep newest at front)
      self.buffer1kHz.unshift(sample)
      if (self.buffer1kHz.length > self.MAX_1KHZ) {
        // Remove oldest samples
        self.buffer1kHz.splice(self.MAX_1KHZ)
      }

      // Update packet count
      self.packetCount++

      // Downsample for 100Hz buffer
      self.downsampleCounter++
      if (self.downsampleCounter >= 10) {
        self.buffer100Hz.unshift(sample)
        if (self.buffer100Hz.length > self.MAX_100HZ) {
          // Remove oldest samples
          self.buffer100Hz.splice(self.MAX_100HZ)
        }
        self.downsampleCounter = 0
      }
    }

    function queueBackendSample(sample: SEmgSample) {
      self.backendQueue.push(sample)

      // If queue gets too large, remove oldest samples
      if (self.backendQueue.length > 1000) {
        // Remove oldest samples, keep newest 500
        self.backendQueue.splice(0, self.backendQueue.length - 500)
      }
    }

    function startBackendSync() {
      self.backendSyncInterval = setInterval(() => {
        flushBackendQueue()
      }, 2000) // Send every 2 seconds
    }

    function stopBackendSync() {
      if (self.backendSyncInterval) {
        clearInterval(self.backendSyncInterval)
        self.backendSyncInterval = null
      }

      // Final flush
      flushBackendQueue()
    }

    async function flushBackendQueue() {
      if (self.backendQueue.length === 0) return

      const samplesToSend = [...self.backendQueue]
      self.backendQueue.clear() // Use clear() instead of reassignment

      try {
        // Replace with your actual backend endpoint
        const response = await fetch("YOUR_BACKEND_ENDPOINT/samples/batch", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            samples: samplesToSend,
            sessionId: self.currentSessionId,
          }),
        })

        if (!response.ok) {
          console.warn("Backend sync failed:", response.status)
          // Re-queue samples on failure (keep last 100)
          const samplesToRequeue = samplesToSend.slice(-100)
          samplesToRequeue.forEach((sample) => self.backendQueue.unshift(sample))
        }
      } catch (error) {
        console.warn("Backend sync error:", error)
        // Re-queue samples on error
        const samplesToRequeue = samplesToSend.slice(-100)
        samplesToRequeue.forEach((sample) => self.backendQueue.unshift(sample))
      }
    }

    function startSession(sessionId: string) {
      if (!self.selectedDevice) return

      const session = {
        id: sessionId,
        deviceName: self.selectedDevice.name || "Unknown",
        deviceAddress: self.selectedDevice.address,
        startTime: Date.now(),
        sampleCount: 0,
      }

      self.sessions.unshift(session)
    }

    function endCurrentSession() {
      if (self.currentSessionId) {
        const sessionIndex = self.sessions.findIndex((s) => s.id === self.currentSessionId)
        if (sessionIndex !== -1) {
          self.sessions[sessionIndex].endTime = Date.now()
          self.sessions[sessionIndex].sampleCount = self.packetCount
        }

        self.currentSessionId = null
      }
    }

    function startStreamingInternal() {
      if (!self.selectedDevice || !self.connected) return

      const sessionId = `session_${Date.now()}`

      self.isStreaming = true
      self.currentSessionId = sessionId

      startSession(sessionId)
      subscribeToData(self.selectedDevice)
      startBackendSync()
    }

    function stopStreamingInternal() {
      self.isStreaming = false

      endCurrentSession()
      unsubscribeFromData()
      stopBackendSync()
    }

    // Return all actions
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

      // New action for clearing buffers from UI
      clearBuffersAction() {
        clearBuffers()
      },
      getLatestSamples(count: number, frequency: "1kHz" | "100Hz" = "1kHz"): SEmgSample[] {
        const buffer = frequency === "1kHz" ? self.buffer1kHz : self.buffer100Hz
        return buffer.slice(0, Math.min(count, buffer.length))
      },

      getChannelStatistics() {
        try {
          const recentSamples = self.buffer1kHz.slice(0, 1000) // Last 1000 samples
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

          console.log("Channel statistics calculated:", Object.keys(stats).length, "channels")
          return stats
        } catch (error) {
          console.error("Error calculating channel statistics:", error)
          // Return default stats for all channels
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

      // Main public actions with flow
      checkBluetooth: flow(function* () {
        try {
          const hasPermissions = yield requestBluetoothPermissions()
          if (!hasPermissions) {
            self.statusMessage = "Bluetooth permissions not granted"
            return
          }

          const enabled = yield RNBluetoothClassic.isBluetoothEnabled()
          self.bluetoothEnabled = enabled

          if (enabled) {
            const paired = yield RNBluetoothClassic.getBondedDevices()
            console.log("Paired devices:", paired)
            self.pairedDevices = paired || []
            self.statusMessage = `Found ${(paired || []).length} paired devices`
          } else {
            self.statusMessage = "Bluetooth not enabled"

            // Try to request Bluetooth to be enabled
            try {
              const enableResult = yield RNBluetoothClassic.requestBluetoothEnabled()
              if (enableResult) {
                self.bluetoothEnabled = true
                self.statusMessage = "Bluetooth enabled"
              }
            } catch (enableError) {
              console.warn("Could not enable Bluetooth:", enableError)
            }
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
          // Check if device is already connected
          let isConnected = false
          try {
            isConnected = yield device.isConnected()
          } catch (checkError) {
            console.warn("Could not check connection status:", checkError)
            isConnected = false
          }

          if (isConnected) {
            console.log("Device already connected")
            self.connected = true
            self.selectedDevice = device
            self.statusMessage = `Already connected to ${device.name || device.address}`
            clearBuffers()
            return
          }

          // Ensure any existing connection is closed
          if (self.selectedDevice && self.connected) {
            try {
              yield self.selectedDevice.disconnect()
              // Wait a bit for cleanup
              yield new Promise((resolve) => setTimeout(resolve, 500))
            } catch (disconnectError) {
              console.warn("Error disconnecting previous device:", disconnectError)
            }
          }

          // Clear any existing subscriptions
          unsubscribeFromData()

          self.statusMessage = "Establishing connection..."

          // Try connecting with different approaches for better compatibility
          let connected = false

          try {
            // First try: Simple connect
            connected = yield device.connect()
            console.log("Simple connect result:", connected)
          } catch (simpleConnectError) {
            console.warn("Simple connect failed, trying with options:", simpleConnectError)

            try {
              // Second try: Connect with options
              connected = yield device.connect({
                delimiter: self.delimiter,
                deviceCharset: self.encoding,
              })
              console.log("Connect with options result:", connected)
            } catch (optionsConnectError) {
              console.warn("Connect with options failed:", optionsConnectError)

              // Third try: Connect with minimal options
              try {
                connected = yield device.connect({
                  delimiter: "\r\n",
                })
                console.log("Minimal options connect result:", connected)
              } catch (minimalConnectError) {
                console.error("All connection attempts failed:", minimalConnectError)
                throw minimalConnectError
              }
            }
          }

          self.connected = connected
          self.selectedDevice = device

          if (connected) {
            self.statusMessage = `Connected to ${device.name || device.address}`
            clearBuffers()
            console.log("Device connected successfully")

            // Wait a moment before allowing operations
            yield new Promise((resolve) => setTimeout(resolve, 1000))
          } else {
            self.statusMessage = "Connection failed - device not responding"
            self.selectedDevice = null
          }
        } catch (error: any) {
          console.error("Connection error:", error)

          // Provide more specific error messages
          let errorMessage = "Connection failed"
          if (error.message.includes("socket might closed")) {
            errorMessage = "Connection timeout - device may be busy or out of range"
          } else if (error.message.includes("read failed")) {
            errorMessage = "Communication error - check device compatibility"
          } else if (error.message.includes("IOException")) {
            errorMessage = "I/O error - device connection unstable"
          } else {
            errorMessage = `Connection error: ${error.message}`
          }

          self.statusMessage = errorMessage
          self.connected = false
          self.selectedDevice = null

          // Clean up any partial connections
          try {
            yield device.disconnect()
          } catch (cleanupError) {
            console.warn("Cleanup disconnect failed:", cleanupError)
          }
        } finally {
          self.isConnecting = false
        }
      }),

      disconnectDevice: flow(function* () {
        try {
          if (self.selectedDevice && self.connected) {
            // Stop streaming first
            stopStreamingInternal()

            // Then disconnect
            yield self.selectedDevice.disconnect()
            self.statusMessage = `Disconnected from ${self.selectedDevice?.name || self.selectedDevice?.address}`
          }
        } catch (error) {
          console.warn("Disconnect error:", error)
          // Still update state even if disconnect fails
        }

        unsubscribeFromData()
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
          // Use the device's write method directly
          yield self.selectedDevice.write(fullCommand, self.encoding)

          self.statusMessage = `Command sent: ${command}`
          console.log("Command sent:", fullCommand)

          // Handle Start/Stop commands
          if (command.toLowerCase() === "start") {
            startStreamingInternal()
          } else if (command.toLowerCase() === "stop") {
            stopStreamingInternal()
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
        try {
          const response = yield fetch("YOUR_BACKEND_ENDPOINT/sessions")
          if (response.ok) {
            const sessions = yield response.json()
            self.sessions.replace(sessions)
          }
        } catch (error) {
          console.warn("Failed to load sessions:", error)
        }
      }),

      loadSessionData: flow(function* (sessionId: string) {
        try {
          const response = yield fetch(`YOUR_BACKEND_ENDPOINT/sessions/${sessionId}/samples`)
          if (response.ok) {
            return yield response.json()
          }
        } catch (error) {
          console.warn("Failed to load session data:", error)
        }
        return []
      }),

      destroy() {
        // Clean up all subscriptions and connections
        stopStreamingInternal()
        unsubscribeFromData()
        cleanupBluetoothEventListeners()

        if (self.selectedDevice && self.connected) {
          self.selectedDevice.disconnect().catch(console.warn)
        }

        stopBackendSync()
      },

      afterCreate() {
        // Set up event listeners
        setupBluetoothEventListeners()

        // Initialize on creation
        setTimeout(() => {
          if (!self.bluetoothEnabled) {
            requestBluetoothPermissions()
              .then((hasPermissions) => {
                if (hasPermissions) {
                  RNBluetoothClassic.isBluetoothEnabled()
                    .then((enabled) => {
                      self.bluetoothEnabled = enabled
                      if (enabled) {
                        RNBluetoothClassic.getBondedDevices()
                          .then((paired) => {
                            self.pairedDevices = paired || []
                            self.statusMessage = `Found ${(paired || []).length} paired devices`
                          })
                          .catch((error) => {
                            console.warn("Error getting bonded devices:", error)
                            self.statusMessage = "Error loading paired devices"
                          })
                      } else {
                        self.statusMessage = "Bluetooth not enabled"
                      }
                    })
                    .catch((error) => {
                      console.warn("Error checking Bluetooth status:", error)
                      self.statusMessage = "Error checking Bluetooth status"
                    })
                } else {
                  self.statusMessage = "Bluetooth permissions not granted"
                }
              })
              .catch((error) => {
                console.warn("Error requesting permissions:", error)
                self.statusMessage = "Error requesting Bluetooth permissions"
              })
          }
        }, 100)
      },
    }
  })

export interface BluetoothStore extends Instance<typeof BluetoothStoreModel> {}
export interface BluetoothStoreSnapshotOut extends SnapshotOut<typeof BluetoothStoreModel> {}
export interface BluetoothStoreSnapshotIn extends SnapshotIn<typeof BluetoothStoreModel> {}
