// app/screens/BluetoothScreen.tsx
import { observer } from "mobx-react-lite"
import { FC, useEffect } from "react"
import {
  ViewStyle,
  TextStyle,
  View,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native"
import { Button, Screen, Text, Card, ListItem } from "@/components"
import { spacing, colors } from "@/theme"
// Use your existing MST useStores hook
import { useStores } from "@/models"
import { debugError } from "@/utils/logger"
import { useHeader } from "@/utils/useHeader"

export const BluetoothScreen: FC = observer(function BluetoothScreen() {
  // Access the bluetooth store through your existing MST pattern
  const { bluetoothStore } = useStores()

  useHeader(
    {
      title: "Bluetooth",
    },
    [],
  )

  useEffect(() => {
    // Load previous sessions on mount
    bluetoothStore.loadPreviousSessions()

    // Check Bluetooth status on mount
    bluetoothStore.checkBluetooth()

    // Cleanup function
    return () => {
      // The store's destroy method will handle cleanup
    }
  }, [bluetoothStore]) // ✅ FIXED: Include bluetoothStore dependency

  const handleConnect = async (device: any) => {
    try {
      await bluetoothStore.connectToDevice(device)
    } catch (error) {
      debugError("Connection failed:", error)
      Alert.alert("Connection Error", "Failed to connect to device")
    }
  }

  const handleDisconnect = async () => {
    try {
      await bluetoothStore.disconnectDevice()
    } catch (error) {
      debugError("Disconnection failed:", error)
    }
  }

  const { enabled, connected, connecting, streaming, sending, device, message } =
    bluetoothStore.connectionStatus

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$screenContainer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={$keyboardView}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <ScrollView contentContainerStyle={$scrollContent} keyboardShouldPersistTaps="handled">
          {/* Status Card */}
          <Card preset="default" style={$statusCard}>
            <View style={$statusRow}>
              <Text text="Bluetooth:" />
              <Text
                text={enabled ? "Enabled" : "Disabled"}
                style={[
                  $statusValue,
                  {
                    color: enabled ? colors.palette.primary500 : colors.palette.angry500,
                  },
                ]}
              />
            </View>

            <View style={$statusRow}>
              <Text text="Connection:" />
              <Text
                text={connecting ? "Connecting..." : connected ? "Connected" : "Disconnected"}
                style={[
                  $statusValue,
                  {
                    color: connected ? colors.palette.primary500 : colors.palette.neutral500,
                  },
                ]}
              />
            </View>

            <Text text={message} style={$statusMessage} />

            {streaming && (
              <View style={$streamingIndicator}>
                <Text text="🔴 STREAMING ACTIVE" style={$streamingText} />
              </View>
            )}
          </Card>

          {!connected ? (
            /* Device Selection */
            <>
              <Button
                text={connecting ? "Connecting..." : "Refresh Devices"}
                onPress={() => bluetoothStore.checkBluetooth()}
                style={$refreshButton}
                disabled={connecting}
              />

              <Text preset="subheading" text="Paired Devices" style={$sectionTitle} />

              {bluetoothStore.pairedDevices.length === 0 && (
                <Card preset="default" style={$emptyCard}>
                  <Text text="No paired devices found" style={$emptyText} />
                </Card>
              )}

              {bluetoothStore.pairedDevices.map((dev) => (
                <ListItem
                  key={dev.address}
                  text={dev.name || "Unknown Device"}
                  bottomSeparator
                  rightIcon="caretRight"
                  onPress={() => handleConnect(dev)}
                  disabled={connecting}
                  style={$deviceItem}
                />
              ))}
            </>
          ) : (
            /* Connected Device Interface */
            <>
              <Text
                preset="subheading"
                text={`Connected to: ${device?.name || device?.address}`}
                style={$connectedTitle}
              />

              {/* Control Buttons */}
              <View style={$controlButtonsRow}>
                <Button
                  text="Disconnect"
                  onPress={handleDisconnect}
                  style={$halfButton}
                  disabled={sending}
                  preset="default"
                />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  )
})

const $screenContainer: ViewStyle = {
  flex: 1,
  backgroundColor: colors.background,
}

const $keyboardView: ViewStyle = {
  flex: 1,
}

const $scrollContent: ViewStyle = {
  padding: spacing.lg,
  paddingBottom: 60,
  flexGrow: 1,
  justifyContent: "flex-start",
}

const $statusCard: ViewStyle = {
  marginBottom: spacing.lg,
}

const $statusRow: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: spacing.xs,
}

const $statusValue: TextStyle = {
  fontWeight: "bold",
}

const $statusMessage: TextStyle = {
  color: colors.palette.neutral600,
  marginTop: 4,
  fontStyle: "italic",
}

const $streamingIndicator: ViewStyle = {
  backgroundColor: colors.palette.angry100,
  padding: spacing.xs,
  borderRadius: 4,
  marginTop: spacing.sm,
}

const $streamingText: TextStyle = {
  color: colors.palette.angry500,
  fontWeight: "bold",
  textAlign: "center",
}

const $refreshButton: ViewStyle = {
  marginBottom: spacing.sm,
}

const $sectionTitle: TextStyle = {
  marginBottom: spacing.sm,
}

const $emptyCard: ViewStyle = {
  padding: spacing.md,
}

const $emptyText: TextStyle = {
  textAlign: "center",
  color: colors.palette.neutral500,
}

const $deviceItem: ViewStyle = {
  marginBottom: spacing.xs,
}

const $connectedTitle: TextStyle = {
  marginBottom: spacing.sm,
  color: colors.palette.primary500,
}

const $controlButtonsRow: ViewStyle = {
  flexDirection: "row",
  marginBottom: spacing.md,
  gap: spacing.sm,
}

const $halfButton: ViewStyle = {
  flex: 1,
}
