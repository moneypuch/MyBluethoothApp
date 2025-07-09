import { observer } from "mobx-react-lite"
import { FC, useEffect, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { ViewStyle, TextStyle, Platform, ScrollView, RefreshControl, View } from "react-native"
import { Button, Screen, Text, Card, EmptyState, ListItem, Icon } from "@/components"
import { DemoTabScreenProps } from "@/navigators/DemoNavigator"
import { spacing, colors } from "@/theme"
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

    const getStatusIcon = () => {
      if (!bluetoothAvailable) return "x"
      if (!bluetoothEnabled) return "x"
      if (!permissionsGranted) return "x"
      return "check"
    }

    const getStatusColor = () => {
      if (bluetoothAvailable && bluetoothEnabled && permissionsGranted) {
        return colors.palette.success500
      }
      return colors.palette.angry500
    }

    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$screenContainer}>
        <ScrollView
          style={$scrollView}
          contentContainerStyle={$contentContainer}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
        >
          <Text preset="heading" text="Bluetooth Manager" style={$title} />

          {/* Status Card */}
          <Card
            preset="default"
            verticalAlignment="center"
            headingTx=""
            HeadingComponent={
              <View style={$statusHeader}>
                <Icon icon={getStatusIcon()} color={getStatusColor()} size={24} />
                <Text preset="subheading" text="Bluetooth Status" style={$statusTitle} />
              </View>
            }
            ContentComponent={
              <View style={$statusContent}>
                <StatusRow label="Available" value={bluetoothAvailable} />
                <StatusRow label="Enabled" value={bluetoothEnabled} />
                <StatusRow label="Permissions" value={permissionsGranted} />
                <Text style={$statusMessage} text={statusMessage} />
              </View>
            }
          />

          {/* Controls Card */}
          <Card
            preset="default"
            headingTx=""
            HeadingComponent={
              <View style={$controlsHeader}>
                <Icon icon="settings" color={colors.palette.primary500} size={24} />
                <Text preset="subheading" text="Controls" style={$controlsTitle} />
              </View>
            }
            ContentComponent={
              <View style={$controlsContent}>
                <Button
                  text="🔄 Refresh Status"
                  preset="default"
                  onPress={checkBluetoothStatus}
                  style={$controlButton}
                />
                <Button
                  text={isDiscovering ? "⏹️ Stop Discovery" : "🔍 Start Discovery"}
                  preset={isDiscovering ? "reversed" : "filled"}
                  onPress={isDiscovering ? stopDiscovery : startDiscovery}
                  disabled={!bluetoothEnabled || !permissionsGranted}
                  style={$controlButton}
                />
              </View>
            }
          />

          {/* Paired Devices */}
          <Card
            preset="default"
            headingTx=""
            HeadingComponent={
              <View style={$devicesHeader}>
                <Icon icon="heart" color={colors.palette.secondary500} size={24} />
                <Text preset="subheading" text="Paired Devices" style={$devicesTitle} />
                <Text style={$deviceCount} text={`(${pairedDevices.length})`} />
              </View>
            }
            ContentComponent={
              pairedDevices.length > 0 ? (
                <View style={$devicesContent}>
                  {pairedDevices.map((device, index) => (
                    <DeviceListItem
                      key={device.id || index}
                      device={device}
                      isPaired={true}
                      showSeparator={index < pairedDevices.length - 1}
                    />
                  ))}
                </View>
              ) : (
                <EmptyState
                  preset="generic"
                  headingTx=""
                  contentTx=""
                  buttonTx=""
                  HeadingComponent={<Text text="No Paired Devices" />}
                  ContentComponent={<Text text="No devices have been paired yet" />}
                  style={$emptyState}
                />
              )
            }
          />

          {/* Discovered Devices */}
          <Card
            preset="default"
            headingTx=""
            HeadingComponent={
              <View style={$devicesHeader}>
                <Icon icon="components" color={colors.palette.accent500} size={24} />
                <Text preset="subheading" text="Discovered Devices" style={$devicesTitle} />
                <Text style={$deviceCount} text={`(${discoveredDevices.length})`} />
              </View>
            }
            ContentComponent={
              discoveredDevices.length > 0 ? (
                <View style={$devicesContent}>
                  {discoveredDevices.map((device, index) => (
                    <DeviceListItem
                      key={device.id || index}
                      device={device}
                      isPaired={false}
                      showSeparator={index < discoveredDevices.length - 1}
                    />
                  ))}
                </View>
              ) : (
                <EmptyState
                  preset="generic"
                  headingTx=""
                  contentTx=""
                  buttonTx=""
                  HeadingComponent={<Text text="No Devices Found" />}
                  ContentComponent={<Text text="Start discovery to find nearby devices" />}
                  style={$emptyState}
                />
              )
            }
          />
        </ScrollView>
      </Screen>
    )
  },
)

const StatusRow: FC<{ label: string; value: boolean }> = ({ label, value }) => (
  <View style={$statusRow}>
    <Text text={`${label}: `} style={$statusLabel} />
    <Icon
      icon={value ? "check" : "x"}
      color={value ? colors.palette.success500 : colors.palette.angry500}
      size={16}
    />
    <Text text={value ? "Yes" : "No"} style={$statusValue} />
  </View>
)

const DeviceListItem: FC<{
  device: BluetoothDevice
  isPaired: boolean
  showSeparator: boolean
}> = ({ device, isPaired, showSeparator }) => (
  <ListItem
    text={device.name || "Unknown Device"}
    bottomSeparator={showSeparator}
    leftIcon={isPaired ? "heart" : "components"}
    leftIconColor={isPaired ? colors.palette.secondary500 : colors.palette.accent500}
    rightIcon="caretRight"
    onPress={() => console.log("Device pressed:", device.name)}
    style={$deviceItem}
    TextProps={{
      numberOfLines: 1,
      style: $deviceName,
    }}
    LeftComponent={
      <View style={$deviceLeftSection}>
        <Icon
          icon={isPaired ? "heart" : "components"}
          color={isPaired ? colors.palette.secondary500 : colors.palette.accent500}
          size={20}
        />
        <View style={$deviceInfo}>
          <Text text={device.name || "Unknown Device"} style={$deviceName} />
          <Text text={device.address} style={$deviceAddress} />
          <Text text={`ID: ${device.id}`} style={$deviceId} />
        </View>
      </View>
    }
  />
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

const $statusHeader: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: spacing.md,
}

const $statusTitle: TextStyle = {
  marginLeft: spacing.sm,
}

const $statusContent: ViewStyle = {
  gap: spacing.xs,
}

const $statusRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: spacing.xs,
}

const $statusLabel: TextStyle = {
  fontSize: 14,
  fontWeight: "500",
}

const $statusValue: TextStyle = {
  fontSize: 14,
  marginLeft: spacing.xs,
}

const $statusMessage: TextStyle = {
  marginTop: spacing.sm,
  fontStyle: "italic",
  opacity: 0.8,
  textAlign: "center",
}

const $controlsHeader: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: spacing.md,
}

const $controlsTitle: TextStyle = {
  marginLeft: spacing.sm,
}

const $controlsContent: ViewStyle = {
  gap: spacing.sm,
}

const $controlButton: ViewStyle = {
  marginBottom: spacing.xs,
}

const $devicesHeader: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: spacing.md,
}

const $devicesTitle: TextStyle = {
  marginLeft: spacing.sm,
}

const $deviceCount: TextStyle = {
  marginLeft: spacing.xs,
  opacity: 0.7,
}

const $devicesContent: ViewStyle = {
  // No specific styling needed
}

const $deviceItem: ViewStyle = {
  paddingVertical: spacing.sm,
}

const $deviceLeftSection: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  flex: 1,
}

const $deviceInfo: ViewStyle = {
  marginLeft: spacing.sm,
  flex: 1,
}

const $deviceName: TextStyle = {
  fontSize: 16,
  fontWeight: "600",
  color: colors.palette.primary500,
}

const $deviceAddress: TextStyle = {
  fontSize: 12,
  opacity: 0.8,
  marginTop: spacing.xxs,
}

const $deviceId: TextStyle = {
  fontSize: 10,
  opacity: 0.6,
  marginTop: spacing.xxs,
}

const $emptyState: ViewStyle = {
  paddingVertical: spacing.md,
}
