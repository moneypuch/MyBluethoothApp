import { observer } from "mobx-react-lite"
import React, { FC, useEffect, useState, useRef } from "react"
import { ViewStyle, TextStyle, View, TextInput, FlatList, KeyboardAvoidingView, Platform, PermissionsAndroid, ScrollView } from "react-native"
import { Button, Screen, Text, Card, ListItem } from "@/components"
import { spacing, colors } from "@/theme"
import RNBluetoothClassic, { BluetoothDevice } from "react-native-bluetooth-classic"

interface SEmgSample {
  timestamp: number
  values: number[] // 10 canali
}

export const BluetoothScreen2: FC = observer(function BluetoothScreen2() {
  const [bluetoothEnabled, setBluetoothEnabled] = useState(false)
  const [pairedDevices, setPairedDevices] = useState<BluetoothDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState<BluetoothDevice | null>(null)
  const [connected, setConnected] = useState(false)
  const [statusMessage, setStatusMessage] = useState("")
  const [isConnecting, setIsConnecting] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [inputCommand, setInputCommand] = useState("")
  const [packetCount, setPacketCount] = useState(0)
  const [buffer1kHz, setBuffer1kHz] = useState<SEmgSample[]>([])
  const [buffer100Hz, setBuffer100Hz] = useState<SEmgSample[]>([])
  const [downsampleCounter, setDownsampleCounter] = useState(0)
  const [terminator, setTerminator] = useState<'\r' | '\n' | '\r\n'>('\r')
  const subscriptionRef = useRef<any>(null)

  const MAX_1KHZ = 10000 // 10 secondi di dati
  const MAX_100HZ = 1000 // 10 secondi di dati a 100Hz

  useEffect(() => {
    checkBluetooth()
    return () => {
      disconnectDevice()
    }
  }, [])

  // Funzione per richiedere il permesso BLUETOOTH_CONNECT su Android 12+
  async function requestBluetoothConnectPermission() {
    if (Platform.OS === 'android' && Platform.Version >= 31) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        {
          title: 'Permesso Bluetooth',
          message: "L'app ha bisogno del permesso per connettersi ai dispositivi Bluetooth",
          buttonNeutral: 'Chiedi dopo',
          buttonNegative: 'Annulla',
          buttonPositive: 'OK',
        },
      );
      return granted === PermissionsAndroid.RESULTS.GRANTED;
    }
    return true;
  }

  const checkBluetooth = async () => {
    try {
      // Richiedi permesso esplicito su Android 12+
      const hasConnectPermission = await requestBluetoothConnectPermission();
      if (!hasConnectPermission) {
        setStatusMessage("Permesso BLUETOOTH_CONNECT non concesso");
        return;
      }
      const enabled = await RNBluetoothClassic.isBluetoothEnabled()
      setBluetoothEnabled(enabled)
      if (enabled) {
        const paired = await RNBluetoothClassic.getBondedDevices()
        console.log("Paired devices:", paired);
        setPairedDevices(paired || [])
      } else {
        setStatusMessage("Bluetooth non abilitato")
      }
    } catch (e: any) {
      setStatusMessage("Errore nel controllo Bluetooth")
    }
  }

  // Rimuovo subscribeToData dalla connessione automatica
  const connectToDevice = async (device: BluetoothDevice) => {
    setIsConnecting(true)
    setStatusMessage("Connessione in corso...")
    try {
      await disconnectDevice()
      const connected = await device.connect()
      setConnected(connected)
      setSelectedDevice(device)
      setStatusMessage(connected ? `Connesso a ${device.name || device.address}` : "Connessione fallita")
      setPacketCount(0)
      setBuffer1kHz([])
      setBuffer100Hz([])
      setDownsampleCounter(0)
      // NON chiamare subscribeToData qui!
    } catch (e: any) {
      setStatusMessage("Errore di connessione: " + e.message)
      setConnected(false)
      setSelectedDevice(null)
    } finally {
      setIsConnecting(false)
    }
  }

  const disconnectDevice = async () => {
    if (selectedDevice && connected) {
      try {
        await selectedDevice.disconnect()
        setStatusMessage("Disconnesso da " + (selectedDevice.name || selectedDevice.address))
      } catch {}
    }
    setConnected(false)
    setSelectedDevice(null)
    if (subscriptionRef.current) {
      subscriptionRef.current.remove()
      subscriptionRef.current = null
    }
  }

  // Funzione per inviare un comando lettera per lettera con delay (come nell'app web)
  const sendSequentially = async (message: string, delay = 50) => {
    if (!selectedDevice || !connected) return;
    for (let i = 0; i < message.length; i++) {
      const char = message[i];
      await selectedDevice.write(char);
      console.log(`Lettera '${char}' inviata`);
      await new Promise(res => setTimeout(res, delay));
    }
  };

  // Modifico sendCommand per gestire Start/Stop
  const sendCommand = async (cmd: string) => {
    const term = terminator;
    const fullCmd = cmd + term;
    setIsSending(true);
    try {
      await sendSequentially(fullCmd, 50);
      setStatusMessage(`Comando inviato (lettera per lettera): ${fullCmd}`);
      console.log("Comando inviato (lettera per lettera):", fullCmd);
      if (cmd.toLowerCase() === "start") {
        // Attiva la ricezione dati SOLO dopo Start
        if (selectedDevice) subscribeToData(selectedDevice);
      }
      if (cmd.toLowerCase() === "stop") {
        // Disattiva la ricezione dati dopo Stop
        if (subscriptionRef.current) {
          subscriptionRef.current.remove();
          subscriptionRef.current = null;
        }
      }
    } catch (e: any) {
      setStatusMessage("Errore invio comando: " + e.message);
      console.log("Errore invio comando (lettera per lettera):", e.message);
    } finally {
      setIsSending(false);
    }
  };
  

  // Parsing robusto: 10 canali, split su spazio, rimozione \r\n
  const subscribeToData = (device: BluetoothDevice) => {
    if (subscriptionRef.current) {
      subscriptionRef.current.remove()
    }
    let buffer = ""
    subscriptionRef.current = device.onDataReceived((event: any) => {
      console.log("RAW DATA:", JSON.stringify(event.data))
      buffer += event.data
      let lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ""
      lines.forEach((line) => {
        const values = line.trim().split(/\s+/).map((n) => Number(n)).filter((n) => !isNaN(n))
        if (values.length === 10) {
          const sample: SEmgSample = { timestamp: Date.now(), values }
          setBuffer1kHz((prev) => {
            const next = [sample, ...prev]
            return next.length > MAX_1KHZ ? next.slice(0, MAX_1KHZ) : next
          })
          setPacketCount((prev) => prev + 1)
          setDownsampleCounter((prev) => {
            if ((prev + 1) >= 10) {
              setBuffer100Hz((prev100) => {
                const next100 = [sample, ...prev100]
                return next100.length > MAX_100HZ ? next100.slice(0, MAX_100HZ) : next100
              })
              return 0
            }
            return prev + 1
          })
        }
      })
    })
  }

  // UI
  return (
    <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$screenContainer}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60, flexGrow: 1, justifyContent: 'flex-start' }}
          keyboardShouldPersistTaps="handled"
        >
          <Text preset="heading" text="sEMG Board" style={$title} />
          <Card preset="default" style={{ marginBottom: spacing.lg }}>
            <Text text={`Stato Bluetooth: ${bluetoothEnabled ? "Abilitato" : "Disabilitato"}`} />
            <Text text={statusMessage} style={{ color: colors.palette.neutral600, marginTop: 4 }} />
          </Card>
          {!connected ? (
            <>
              <Button text="Aggiorna dispositivi" onPress={checkBluetooth} style={{ marginBottom: spacing.sm }} />
              <Text preset="subheading" text="Dispositivi associati" style={{ marginBottom: spacing.sm }} />
              {pairedDevices.length === 0 && <Text text="Nessun dispositivo associato" />}
              {pairedDevices.map((dev) => (
                <ListItem
                  key={dev.address}
                  text={`${dev.name || dev.address}`}
                  rightIcon="check"
                  onPress={() => connectToDevice(dev)}
                  disabled={isConnecting}
                  style={{ marginBottom: spacing.xs }}
                />
              ))}
            </>
          ) : (
            <>
              <Text preset="subheading" text={`Connesso a: ${selectedDevice?.name || selectedDevice?.address}`} style={{ marginBottom: spacing.sm, color: colors.palette.primary500 }} />
              <View style={{ flexDirection: "row", marginBottom: spacing.md }}>
                <Button text="Disconnetti" onPress={disconnectDevice} style={{ flex: 1, marginRight: spacing.sm }} />
                <Button text="Start" onPress={() => sendCommand("Start")} style={{ flex: 1, marginRight: spacing.sm }} disabled={isSending} />
                <Button text="Stop" onPress={() => sendCommand("Stop")} style={{ flex: 1 }} disabled={isSending} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md }}>
                <Text text="Terminatore: " style={{ marginRight: spacing.sm }} />
                <Button text="\\r" onPress={() => setTerminator('\r')} preset={terminator === '\r' ? 'filled' : 'default'} style={{ marginRight: spacing.xs }} />
                <Button text="\\n" onPress={() => setTerminator('\n')} preset={terminator === '\n' ? 'filled' : 'default'} style={{ marginRight: spacing.xs }} />
                <Button text="\\r\\n" onPress={() => setTerminator('\r\n')} preset={terminator === '\r\n' ? 'filled' : 'default'} />
              </View>
              <View style={{ flexDirection: "row", marginBottom: spacing.md }}>
                <TextInput
                  style={$input}
                  placeholder="Invia comando custom..."
                  value={inputCommand}
                  onChangeText={setInputCommand}
                  editable={connected && !isSending}
                  returnKeyType="send"
                  blurOnSubmit={true}
                />
                <Button text="Invia" onPress={() => { sendCommand(inputCommand); setInputCommand("") }} disabled={!inputCommand || isSending} style={{ marginLeft: spacing.xs }} />
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