import { observer } from "mobx-react-lite"
import { FC, useEffect, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { ViewStyle, TextStyle, Platform, ScrollView, RefreshControl, View } from "react-native"
import { Button, Screen, Text } from "@/components"
import { DemoTabScreenProps } from "@/navigators/DemoNavigator"
import { spacing } from "@/theme"
import RNBluetoothClassic from "react-native-bluetooth-classic"
import { PERMISSIONS, request, RESULTS } from "react-native-permissions"

interface BluetoothDevice {
  id: string
  name: string
  address: string
  bonded?: boolean
  deviceClass?: any
  extra?: any
}

export const BluetoothScreen: FC<DemoTabScreenProps<"Bluetooth">> = observer(
  function BluetoothScreen() {
    const [bluetoothEnabled, setBluetoothEnabled] = useState(false)
    const [bluetoothAvailable, setBluetoothAvailable] = useState(false)
    const [pairedDevices, setPairedDevices] = useState<BluetoothDevice[]>([])
    const [discoveredDevices, setDiscoveredDevices] = useState<BluetoothDevice[]>([])
    const [isDiscovering, setIsDiscovering] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [permissionsGranted, setPermissionsGranted] = useState(false)
    const [statusMessage, setStatusMessage] = useState("Checking Bluetooth status...")

    useEffect(() => {
      checkBluetoothStatus()
    }, [])

    const requestBluetoothPermissions = async (): Promise<boolean> => {
      try {
        if (Platform.OS === "android" && Platform.Version >= 31) {
          const bluetoothConnectStatus = await request(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT)
          const bluetoothScanStatus = await request(PERMISSIONS.ANDROID.BLUETOOTH_SCAN)

          console.log("Bluetooth Connect permission:", bluetoothConnectStatus)
          console.log("Bluetooth Scan permission:", bluetoothScanStatus)

          if (
            bluetoothConnectStatus === RESULTS.GRANTED &&
            bluetoothScanStatus === RESULTS.GRANTED
          ) {
            setPermissionsGranted(true)
            return true
          } else {
            setStatusMessage("Bluetooth permissions not granted")
            return false
          }
        } else {
          setPermissionsGranted(true)
          return true
        }
      } catch (error) {
        console.error("Permission request failed:", error)
        setStatusMessage("Permission request failed")
        return false
      }
    }

    const checkBluetoothStatus = async () => {
      try {
        setStatusMessage("Checking permissions...")

        const hasPermissions = await requestBluetoothPermissions()
        if (!hasPermissions) return

        setStatusMessage("Checking Bluetooth availability...")

        // Check availability
        const available = await RNBluetoothClassic.isBluetoothAvailable()
        setBluetoothAvailable(available)
        console.log("Bluetooth available:", available)

        if (!available) {
          setStatusMessage("Bluetooth not available on this device")
          return
        }

        // Check if enabled
        const enabled = await RNBluetoothClassic.isBluetoothEnabled()
        setBluetoothEnabled(enabled)
        console.log("Bluetooth enabled:", enabled)

        if (!enabled) {
          setStatusMessage("Bluetooth is disabled. Please enable it in settings.")
          return
        }

        setStatusMessage("Bluetooth ready!")
        await loadPairedDevices()
      } catch (error) {
        console.error("Bluetooth status check failed:", error)
        setStatusMessage(`Error: ${error.message}`)
      }
    }

    const loadPairedDevices = async () => {
      try {
        const paired = await RNBluetoothClassic.getBondedDevices()
        setPairedDevices(paired || [])
        console.log("Paired devices:", paired)
        setStatusMessage(`Found ${paired?.length || 0} paired devices`)
      } catch (error) {
        console.error("Cannot get bonded devices:", error)
        setStatusMessage("Cannot load paired devices")
      }
    }

    const startDiscovery = async () => {
      if (!bluetoothEnabled || !permissionsGranted) {
        setStatusMessage("Bluetooth not ready for discovery")
        return
      }

      try {
        setIsDiscovering(true)
        setDiscoveredDevices([])
        setStatusMessage("Discovering devices...")

        const discovering = await RNBluetoothClassic.startDiscovery()
        console.log("Discovery started:", discovering)

        // Set timeout to stop discovery after 30 seconds
        setTimeout(async () => {
          if (isDiscovering) {
            await stopDiscovery()
          }
        }, 30000)

        // Listen for discovered devices (you might need to implement listeners)
        setStatusMessage("Discovery in progress... (30s timeout)")
      } catch (error) {
        console.error("Cannot start discovery:", error)
        setStatusMessage(`Discovery failed: ${error.message}`)
        setIsDiscovering(false)
      }
    }

    const stopDiscovery = async () => {
      try {
        await RNBluetoothClassic.cancelDiscovery()
        setIsDiscovering(false)
        setStatusMessage("Discovery stopped")
        console.log("Discovery stopped")
      } catch (error) {
        console.error("Cannot stop discovery:", error)
        setIsDiscovering(false)
      }
    }

    const onRefresh = async () => {
      setIsRefreshing(true)
      await checkBluetoothStatus()
      setIsRefreshing(false)
    }

    const renderDevice = (device: BluetoothDevice, index: number) => (
      <DeviceCard key={device.id || index} device={device} />
    )

    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$screenContainer}>
        <ScrollView
          style={$scrollView}
          contentContainerStyle={$contentContainer}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        >
          <Text preset="heading" text="Bluetooth Devices" style={$title} />

          {/* Status Section */}
          <StatusCard
            available={bluetoothAvailable}
            enabled={bluetoothEnabled}
            permissions={permissionsGranted}
            message={statusMessage}
          />

          {/* Controls */}
          <ControlsCard
            onRefresh={checkBluetoothStatus}
            onStartDiscovery={startDiscovery}
            onStopDiscovery={stopDiscovery}
            isDiscovering={isDiscovering}
            bluetoothReady={bluetoothEnabled && permissionsGranted}
          />

          {/* Paired Devices */}
          <Text preset="subheading" text="Paired Devices" style={$sectionTitle} />
          {pairedDevices.length > 0 ? (
            pairedDevices.map(renderDevice)
          ) : (
            <Text text="No paired devices found" style={$emptyText} />
          )}

          {/* Discovered Devices */}
          <Text preset="subheading" text="Discovered Devices" style={$sectionTitle} />
          {discoveredDevices.length > 0 ? (
            discoveredDevices.map(renderDevice)
          ) : (
            <Text text="No devices discovered" style={$emptyText} />
          )}
        </ScrollView>
      </Screen>
    )
  },
)

const StatusCard: FC<{
  available: boolean
  enabled: boolean
  permissions: boolean
  message: string
}> = ({ available, enabled, permissions, message }) => (
  <View style={$statusCard}>
    <Text preset="bold" text="Bluetooth Status" style={$cardTitle} />
    <Text text={`Available: ${available ? "✅" : "❌"}`} style={$statusText} />
    <Text text={`Enabled: ${enabled ? "✅" : "❌"}`} style={$statusText} />
    <Text text={`Permissions: ${permissions ? "✅" : "❌"}`} style={$statusText} />
    <Text text={message} style={$messageText} />
  </View>
)

const ControlsCard: FC<{
  onRefresh: () => void
  onStartDiscovery: () => void
  onStopDiscovery: () => void
  isDiscovering: boolean
  bluetoothReady: boolean
}> = ({ onRefresh, onStartDiscovery, onStopDiscovery, isDiscovering, bluetoothReady }) => (
  <View style={$controlsCard}>
    <Text preset="bold" text="Controls" style={$cardTitle} />
    <Button text="🔄 Refresh Status" preset="default" onPress={onRefresh} style={$controlButton} />
    <Button
      text={isDiscovering ? "⏹️ Stop Discovery" : "🔍 Start Discovery"}
      preset={isDiscovering ? "reversed" : "default"}
      onPress={isDiscovering ? onStopDiscovery : onStartDiscovery}
      disabled={!bluetoothReady}
      style={$controlButton}
    />
  </View>
)

const DeviceCard: FC<{ device: BluetoothDevice }> = ({ device }) => (
  <View style={$deviceCard}>
    <Text preset="bold" text={device.name || "Unknown Device"} style={$deviceName} />
    <Text text={`Address: ${device.address}`} style={$deviceInfo} />
    <Text text={`ID: ${device.id}`} style={$deviceInfo} />
    {device.bonded !== undefined && (
      <Text text={`Bonded: ${device.bonded ? "✅" : "❌"}`} style={$deviceInfo} />
    )}
  </View>
)

const $screenContainer: ViewStyle = {
  flex: 1,
}

const $scrollView: ViewStyle = {
  flex: 1,
}

const $contentContainer: ViewStyle = {
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
}

const $title: TextStyle = {
  marginBottom: spacing.lg,
  textAlign: "center",
}

const $sectionTitle: TextStyle = {
  marginTop: spacing.xl,
  marginBottom: spacing.md,
}

const $statusCard: ViewStyle = {
  backgroundColor: "rgba(0,0,0,0.05)",
  padding: spacing.md,
  borderRadius: 8,
  marginBottom: spacing.md,
}

const $controlsCard: ViewStyle = {
  backgroundColor: "rgba(0,0,0,0.03)",
  padding: spacing.md,
  borderRadius: 8,
  marginBottom: spacing.md,
}

const $deviceCard: ViewStyle = {
  backgroundColor: "rgba(0,0,0,0.02)",
  padding: spacing.md,
  borderRadius: 8,
  marginBottom: spacing.sm,
  borderLeftWidth: 4,
  borderLeftColor: "#007AFF",
}

const $cardTitle: TextStyle = {
  marginBottom: spacing.sm,
}

const $statusText: TextStyle = {
  marginBottom: spacing.xs,
  fontSize: 14,
}

const $messageText: TextStyle = {
  marginTop: spacing.sm,
  fontStyle: "italic",
  opacity: 0.8,
}

const $controlButton: ViewStyle = {
  marginBottom: spacing.sm,
}

const $deviceName: TextStyle = {
  marginBottom: spacing.xs,
  color: "#007AFF",
}

const $deviceInfo: TextStyle = {
  fontSize: 12,
  opacity: 0.8,
  marginBottom: spacing.xs,
}

const $emptyText: TextStyle = {
  textAlign: "center",
  fontStyle: "italic",
  opacity: 0.6,
  marginVertical: spacing.md,
}
