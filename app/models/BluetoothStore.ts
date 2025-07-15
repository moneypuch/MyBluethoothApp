// app/models/BluetoothStore.ts
import { Instance, SnapshotIn, SnapshotOut, types, flow } from "mobx-state-tree"
import { BluetoothDevice } from "react-native-bluetooth-classic"
import RNBluetoothClassic from "react-native-bluetooth-classic"
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
    terminator: "\r" as "\r" | "\n" | "\r\n",

    // Subscription management
    dataSubscription: null as any,
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
      }
    },
  }))
  .actions((self) => {
    // Helper functions
    async function requestBluetoothConnectPermission(): Promise<boolean> {
      if (Platform.OS === "android" && Platform.Version >= 31) {
        try {
          const granted = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
            {
              title: "Bluetooth Permission",
              message: "App needs permission to connect to Bluetooth devices",
              buttonNeutral: "Ask Later",
              buttonNegative: "Cancel",
              buttonPositive: "OK",
            },
          )
          return granted === PermissionsAndroid.RESULTS.GRANTED
        } catch (error) {
          console.warn("Permission request failed:", error)
          return false
        }
      }
      return true
    }

    async function sendSequentially(message: string, delay = 50): Promise<void> {
      if (!self.selectedDevice || !self.connected) return

      for (let i = 0; i < message.length; i++) {
        const char = message[i]
        await self.selectedDevice.write(char)
        console.log(`Letter '${char}' sent`)
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
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

        // Add to 1kHz buffer (keep newest at front like original)
        self.buffer1kHz.unshift(sample)
        if (self.buffer1kHz.length > self.MAX_1KHZ) {
          self.buffer1kHz.length = self.MAX_1KHZ
        }

        // Update packet count
        self.packetCount++

        // Downsample for 100Hz buffer
        self.downsampleCounter++
        if (self.downsampleCounter >= 10) {
          self.buffer100Hz.unshift(sample)
          if (self.buffer100Hz.length > self.MAX_100HZ) {
            self.buffer100Hz.length = self.MAX_100HZ
          }
          self.downsampleCounter = 0
        }

        // Send to backend if streaming
        if (self.isStreaming) {
          queueBackendSample(sample)
        }
      }
    }

    function subscribeToData(device: BluetoothDevice) {
      unsubscribeFromData()

      let buffer = ""
      self.dataSubscription = device.onDataReceived((event: any) => {
        console.log("RAW DATA:", JSON.stringify(event.data))
        buffer += event.data
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ""

        lines.forEach((line) => {
          processDataLine(line.trim())
        })
      })
    }

    function unsubscribeFromData() {
      if (self.dataSubscription) {
        self.dataSubscription.remove()
        self.dataSubscription = null
      }
    }

    function clearBuffers() {
      self.buffer1kHz = []
      self.buffer100Hz = []
      self.downsampleCounter = 0
      self.backendQueue = []
      self.packetCount = 0
    }

    function queueBackendSample(sample: SEmgSample) {
      self.backendQueue.push(sample)

      // If queue gets too large, remove oldest samples
      if (self.backendQueue.length > 1000) {
        self.backendQueue = self.backendQueue.slice(-500)
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
      self.backendQueue = []

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
          self.backendQueue = [...samplesToSend.slice(-100), ...self.backendQueue]
        }
      } catch (error) {
        console.warn("Backend sync error:", error)
        // Re-queue samples on error
        self.backendQueue = [...samplesToSend.slice(-100), ...self.backendQueue]
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

      setTerminator(terminator: "\r" | "\n" | "\r\n") {
        self.terminator = terminator
      },

      // Main public actions with flow
      checkBluetooth: flow(function* () {
        try {
          const hasConnectPermission = yield requestBluetoothConnectPermission()
          if (!hasConnectPermission) {
            self.statusMessage = "BLUETOOTH_CONNECT permission not granted"
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
          }
        } catch (error: any) {
          self.statusMessage = `Bluetooth check error: ${error.message}`
        }
      }),

      connectToDevice: flow(function* (device: BluetoothDevice) {
        if (self.isConnecting) return

        self.isConnecting = true
        self.statusMessage = "Connecting..."

        try {
          // Ensure any existing connection is closed
          if (self.selectedDevice && self.connected) {
            yield self.selectedDevice.disconnect()
          }

          // Use simple connection approach
          const connected = yield device.connect()

          self.connected = connected
          self.selectedDevice = device
          self.statusMessage = connected
            ? `Connected to ${device.name || device.address}`
            : "Connection failed"
          self.packetCount = 0

          if (connected) {
            clearBuffers()
            // Don't auto-subscribe - wait for Start command
          }
        } catch (error: any) {
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
            yield self.selectedDevice.disconnect()
            self.statusMessage = `Disconnected from ${self.selectedDevice?.name || self.selectedDevice?.address}`
          }
        } catch (error) {
          // Ignore disconnect errors
        }

        stopStreamingInternal()
        unsubscribeFromData()

        self.connected = false
        self.selectedDevice = null
      }),

      sendCommand: flow(function* (command: string) {
        if (!self.selectedDevice || !self.connected) {
          self.statusMessage = "No device connected"
          return false
        }

        const fullCommand = command + self.terminator

        self.isSending = true

        try {
          yield sendSequentially(fullCommand, 50)

          self.statusMessage = `Command sent (letter by letter): ${fullCommand}`
          console.log("Command sent (letter by letter):", fullCommand)

          // Handle Start/Stop commands
          if (command.toLowerCase() === "start") {
            startStreamingInternal()
          } else if (command.toLowerCase() === "stop") {
            stopStreamingInternal()
          }

          return true
        } catch (error: any) {
          self.statusMessage = `Command error: ${error.message}`
          console.log("Command error (letter by letter):", error.message)
          return false
        } finally {
          self.isSending = false
        }
      }),

      startStreamingCommand: flow(function* () {
        if (!self.selectedDevice || !self.connected) {
          self.statusMessage = "No device connected"
          return false
        }

        const fullCommand = "Start" + self.terminator

        self.isSending = true

        try {
          yield sendSequentially(fullCommand, 50)

          self.statusMessage = `Command sent (letter by letter): ${fullCommand}`
          console.log("Command sent (letter by letter):", fullCommand)

          startStreamingInternal()
          return true
        } catch (error: any) {
          self.statusMessage = `Command error: ${error.message}`
          console.log("Command error (letter by letter):", error.message)
          return false
        } finally {
          self.isSending = false
        }
      }),

      stopStreamingCommand: flow(function* () {
        if (!self.selectedDevice || !self.connected) {
          self.statusMessage = "No device connected"
          return false
        }

        const fullCommand = "Stop" + self.terminator

        self.isSending = true

        try {
          yield sendSequentially(fullCommand, 50)

          self.statusMessage = `Command sent (letter by letter): ${fullCommand}`
          console.log("Command sent (letter by letter):", fullCommand)

          stopStreamingInternal()
          return true
        } catch (error: any) {
          self.statusMessage = `Command error: ${error.message}`
          console.log("Command error (letter by letter):", error.message)
          return false
        } finally {
          self.isSending = false
        }
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
        if (self.selectedDevice && self.connected) {
          self.selectedDevice.disconnect()
        }
        stopBackendSync()
        unsubscribeFromData()
      },

      afterCreate() {
        // Initialize on creation - use setTimeout to avoid circular reference
        setTimeout(() => {
          if (!self.bluetoothEnabled) {
            requestBluetoothConnectPermission().then((hasPermission) => {
              if (hasPermission) {
                RNBluetoothClassic.isBluetoothEnabled().then((enabled) => {
                  self.bluetoothEnabled = enabled
                  if (enabled) {
                    RNBluetoothClassic.getBondedDevices().then((paired) => {
                      self.pairedDevices = paired || []
                      self.statusMessage = `Found ${(paired || []).length} paired devices`
                    })
                  } else {
                    self.statusMessage = "Bluetooth not enabled"
                  }
                })
              } else {
                self.statusMessage = "BLUETOOTH_CONNECT permission not granted"
              }
            })
          }
        }, 100)
      },
    }
  })

export interface BluetoothStore extends Instance<typeof BluetoothStoreModel> {}
export interface BluetoothStoreSnapshotOut extends SnapshotOut<typeof BluetoothStoreModel> {}
export interface BluetoothStoreSnapshotIn extends SnapshotIn<typeof BluetoothStoreModel> {}
