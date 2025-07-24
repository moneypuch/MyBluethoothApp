// app/models/BluetoothStoreLite.ts
/**
 * Lightweight MST store that delegates to BluetoothDataService
 * Only handles UI state and reactive properties, no high-frequency data processing
 */

import { Instance, SnapshotIn, SnapshotOut, types, flow } from "mobx-state-tree"
import RNBluetoothClassic, { BluetoothDevice } from "react-native-bluetooth-classic"
import { Platform, PermissionsAndroid } from "react-native"
import { debugLog, debugError, debugWarn } from "@/utils/logger"
import {
  bluetoothDataService,
  type BluetoothConnectionStatus,
  type DataStatistics,
  type SessionInfo,
} from "@/services/BluetoothDataService"

// MST model for session display
export const BluetoothSessionModel = types.model("BluetoothSession", {
  id: types.string,
  deviceName: types.string,
  deviceAddress: types.string,
  startTime: types.number,
  endTime: types.maybe(types.number),
  sampleCount: types.number,
})

export const BluetoothStoreLiteModel = types
  .model("BluetoothStoreLite", {
    // UI state only (no high-frequency data)
    bluetoothEnabled: types.optional(types.boolean, false),
    pairedDevices: types.optional(types.array(types.frozen<BluetoothDevice>()), []),

    // Connection status (updated via data service callbacks)
    connected: types.optional(types.boolean, false),
    connecting: types.optional(types.boolean, false),
    streaming: types.optional(types.boolean, false),
    statusMessage: types.optional(types.string, ""),
    selectedDevice: types.maybeNull(types.frozen<BluetoothDevice>()),

    // Data statistics (updated via throttled callbacks)
    totalSamples: types.optional(types.number, 0),
    packetsReceived: types.optional(types.number, 0),
    samplesPerSecond: types.optional(types.number, 0),
    lastUpdate: types.optional(types.number, 0),

    // Sessions (updated via data service callbacks)
    sessions: types.optional(types.array(BluetoothSessionModel), []),
  })
  .volatile((_self) => ({
    // Non-reactive cleanup references
    dataServiceCallbacks: null as any,
  }))
  .views((self) => ({
    get connectionStatus() {
      return {
        enabled: self.bluetoothEnabled,
        connected: self.connected,
        connecting: self.connecting,
        streaming: self.streaming,
        sending: false, // No longer tracked at high frequency
        device: self.selectedDevice,
        message: self.statusMessage,
        packetCount: self.packetsReceived,
        samplesPerSecond: self.samplesPerSecond,
        lastUpdate: self.lastUpdate,
        pairedDevicesCount: self.pairedDevices.length,
      }
    },

    get pairedDevicesList(): BluetoothDevice[] {
      return self.pairedDevices.slice()
    },

    get currentDevice(): BluetoothDevice | null {
      return self.selectedDevice
    },
  }))
  .actions((self) => {
    // Data service callback handlers
    const handleStatusChange = (status: BluetoothConnectionStatus) => {
      self.connected = status.connected
      self.connecting = status.connecting
      self.streaming = status.streaming
      self.statusMessage = status.message
      self.selectedDevice = status.device
    }

    const handleDataUpdate = (stats: DataStatistics) => {
      self.totalSamples = stats.totalSamples
      self.packetsReceived = stats.packetsReceived
      self.samplesPerSecond = stats.samplesPerSecond
      self.lastUpdate = stats.lastUpdate
    }

    const handleSessionUpdate = (sessions: SessionInfo[]) => {
      const mstSessions = sessions.map((session) => ({
        id: session.id,
        deviceName: session.deviceName,
        deviceAddress: session.deviceAddress,
        startTime: session.startTime,
        endTime: session.endTime,
        sampleCount: session.sampleCount,
      }))
      self.sessions.replace(mstSessions)
    }

    return {
      // Basic setters for Bluetooth discovery
      setBluetoothEnabled(enabled: boolean) {
        self.bluetoothEnabled = enabled
      },

      setPairedDevices(devices: BluetoothDevice[]) {
        self.pairedDevices.replace(devices)
      },

      // Data access methods (delegate to data service)
      getLatestSamples(count: number, frequency: "1kHz" | "100Hz" | "10Hz" = "1kHz") {
        return bluetoothDataService.getLatestSamples(count, frequency)
      },

      getChartData(channel: number, count?: number, frequency: "1kHz" | "100Hz" | "10Hz" = "1kHz") {
        return bluetoothDataService.getChartData(channel, count, frequency)
      },

      getStatistics() {
        return bluetoothDataService.getStatistics()
      },

      // Connection management (delegate to data service)
      connectToDevice: flow(function* (device: BluetoothDevice) {
        const success = yield bluetoothDataService.connectToDevice(device)
        return success
      }),

      disconnectDevice: flow(function* () {
        yield bluetoothDataService.disconnectDevice()
      }),

      // Streaming control (delegate to data service)
      startStreamingCommand: flow(function* () {
        const success = yield bluetoothDataService.startStreaming()
        return success
      }),

      stopStreamingCommand: flow(function* () {
        const success = yield bluetoothDataService.stopStreaming()
        return success
      }),

      // Bluetooth discovery
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
              debugWarn("Permission request failed:", error)
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
          debugError("Bluetooth check error:", error)
          self.statusMessage = `Bluetooth check error: ${error.message}`
        }
      }),

      // Session management (delegate to data service)
      loadPreviousSessions: flow(function* () {
        // For now, just return current sessions from data service
        // In the future, this could load from API
        const sessions = bluetoothDataService.getSessions()
        handleSessionUpdate(sessions)
        return sessions.map((session) => ({
          id: session.id,
          deviceName: session.deviceName,
          deviceAddress: session.deviceAddress,
          startTime: session.startTime,
          endTime: session.endTime,
          sampleCount: session.sampleCount,
        }))
      }),

      loadSessionData: flow(function* (sessionId: string) {
        // Placeholder for future API integration
        debugLog("Loading session data for:", sessionId)
        return null
      }),

      // Legacy method compatibility
      sendCommand: flow(function* (command: string) {
        // This method is now handled internally by data service
        // But keep for compatibility with existing screens
        if (command.toLowerCase() === "start") {
          const success = yield (self as any).startStreamingCommand()
          return success
        } else if (command.toLowerCase() === "stop") {
          const success = yield (self as any).stopStreamingCommand()
          return success
        }
        return false
      }),

      // Mock functionality for development/testing
      connectToMockDevice() {
        debugLog("Mock device connection - using real device interface")
        // For development, we can implement mock behavior if needed
      },

      disconnectMockDevice() {
        debugLog("Mock device disconnection")
        ;(self as any).disconnectDevice()
      },

      startMockStreaming() {
        debugLog("Mock streaming - using real streaming interface")
        ;(self as any).startStreamingCommand()
      },

      stopMockStreaming() {
        debugLog("Mock streaming stop")
        ;(self as any).stopStreamingCommand()
      },

      // Setup data service callbacks
      afterCreate() {
        // Setup data service callbacks
        bluetoothDataService.setOnStatusChange(handleStatusChange)
        bluetoothDataService.setOnDataUpdate(handleDataUpdate)
        bluetoothDataService.setOnSessionUpdate(handleSessionUpdate)

        // Initial Bluetooth check
        setTimeout(() => {
          ;(self as any).checkBluetooth()
        }, 100)

        debugLog("BluetoothStoreLite initialized with data service callbacks")
      },

      beforeDestroy() {
        // Cleanup data service
        bluetoothDataService.destroy()
        debugLog("BluetoothStoreLite destroyed")
      },
    }
  })

export interface BluetoothStoreLite extends Instance<typeof BluetoothStoreLiteModel> {}
export interface BluetoothStoreLiteSnapshotOut
  extends SnapshotOut<typeof BluetoothStoreLiteModel> {}
export interface BluetoothStoreLiteSnapshotIn extends SnapshotIn<typeof BluetoothStoreLiteModel> {}
