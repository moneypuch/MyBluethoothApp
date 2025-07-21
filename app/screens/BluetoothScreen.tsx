// app/screens/BluetoothScreen.tsx
import { observer } from "mobx-react-lite"
import React, { FC, useState, useEffect } from "react"
import {
  ViewStyle,
  TextStyle,
  View,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from "react-native"
import { Button, Screen, Text, Card, ListItem } from "@/components"
import { spacing, colors } from "@/theme"
// Use your existing MST useStores hook
import { useStores } from "@/models"

export const BluetoothScreen: FC = observer(function BluetoothScreen() {
  // Access the bluetooth store through your existing MST pattern
  const { bluetoothStore } = useStores()
  const [inputCommand, setInputCommand] = useState("")

  useEffect(() => {
    // Load previous sessions on mount
    bluetoothStore.loadPreviousSessions()

    // Check Bluetooth status on mount
    bluetoothStore.checkBluetooth()

    // Cleanup function
    return () => {
      // The store's destroy method will handle cleanup
    }
  }, []) // ✅ FIXED: Empty dependency array - runs only on mount

  const handleSendCommand = async (command: string) => {
    if (!command.trim()) return

    const success = await bluetoothStore.sendCommand(command.trim())
    if (success) {
      setInputCommand("")
    }
  }

  const handleConnect = async (device: any) => {
    try {
      await bluetoothStore.connectToDevice(device)
    } catch (error) {
      console.error("Connection failed:", error)
      Alert.alert("Connection Error", "Failed to connect to device")
    }
  }

  const handleDisconnect = async () => {
    try {
      await bluetoothStore.disconnectDevice()
    } catch (error) {
      console.error("Disconnection failed:", error)
    }
  }

  const handleStartStreaming = async () => {
    const success = await bluetoothStore.startStreamingCommand()
    if (!success) {
      Alert.alert("Error", "Failed to start streaming")
    }
  }

  const handleStopStreaming = async () => {
    const success = await bluetoothStore.stopStreamingCommand()
    if (!success) {
      Alert.alert("Error", "Failed to stop streaming")
    }
  }

  const {
    enabled,
    connected,
    connecting,
    streaming,
    sending,
    device,
    message,
    packetCount,
    buffer1kHzCount,
    buffer100HzCount,
  } = bluetoothStore.connectionStatus

  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$screenContainer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <ScrollView
          contentContainerStyle={{
            padding: spacing.lg,
            paddingBottom: 60,
            flexGrow: 1,
            justifyContent: "flex-start",
          }}
          keyboardShouldPersistTaps="handled"
        >
          <Text preset="heading" text="sEMG Board" style={$title} />

          {/* Status Card */}
          <Card preset="default" style={{ marginBottom: spacing.lg }}>
            <View style={$statusRow}>
              <Text text="Bluetooth:" />
              <Text
                text={enabled ? "Abilitato" : "Disabilitato"}
                style={{
                  color: enabled ? colors.palette.primary500 : colors.palette.angry500,
                  fontWeight: "bold",
                }}
              />
            </View>

            <View style={$statusRow}>
              <Text text="Connessione:" />
              <Text
                text={connecting ? "Connessione..." : connected ? "Connesso" : "Disconnesso"}
                style={{
                  color: connected ? colors.palette.primary500 : colors.palette.neutral500,
                  fontWeight: connected ? "bold" : "normal",
                }}
              />
            </View>

            <Text
              text={message}
              style={{
                color: colors.palette.neutral600,
                marginTop: 4,
                fontStyle: "italic",
              }}
            />

            {streaming && (
              <View style={$streamingIndicator}>
                <Text text="🔴 STREAMING ATTIVO" style={$streamingText} />
              </View>
            )}
          </Card>

          {!connected ? (
            /* Device Selection */
            <>
              <Button
                text={connecting ? "Connessione..." : "Aggiorna dispositivi"}
                onPress={() => bluetoothStore.checkBluetooth()}
                style={{ marginBottom: spacing.sm }}
                disabled={connecting}
              />

              <Text
                preset="subheading"
                text="Dispositivi associati"
                style={{ marginBottom: spacing.sm }}
              />

              {bluetoothStore.pairedDevices.length === 0 && (
                <Card preset="default" style={{ padding: spacing.md }}>
                  <Text
                    text="Nessun dispositivo associato trovato"
                    style={{ textAlign: "center", color: colors.palette.neutral500 }}
                  />
                </Card>
              )}

              {bluetoothStore.pairedDevices.map((dev) => (
                <ListItem
                  key={dev.address}
                  text={dev.name || "Dispositivo sconosciuto"}
                  bottomSeparator
                  rightIcon="caretRight"
                  onPress={() => handleConnect(dev)}
                  disabled={connecting}
                  style={{ marginBottom: spacing.xs }}
                />
              ))}
            </>
          ) : (
            /* Connected Device Interface */
            <>
              <Text
                preset="subheading"
                text={`Connesso a: ${device?.name || device?.address}`}
                style={{
                  marginBottom: spacing.sm,
                  color: colors.palette.primary500,
                }}
              />

              {/* Control Buttons */}
              <View style={$controlButtonsRow}>
                <Button
                  text="Disconnetti"
                  onPress={handleDisconnect}
                  style={$halfButton}
                  disabled={sending}
                  preset="default"
                />
                <Button
                  text={streaming ? "Stop" : "Start"}
                  onPress={streaming ? handleStopStreaming : handleStartStreaming}
                  style={$halfButton}
                  disabled={sending}
                  preset={streaming ? "filled" : "default"}
                />
              </View>

              {/* Custom Command Input */}
              <Card preset="default" style={{ marginBottom: spacing.md }}>
                <Text text="Comandi Personalizzati" style={$sectionTitle} />
                <View style={$commandInputRow}>
                  <TextInput
                    style={$input}
                    placeholder="Invia comando custom..."
                    value={inputCommand}
                    onChangeText={setInputCommand}
                    editable={connected && !sending}
                    returnKeyType="send"
                    blurOnSubmit={true}
                    onSubmitEditing={() => {
                      if (inputCommand.trim()) {
                        handleSendCommand(inputCommand)
                      }
                    }}
                  />
                  <Button
                    text="Invia"
                    onPress={() => handleSendCommand(inputCommand)}
                    disabled={!inputCommand.trim() || sending}
                    style={{ marginLeft: spacing.xs }}
                  />
                </View>
              </Card>

              {/* Statistics */}
              <Card preset="default" style={{ marginBottom: spacing.md }}>
                <Text text="Statistiche Sessione" style={$sectionTitle} />
                <View style={$statsGrid}>
                  <View style={$statItem}>
                    <Text text="Pacchetti" style={$statLabel} />
                    <Text text={packetCount.toString()} style={$statValue} />
                  </View>
                  <View style={$statItem}>
                    <Text text="Buffer 1kHz" style={$statLabel} />
                    <Text text={buffer1kHzCount.toString()} style={$statValue} />
                  </View>
                  <View style={$statItem}>
                    <Text text="Buffer 100Hz" style={$statLabel} />
                    <Text text={buffer100HzCount.toString()} style={$statValue} />
                  </View>
                  <View style={$statItem}>
                    <Text text="Frequenza" style={$statLabel} />
                    <Text text={streaming ? "1000 Hz" : "0 Hz"} style={$statValue} />
                  </View>
                </View>

                {bluetoothStore.currentSessionId && (
                  <Text text={`Sessione: ${bluetoothStore.currentSessionId}`} style={$sessionId} />
                )}
              </Card>

              {/* Latest Data Preview */}
              <Card preset="default" style={{ marginBottom: spacing.md }}>
                <Text text="Ultimi Campioni (1kHz)" style={$sectionTitle} />
                {bluetoothStore.latest1kHzSamples.length === 0 ? (
                  <Text
                    text="Nessun dato disponibile"
                    style={{
                      textAlign: "center",
                      color: colors.palette.neutral500,
                      fontStyle: "italic",
                      marginTop: spacing.sm,
                    }}
                  />
                ) : (
                  <View style={{ maxHeight: 200 }}>
                    {bluetoothStore.latest1kHzSamples.map((item, index) => (
                      <View key={item.timestamp.toString()} style={$sampleItem}>
                        <Text text={`#${index + 1}`} style={$sampleIndex} />
                        <Text
                          text={`[${item.values.map((v) => v.toFixed(1)).join(", ")}]`}
                          style={$sampleValues}
                          numberOfLines={1}
                        />
                        <Text
                          text={new Date(item.timestamp).toLocaleTimeString()}
                          style={$sampleTime}
                        />
                      </View>
                    ))}
                  </View>
                )}
              </Card>

              {/* Navigation Buttons */}
              <View style={$navigationButtons}>
                <Button
                  text="Visualizza Grafici"
                  onPress={() => {
                    // Navigate to charts screen
                    // navigation.navigate("Charts")
                    Alert.alert("Info", "Funzionalità dei grafici in arrivo")
                  }}
                  style={$halfButton}
                  disabled={!connected}
                />
                <Button
                  text="Cronologia Sessioni"
                  onPress={() => {
                    // Navigate to sessions screen
                    // navigation.navigate("Sessions")
                    Alert.alert("Info", "Cronologia sessioni in arrivo")
                  }}
                  style={$halfButton}
                />
              </View>

              {/* Quick Actions */}
              <Card preset="default" style={{ marginTop: spacing.md }}>
                <Text text="Azioni Rapide" style={$sectionTitle} />
                <View style={$quickActionsGrid}>
                  <Button
                    text="Help"
                    onPress={() => handleSendCommand("Help")}
                    disabled={sending}
                    style={$quickActionButton}
                  />
                  <Button
                    text="Test"
                    onPress={() => handleSendCommand("test")}
                    disabled={sending}
                    style={$quickActionButton}
                  />
                  <Button
                    text="Status"
                    onPress={() => handleSendCommand("status")}
                    disabled={sending}
                    style={$quickActionButton}
                  />
                  <Button
                    text="Clear Buffer"
                    onPress={() => {
                      bluetoothStore.clearBuffersAction() // ✅ FIXED: Use proper MST action
                    }}
                    disabled={streaming}
                    style={$quickActionButton}
                  />
                </View>
              </Card>
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

const $title: TextStyle = {
  marginBottom: spacing.lg,
  textAlign: "center",
}

const $statusRow: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: spacing.xs,
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

const $controlButtonsRow: ViewStyle = {
  flexDirection: "row",
  marginBottom: spacing.md,
  gap: spacing.sm,
}

const $halfButton: ViewStyle = {
  flex: 1,
}

const $sectionTitle: TextStyle = {
  fontWeight: "bold",
  marginBottom: spacing.sm,
  color: colors.palette.neutral700,
}

const $commandInputRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
}

const $input: ViewStyle = {
  flex: 1,
  borderWidth: 1,
  borderColor: colors.palette.neutral300,
  borderRadius: 8,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  backgroundColor: colors.palette.neutral100,
}

const $statsGrid: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  justifyContent: "space-between",
}

const $statItem: ViewStyle = {
  width: "48%",
  marginBottom: spacing.sm,
}

const $statLabel: TextStyle = {
  fontSize: 12,
  color: colors.palette.neutral500,
}

const $statValue: TextStyle = {
  fontSize: 18,
  fontWeight: "bold",
  color: colors.palette.primary500,
}

const $sessionId: TextStyle = {
  fontSize: 10,
  color: colors.palette.neutral400,
  marginTop: spacing.xs,
  fontFamily: "monospace",
}

const $sampleItem: ViewStyle = {
  backgroundColor: colors.palette.neutral100,
  padding: spacing.xs,
  marginBottom: spacing.xs,
  borderRadius: 4,
}

const $sampleIndex: TextStyle = {
  fontSize: 12,
  fontWeight: "bold",
  color: colors.palette.primary500,
}

const $sampleValues: TextStyle = {
  fontSize: 11,
  fontFamily: "monospace",
  color: colors.palette.neutral700,
  marginVertical: 2,
}

const $sampleTime: TextStyle = {
  fontSize: 10,
  color: colors.palette.neutral500,
}

const $navigationButtons: ViewStyle = {
  flexDirection: "row",
  gap: spacing.sm,
}

const $quickActionsGrid: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
}

const $quickActionButton: ViewStyle = {
  width: "48%",
}
