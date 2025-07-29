// app/models/IMUStore.ts
/**
 * MST store for IMU sensor testing and analysis
 * Provides reactive UI state for the IMU debug dashboard
 */

import { Instance, SnapshotIn, SnapshotOut, types, flow } from "mobx-state-tree"
import RNBluetoothClassic, { BluetoothDevice } from "react-native-bluetooth-classic"
import { Platform } from "react-native"
import { debugLog, debugError } from "@/utils/logger"
import {
  imuDataService,
  type IMUConnectionStatus,
  type IMUStatistics,
  type IMUSample,
} from "@/services/IMUDataService"

// Platform-specific imports
const PermissionsAndroid =
  Platform.OS === "android" ? require("react-native").PermissionsAndroid : null

// MST model for IMU statistics display
export const IMUStatisticsModel = types.model("IMUStatistics", {
  totalSamples: types.number,
  validPackets: types.number,
  invalidPackets: types.number,
  packetsPerSecond: types.number,
  actualHz: types.number,
  expectedHz: types.number,
  minInterval: types.number,
  maxInterval: types.number,
  avgInterval: types.number,
  jitter: types.number,
  dataType: types.string,
  lastUpdate: types.number,
})

// MST model for value ranges
export const ValueRangeModel = types.model("ValueRange", {
  minX: types.number,
  minY: types.number,
  minZ: types.number,
  maxX: types.number,
  maxY: types.number,
  maxZ: types.number,
})

export const IMUStoreModel = types
  .model("IMUStore", {
    // Bluetooth state
    bluetoothEnabled: types.optional(types.boolean, false),
    availableDevices: types.optional(types.array(types.frozen<BluetoothDevice>()), []),

    // Connection state
    connected: types.optional(types.boolean, false),
    connecting: types.optional(types.boolean, false),
    streaming: types.optional(types.boolean, false),
    statusMessage: types.optional(types.string, "Not connected"),
    selectedDevice: types.maybeNull(types.frozen<BluetoothDevice>()),

    // Statistics
    statistics: types.optional(IMUStatisticsModel, {
      totalSamples: 0,
      validPackets: 0,
      invalidPackets: 0,
      packetsPerSecond: 0,
      actualHz: 0,
      expectedHz: 40,
      minInterval: 0,
      maxInterval: 0,
      avgInterval: 0,
      jitter: 0,
      dataType: "unknown",
      lastUpdate: 0,
    }),

    // Value ranges
    accelRange: types.optional(ValueRangeModel, {
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 0,
      maxY: 0,
      maxZ: 0,
    }),
    gyroRange: types.optional(ValueRangeModel, {
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 0,
      maxY: 0,
      maxZ: 0,
    }),
    magRange: types.optional(ValueRangeModel, {
      minX: 0,
      minY: 0,
      minZ: 0,
      maxX: 0,
      maxY: 0,
      maxZ: 0,
    }),

    // Real-time display values
    currentAccel: types.optional(
      types.model({
        x: types.number,
        y: types.number,
        z: types.number,
      }),
      { x: 0, y: 0, z: 0 },
    ),

    currentGyro: types.optional(
      types.model({
        x: types.number,
        y: types.number,
        z: types.number,
      }),
      { x: 0, y: 0, z: 0 },
    ),

    currentMag: types.optional(
      types.model({
        x: types.number,
        y: types.number,
        z: types.number,
      }),
      { x: 0, y: 0, z: 0 },
    ),

    // UI state  
    autoScroll: types.optional(types.boolean, true),
    showRawData: types.optional(types.boolean, false),
    updateCounter: types.optional(types.number, 0), // Triggers UI updates
    debugMessage: types.optional(types.string, ""), // Debug messages visible in UI
  })
  .views((self) => ({
    get connectionStatus() {
      return {
        enabled: self.bluetoothEnabled,
        connected: self.connected,
        connecting: self.connecting,
        streaming: self.streaming,
        device: self.selectedDevice,
        message: self.statusMessage,
      }
    },

    get isValidDevice(): boolean {
      return self.selectedDevice !== null
    },

    get packetsPercentage(): number {
      const total = self.statistics.totalSamples
      if (total === 0) return 100
      return Math.round((self.statistics.validPackets / total) * 100)
    },

    get frequencyHealth(): "good" | "warning" | "bad" {
      const expected = self.statistics.expectedHz
      const actual = self.statistics.actualHz
      const deviation = Math.abs(actual - expected)

      if (deviation < 2) return "good"
      if (deviation < 5) return "warning"
      return "bad"
    },

    get dataQuality(): "excellent" | "good" | "poor" {
      const invalidRate = self.statistics.invalidPackets / Math.max(1, self.statistics.totalSamples)
      const jitter = self.statistics.jitter

      if (invalidRate < 0.01 && jitter < 10) return "excellent"
      if (invalidRate < 0.05 && jitter < 20) return "good"
      return "poor"
    },
  }))
  .actions((self) => {
    function afterCreate() {
      // Setup IMU data service callbacks
      imuDataService.setOnStatusChange((self as any).handleStatusChange)
      imuDataService.setOnDataUpdate((self as any).handleDataUpdate)
      imuDataService.setOnStatisticsUpdate((self as any).handleStatisticsUpdate)

      // Initial Bluetooth check
      setTimeout(() => {
        ;(self as any).checkBluetooth()
      }, 100)

      debugLog("IMUStore initialized with data service callbacks")
    }

    function beforeDestroy() {
      imuDataService.destroy()
      debugLog("IMUStore destroyed")
    }

    return {
      afterCreate,
      beforeDestroy,

      // Data service callbacks
      handleStatusChange(status: IMUConnectionStatus) {
        self.connected = status.connected
        self.connecting = status.connecting
        self.streaming = status.streaming
        self.statusMessage = status.message
        self.selectedDevice = status.device
      },

      handleDataUpdate(sample: IMUSample) {
        // Update current values
        self.currentAccel = { x: sample.accel.x, y: sample.accel.y, z: sample.accel.z }
        self.currentGyro = { x: sample.gyro.x, y: sample.gyro.y, z: sample.gyro.z }
        self.currentMag = { x: sample.mag.x, y: sample.mag.y, z: sample.mag.z }

        // Trigger UI update
        self.updateCounter++
      },

      handleStatisticsUpdate(stats: IMUStatistics) {
        // Update statistics
        self.statistics = {
          totalSamples: stats.totalSamples,
          validPackets: stats.validPackets,
          invalidPackets: stats.invalidPackets,
          packetsPerSecond: stats.packetsPerSecond,
          actualHz: stats.frequencyAnalysis.actualHz,
          expectedHz: stats.frequencyAnalysis.expectedHz,
          minInterval: stats.frequencyAnalysis.minInterval,
          maxInterval: stats.frequencyAnalysis.maxInterval,
          avgInterval: stats.frequencyAnalysis.avgInterval,
          jitter: stats.frequencyAnalysis.jitter,
          dataType: stats.dataAnalysis.dataType,
          lastUpdate: stats.lastUpdate,
        }

        // Update value ranges
        const ranges = stats.dataAnalysis.valueRanges
        self.accelRange = {
          minX: ranges.accel.min[0],
          minY: ranges.accel.min[1],
          minZ: ranges.accel.min[2],
          maxX: ranges.accel.max[0],
          maxY: ranges.accel.max[1],
          maxZ: ranges.accel.max[2],
        }
        self.gyroRange = {
          minX: ranges.gyro.min[0],
          minY: ranges.gyro.min[1],
          minZ: ranges.gyro.min[2],
          maxX: ranges.gyro.max[0],
          maxY: ranges.gyro.max[1],
          maxZ: ranges.gyro.max[2],
        }
        self.magRange = {
          minX: ranges.mag.min[0],
          minY: ranges.mag.min[1],
          minZ: ranges.mag.min[2],
          maxX: ranges.mag.max[0],
          maxY: ranges.mag.max[1],
          maxZ: ranges.mag.max[2],
        }
      },

      // Bluetooth actions
      setBluetoothEnabled(enabled: boolean) {
        self.bluetoothEnabled = enabled
      },

      setAvailableDevices(devices: BluetoothDevice[]) {
        self.availableDevices.replace(devices)
      },

      // UI state actions
      toggleAutoScroll() {
        self.autoScroll = !self.autoScroll
      },

      toggleShowRawData() {
        self.showRawData = !self.showRawData
      },

      // Connection management
      connectToDevice: flow(function* (device: BluetoothDevice) {
        console.log("🧪 UI DEBUG: Attempting to connect to device:", device.name)
        self.debugMessage = `🔌 Connecting to ${device.name}...`
        
        const success = yield imuDataService.connectToDevice(device)
        
        if (success) {
          self.debugMessage = `✅ Connected to ${device.name}`
          console.log("🧪 UI DEBUG: Successfully connected to device")
        } else {
          self.debugMessage = `❌ Failed to connect to ${device.name}`
          console.log("🧪 UI DEBUG: Failed to connect to device")
        }
        
        return success
      }),

      disconnectDevice: flow(function* () {
        yield imuDataService.disconnectDevice()
      }),

      startStreaming: flow(function* () {
        console.log("🧪 UI DEBUG: Starting streaming process...")
        self.debugMessage = "🚀 Starting streaming..."
        
        const success = yield imuDataService.startStreaming()
        
        if (success) {
          self.debugMessage = "✅ Streaming started successfully"
          console.log("🧪 UI DEBUG: Streaming started successfully")
        } else {
          self.debugMessage = "❌ Failed to start streaming"
          console.log("🧪 UI DEBUG: Failed to start streaming")
        }
        
        return success
      }),

      stopStreaming: flow(function* () {
        const success = yield imuDataService.stopStreaming()
        return success
      }),

      // Device discovery
      checkBluetooth: flow(function* () {
        try {
          // Request permissions
          let hasPermissions = true
          if (Platform.OS === "android" && PermissionsAndroid) {
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
            } catch (e) {
              debugError("Permission request failed:", e)
              hasPermissions = false
            }
          }

          if (!hasPermissions) {
            self.statusMessage = "Bluetooth permissions denied"
            return
          }

          // Check if Bluetooth is enabled
          const enabled = yield RNBluetoothClassic.isBluetoothEnabled()
          ;(self as any).setBluetoothEnabled(enabled)

          if (!enabled) {
            self.statusMessage = "Bluetooth is disabled"
            return
          }

          // Get paired devices
          const devices = yield RNBluetoothClassic.getBondedDevices()
          ;(self as any).setAvailableDevices(devices)

          debugLog(`Found ${devices.length} paired devices`)
        } catch (error: any) {
          debugError("Bluetooth check failed:", error)
          self.statusMessage = `Bluetooth error: ${error?.message || "Unknown error"}`
        }
      }),

      discoverDevices: flow(function* () {
        try {
          self.statusMessage = "Discovering devices..."

          // Start discovery
          const discovering = yield RNBluetoothClassic.startDiscovery()

          if (discovering) {
            // Note: getDiscoveredDevices may not be available on all platforms
            // We'll use paired devices list for now
            const devices = yield RNBluetoothClassic.getBondedDevices()
            ;(self as any).setAvailableDevices(devices)
            self.statusMessage = `Found ${devices.length} devices`
          }

          // Stop discovery
          yield RNBluetoothClassic.cancelDiscovery()
        } catch (error: any) {
          debugError("Device discovery failed:", error)
          self.statusMessage = `Discovery error: ${error?.message || "Unknown error"}`
        }
      }),

      // Data access methods
      getLatestSamples(count: number) {
        return imuDataService.getLatestSamples(count)
      },

      getRawDataSamples(count: number) {
        return imuDataService.getRawDataSamples(count)
      },

      exportTestData() {
        return imuDataService.exportTestData()
      },

      getStatistics() {
        return imuDataService.getStatistics()
      },
    }
  })

export interface IMUStore extends Instance<typeof IMUStoreModel> {}
export interface IMUStoreSnapshotOut extends SnapshotOut<typeof IMUStoreModel> {}
export interface IMUStoreSnapshotIn extends SnapshotIn<typeof IMUStoreModel> {}
