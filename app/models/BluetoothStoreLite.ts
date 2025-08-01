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
  deviceType: types.maybeNull(types.enumeration("DeviceType", ["HC-05", "IMU"])),
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

    get deviceType(): "HC-05" | "IMU" | null {
      if (!self.selectedDevice?.name) return null

      const deviceName = self.selectedDevice.name.toLowerCase()

      if (deviceName.includes("hc-05") || deviceName.includes("hc05")) {
        return "HC-05"
      }

      if (deviceName.includes("imu")) {
        return "IMU"
      }

      return null
    },
  }))
  .actions((self) => {
    // Setup data service callbacks on creation
    function afterCreate() {
      // Setup data service callbacks
      bluetoothDataService.setOnStatusChange((self as any).handleStatusChange)
      bluetoothDataService.setOnDataUpdate((self as any).handleDataUpdate)
      bluetoothDataService.setOnSessionUpdate((self as any).handleSessionUpdate)

      // Initial Bluetooth check
      setTimeout(() => {
        ;(self as any).checkBluetooth()
      }, 100)

      debugLog("BluetoothStoreLite initialized with data service callbacks")
    }

    function beforeDestroy() {
      // Cleanup data service
      bluetoothDataService.destroy()
      debugLog("BluetoothStoreLite destroyed")
    }

    return {
      afterCreate,
      beforeDestroy,

      // Data service callback handlers (MST actions)
      handleStatusChange(status: BluetoothConnectionStatus) {
        self.connected = status.connected
        self.connecting = status.connecting
        self.streaming = status.streaming
        self.statusMessage = status.message
        self.selectedDevice = status.device
      },

      handleDataUpdate(stats: DataStatistics) {
        self.totalSamples = stats.totalSamples
        self.packetsReceived = stats.packetsReceived
        self.samplesPerSecond = stats.samplesPerSecond
        self.lastUpdate = stats.lastUpdate
      },

      handleSessionUpdate(sessions: SessionInfo[]) {
        const mstSessions = sessions.map((session) => ({
          id: session.id,
          deviceName: session.deviceName,
          deviceAddress: session.deviceAddress,
          deviceType: session.deviceType,
          startTime: session.startTime,
          endTime: session.endTime,
          sampleCount: session.sampleCount,
        }))
        self.sessions.replace(mstSessions)
      },
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

      // Session management (fetch from backend API)
      loadPreviousSessions: flow(function* () {
        try {
          debugLog("Loading sessions from backend API...")
          const { api } = require("@/services/api")

          const result = yield api.getSessions({ limit: 20, offset: 0 })

          if (result.kind === "ok") {
            const backendSessions = result.data.sessions
            debugLog(`Loaded ${backendSessions.length} sessions from backend`)

            // Convert backend session format to local format
            const sessions = backendSessions.map((session: any) => ({
              id: session.sessionId,
              deviceName: session.deviceName,
              deviceAddress: session.deviceId,
              deviceType: session.deviceType || null, // Include device type from backend
              startTime: new Date(session.startTime).getTime(),
              endTime: session.endTime ? new Date(session.endTime).getTime() : undefined,
              sampleCount: session.totalSamples || 0,
            }))

            ;(self as any).handleSessionUpdate(sessions)
            return sessions
          } else {
            debugError("Failed to load sessions from backend:", result)
            // Fallback to local sessions
            const localSessions = bluetoothDataService.getSessions()
            ;(self as any).handleSessionUpdate(localSessions)
            return localSessions.map((session) => ({
              id: session.id,
              deviceName: session.deviceName,
              deviceAddress: session.deviceAddress,
              deviceType: session.deviceType,
              startTime: session.startTime,
              endTime: session.endTime,
              sampleCount: session.sampleCount,
            }))
          }
        } catch (error) {
          debugError("Error loading sessions:", error)
          // Fallback to local sessions
          const localSessions = bluetoothDataService.getSessions()
          ;(self as any).handleSessionUpdate(localSessions)
          return localSessions.map((session) => ({
            id: session.id,
            deviceName: session.deviceName,
            deviceAddress: session.deviceAddress,
            deviceType: session.deviceType,
            startTime: session.startTime,
            endTime: session.endTime,
            sampleCount: session.sampleCount,
          }))
        }
      }),

      loadSessionData: flow(function* (sessionId: string) {
        try {
          debugLog("Loading session data for:", sessionId)
          const { api } = require("@/services/api")

          const result = yield api.getSessionData(sessionId, { maxPoints: 10000 })

          if (result.kind === "ok") {
            debugLog("Successfully loaded session data")
            return result.data
          } else {
            debugError("Failed to load session data:", result)
            return null
          }
        } catch (error) {
          debugError("Error loading session data:", error)
          return null
        }
      }),

      deleteSession: flow(function* (sessionId: string) {
        try {
          debugLog("Deleting session:", sessionId)
          const { api } = require("@/services/api")

          const result = yield api.deleteSession(sessionId)

          if (result.kind === "ok") {
            debugLog("Successfully deleted session:", result.data.message)
            // Refresh sessions list to remove deleted session
            yield (self as any).loadPreviousSessions()
            return { success: true, message: result.data.message }
          } else {
            debugError("Failed to delete session:", result)
            return { success: false, message: "Failed to delete session" }
          }
        } catch (error) {
          debugError("Error deleting session:", error)
          return { success: false, message: "Error deleting session" }
        }
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

      // Mock functionality for development/testing (delegate to data service)
      connectToMockDevice() {
        bluetoothDataService.connectToMockDevice()
      },

      disconnectMockDevice() {
        bluetoothDataService.disconnectMockDevice()
      },

      startMockStreaming: flow(function* () {
        const success = yield bluetoothDataService.startMockStreaming()
        return success
      }),

      stopMockStreaming: flow(function* () {
        const success = yield bluetoothDataService.stopMockStreaming()
        return success
      }),

      startMockBluetooth() {
        bluetoothDataService.startMockBluetooth()
      },

      // Backend sync control
      enableBackendSync() {
        bluetoothDataService.enableBackendSync()
      },

      disableBackendSync() {
        bluetoothDataService.disableBackendSync()
      },

      setBackendSyncEnabled(enabled: boolean) {
        if (enabled) {
          bluetoothDataService.enableBackendSync()
        } else {
          bluetoothDataService.disableBackendSync()
        }
      },
    }
  })

export interface BluetoothStoreLite extends Instance<typeof BluetoothStoreLiteModel> {}
export interface BluetoothStoreLiteSnapshotOut
  extends SnapshotOut<typeof BluetoothStoreLiteModel> {}
export interface BluetoothStoreLiteSnapshotIn extends SnapshotIn<typeof BluetoothStoreLiteModel> {}
