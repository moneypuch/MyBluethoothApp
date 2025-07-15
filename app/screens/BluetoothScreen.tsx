// app/screens/BluetoothScreen.tsx
import { observer } from "mobx-react-lite"
import React, { FC, useState, useEffect } from "react"
import {
  ViewStyle,
  TextStyle,
  View,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
  }, [bluetoothStore])

  const handleSendCommand = async (command: string) => {
    await bluetoothStore.sendCommand(command)
    setInputCommand("")
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
            <Text text={`Stato Bluetooth: ${enabled ? "Abilitato" : "Disabilitato"}`} />
            <Text text={message} style={{ color: colors.palette.neutral600, marginTop: 4 }} />
            {streaming && (
              <Text
                text="🔴 STREAMING ATTIVO"
                style={{
                  color: colors.palette.angry500,
                  marginTop: 4,
                  fontWeight: "bold",
                }}
              />
            )}
          </Card>

          {!connected ? (
            /* Device Selection */
            <>
              <Button
                text="Aggiorna dispositivi"
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
                <Text text="Nessun dispositivo associato" />
              )}

              {bluetoothStore.pairedDevices.map((dev) => (
                <ListItem
                  key={dev.address}
                  text={`${dev.name || dev.address}`}
                  rightIcon="check"
                  onPress={() => bluetoothStore.connectToDevice(dev)}
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
              <View style={{ flexDirection: "row", marginBottom: spacing.md }}>
                <Button
                  text="Disconnetti"
                  onPress={() => bluetoothStore.disconnectDevice()}
                  style={{ flex: 1, marginRight: spacing.sm }}
                  disabled={sending}
                />
                <Button
                  text={streaming ? "Stop" : "Start"}
                  onPress={() =>
                    streaming
                      ? bluetoothStore.stopStreamingCommand()
                      : bluetoothStore.startStreamingCommand()
                  }
                  style={{ flex: 1 }}
                  disabled={sending}
                  preset={streaming ? "filled" : "default"}
                />
              </View>

              {/* Terminator Selection */}
              <View
                style={{ flexDirection: "row", alignItems: "center", marginBottom: spacing.md }}
              >
                <Text text="Terminatore: " style={{ marginRight: spacing.sm }} />
                <Button
                  text="\\r"
                  onPress={() => bluetoothStore.setTerminator("\r")}
                  preset="default"
                  style={{ marginRight: spacing.xs }}
                />
                <Button
                  text="\\n"
                  onPress={() => bluetoothStore.setTerminator("\n")}
                  preset="default"
                  style={{ marginRight: spacing.xs }}
                />
                <Button
                  text="\\r\\n"
                  onPress={() => bluetoothStore.setTerminator("\r\n")}
                  preset="default"
                />
              </View>

              {/* Custom Command Input */}
              <View style={{ flexDirection: "row", marginBottom: spacing.md }}>
                <TextInput
                  style={$input}
                  placeholder="Invia comando custom..."
                  value={inputCommand}
                  onChangeText={setInputCommand}
                  editable={connected && !sending}
                  returnKeyType="send"
                  blurOnSubmit={true}
                  onSubmitEditing={() => {
                    if (inputCommand) {
                      handleSendCommand(inputCommand)
                    }
                  }}
                />
                <Button
                  text="Invia"
                  onPress={() => handleSendCommand(inputCommand)}
                  disabled={!inputCommand || sending}
                  style={{ marginLeft: spacing.xs }}
                />
              </View>

              {/* Statistics */}
              <Card preset="default" style={{ marginBottom: spacing.md }}>
                <Text text={`Pacchetti: ${packetCount}`} style={{ marginBottom: 4 }} />
                <Text
                  text={`Buffer 1kHz: ${buffer1kHzCount} | Buffer 100Hz: ${buffer100HzCount}`}
                />
                {bluetoothStore.currentSessionId && (
                  <Text
                    text={`Sessione: ${bluetoothStore.currentSessionId}`}
                    style={{ fontSize: 12, color: colors.palette.neutral500 }}
                  />
                )}
              </Card>

              {/* Latest Data Preview */}
              <Text
                preset="subheading"
                text="Ultimi campioni 1kHz"
                style={{ marginBottom: spacing.sm }}
              />
              <FlatList
                data={bluetoothStore.latest1kHzSamples}
                keyExtractor={(item) => item.timestamp.toString()}
                renderItem={({ item, index }) => (
                  <Card style={{ marginBottom: spacing.xs, padding: spacing.sm }}>
                    <Text text={`#${index + 1} [${item.values.join(", ")}]`} />
                    <Text
                      text={new Date(item.timestamp).toLocaleTimeString()}
                      style={{ fontSize: 10, color: colors.palette.neutral500 }}
                    />
                  </Card>
                )}
                style={{ maxHeight: 200 }}
                scrollEnabled={true}
              />

              {/* Navigation Buttons */}
              <View style={{ flexDirection: "row", marginTop: spacing.md }}>
                <Button
                  text="Visualizza Grafici"
                  onPress={() => {
                    // Navigate to charts screen
                    // navigation.navigate("Charts")
                  }}
                  style={{ flex: 1, marginRight: spacing.sm }}
                  disabled={!connected}
                />
                <Button
                  text="Cronologia Sessioni"
                  onPress={() => {
                    // Navigate to sessions screen
                    // navigation.navigate("Sessions")
                  }}
                  style={{ flex: 1 }}
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

const $title: TextStyle = {
  marginBottom: spacing.lg,
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
