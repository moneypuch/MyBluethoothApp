// app/models/BluetoothStore.ts
import { Instance, SnapshotIn, SnapshotOut, types, flow } from "mobx-state-tree"
import RNBluetoothClassic, {
  BluetoothDevice,
  BluetoothEventSubscription,
} from "react-native-bluetooth-classic"
import { Platform, PermissionsAndroid } from "react-native"
import { SEmgCircularBuffer, type SEmgSample } from "@/utils/CircularBuffer"
import { SEmgDataProcessor, type ProcessorSnapshot } from "@/utils/SEmgDataProcessor"

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
    encoding: types.optional(types.string, "utf-8"),

    // Device management (observable for UI reactivity)
    pairedDevices: types.optional(types.array(types.frozen<BluetoothDevice>()), []),
    selectedDevice: types.maybeNull(types.frozen<BluetoothDevice>()),

    // Performance counters (observable for UI updates)
    downsampleCounter: types.optional(types.number, 0),
    totalSamplesProcessed: types.optional(types.number, 0),
    bufferOverflowCount: types.optional(types.number, 0),

    // UI Snapshot data (observable - updated periodically)
    uiSnapshot: types.frozen<ProcessorSnapshot | null>(),
    lastSnapshotUpdate: types.optional(types.number, 0),
  })
  .volatile((_self) => ({
    // Non-observable data processor
    dataProcessor: new SEmgDataProcessor(),
    
    // Backend queue remains here for now
    backendQueue: new SEmgCircularBuffer(5000), // Backend upload queue
    
    // Snapshot update interval
    snapshotInterval: null as NodeJS.Timeout | null,

    // Configuration
    MAX_1KHZ: 10000,
    MAX_100HZ: 6000,
    MAX_10HZ: 3600,

    // Subscription management
    dataSubscription: null as BluetoothEventSubscription | null,
    backendSyncInterval: null as NodeJS.Timeout | null,

    // Mock testing support
    mockStreamingInterval: null as NodeJS.Timeout | null,
    
    // Batch processing queue with size limit
    pendingLines: [] as string[],
    batchProcessingInterval: null as NodeJS.Timeout | null,
    maxPendingLines: 50, // Limit queue size
  }))
  .views((self) => ({
    get latestSamples(): SEmgSample[] {
      return self.uiSnapshot?.latestSamples || []
    },

    get channelStatistics() {
      return self.uiSnapshot?.channelStats || {}
    },

    get bufferStatistics() {
      return self.uiSnapshot?.bufferStats || {
        buffer1kHz: { size: 0, capacity: 10000, fillRate: 0 },
        buffer100Hz: { size: 0, capacity: 6000, fillRate: 0 },
        buffer10Hz: { size: 0, capacity: 3600, fillRate: 0 }
      }
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
        lastUpdate: self.lastSnapshotUpdate,
        samplesPerSecond: self.isStreaming ? 1000 : 0,
        bufferStats: self.bufferStatistics,
        performance: {
          totalProcessed: self.uiSnapshot?.totalSamplesProcessed || 0,
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

      setEncoding(encoding: string) {
        self.encoding = encoding
      },

      // Delegate to non-observable data processor
      processSampleData(line: string) {
        if (!line || !self.currentSessionId) {
          return
        }

        // Process in the non-observable processor
        const processed = self.dataProcessor.processLine(line, self.currentSessionId)
        
        if (processed) {
          // Only update packet count, not buffers
          self.packetCount++
          
          // Backend queue handling if needed
          if (self.isStreaming) {
            const values = line
              .split(/\s+/)
              .map((n) => Number(n))
              .filter((n) => !isNaN(n))
            
            if (values.length === 10) {
              self.backendQueue.push({
                timestamp: Date.now(),
                values,
                sessionId: self.currentSessionId,
              })
            }
          }
        }
      },

      // Clear buffers action
      clearBuffersAction() {
        self.dataProcessor.clear()
        self.backendQueue.clear()
        self.packetCount = 0
        self.bufferOverflowCount = 0
        self.uiSnapshot = null
        self.lastSnapshotUpdate = 0
      },

      // Utility methods - delegated to DataProcessor
      getLatestSamples(count: number, frequency: "1kHz" | "100Hz" | "10Hz" = "1kHz"): SEmgSample[] {
        return self.dataProcessor.getLatestSamples(count, frequency)
      },

      // Get channel statistics from snapshot or processor
      getChannelStatistics(sampleCount: number = 1000) {
        // Use snapshot if available for better performance
        if (self.uiSnapshot && Date.now() - self.lastSnapshotUpdate < 200) {
          return self.uiSnapshot.channelStats
        }
        
        // Otherwise get fresh data from processor
        const snapshot = self.dataProcessor.getSnapshot()
        return snapshot.channelStats
      },

      // Chart data from processor
      getChartData(
        channel: number,
        count?: number,
        frequency: "1kHz" | "100Hz" | "10Hz" = "1kHz",
      ): Array<{ x: number; y: number }> {
        return self.dataProcessor.getChartData(channel, count || 50, frequency)
      },

      // Update UI snapshot
      updateSnapshot() {
        if (self.currentSessionId) {
          const snapshot = self.dataProcessor.getSnapshot()
          self.uiSnapshot = snapshot
          self.lastSnapshotUpdate = Date.now()
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
            // Clear processor and buffers
            self.dataProcessor.clear()
            self.backendQueue.clear()
            self.packetCount = 0
            self.bufferOverflowCount = 0
            self.uiSnapshot = null
            self.lastSnapshotUpdate = 0
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

        const fullCommand = command + "\r\n"
        self.isSending = true

        try {

          const useSlowWrite = true
          let writeResult = false

          if (useSlowWrite) {
            yield sendCommandSlowly(self.selectedDevice, command)
            writeResult = true // se non fallisce, assumiamo OK
          } else {
            writeResult = yield self.selectedDevice.write(fullCommand)
          }
          self.statusMessage = `Command sent: ${command}`

          // Handle Start/Stop commands
          if (command.toLowerCase() === "start") {
            // IMPORTANT: Stop any mock streaming that might be running
            if (self.mockStreamingInterval) {
              clearInterval(self.mockStreamingInterval)
              self.mockStreamingInterval = null
            }

            const sessionId = `session_${Date.now()}`
            self.isStreaming = true
            self.currentSessionId = sessionId
            self.dataProcessor.setSessionId(sessionId)

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

            // Start snapshot update interval (5Hz)
            self.snapshotInterval = setInterval(() => {
              ;(store as any).updateSnapshot()
            }, 200)

            // Start batch processing interval - now much faster since no MobX overhead
            self.batchProcessingInterval = setInterval(() => {
              if (self.pendingLines.length > 0) {
                // Process up to 10 samples per interval
                const batchSize = Math.min(10, self.pendingLines.length)
                const batch = self.pendingLines.splice(0, batchSize)
                batch.forEach((line) => {
                  ;(store as any).processSampleData(line)
                })
              }
            }, 20) // Process every 20ms (50Hz)
            
            // Data counter for debugging
            let dataPacketCount = 0
            
            self.dataSubscription = self.selectedDevice.onDataReceived((event) => {
              dataPacketCount++
              
              // Only process every 100th packet to prevent blocking
              if (dataPacketCount % 100 !== 0) {
                return
              }
              
              const receivedData = event.data
              if (receivedData && typeof receivedData === "string") {
                const lines = receivedData.split("\r\n").filter((line) => line.trim().length > 0)
                // Only take first line from this packet
                if (lines.length > 0) {
                  if (self.pendingLines.length > 10) {
                    self.pendingLines = [] // Clear queue if it gets too big
                  }
                  self.pendingLines.push(lines[0].trim())
                }
              }
            })
          } else if (command.toLowerCase() === "stop") {
            self.isStreaming = false

            // Stop batch processing
            if (self.batchProcessingInterval) {
              clearInterval(self.batchProcessingInterval)
              self.batchProcessingInterval = null
            }
            
            // Stop snapshot updates
            if (self.snapshotInterval) {
              clearInterval(self.snapshotInterval)
              self.snapshotInterval = null
            }
            
            // Clear pending lines
            self.pendingLines = []

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

        // Generate realistic EMG data at 5Hz (very conservative)
        self.mockStreamingInterval = setInterval(() => {
          if (self.isStreaming) {
            const mockData = (self as any).generateMockEmgData()
            ;(self as any).processSampleData(mockData)
          }
        }, 200) // 200ms = 5Hz

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
        if (self.batchProcessingInterval) {
          clearInterval(self.batchProcessingInterval)
          self.batchProcessingInterval = null
        }
        if (self.snapshotInterval) {
          clearInterval(self.snapshotInterval)
          self.snapshotInterval = null
        }
        self.pendingLines = []
        self.dataProcessor.clear()
      },

      afterCreate() {
        setTimeout(() => {
          ;(self as any).checkBluetooth()
        }, 100)
      },
    }
  })

async function sendCommandSlowly(device: BluetoothDevice, command: string, delay: number = 50) {
  for (const char of command) {
    await device.write(char)
    await new Promise((res) => setTimeout(res, delay))
  }
  await device.write("\r") // usa solo \r, non \n, per compatibilità HC-05
}

export interface BluetoothStore extends Instance<typeof BluetoothStoreModel> {}
export interface BluetoothStoreSnapshotOut extends SnapshotOut<typeof BluetoothStoreModel> {}
export interface BluetoothStoreSnapshotIn extends SnapshotIn<typeof BluetoothStoreModel> {}
