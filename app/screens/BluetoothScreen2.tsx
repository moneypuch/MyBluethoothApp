import { observer } from "mobx-react-lite"
import React, { FC, useEffect, useState, useRef } from "react"
import { ViewStyle, TextStyle, View, TextInput, FlatList, KeyboardAvoidingView, Platform, PermissionsAndroid } from "react-native"
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
  const [rawData, setRawData] = useState<string[]>([])
  const subscriptionRef = useRef<any>(null)
  const MAX_1KHZ = 10000 // 10 secondi di dati
  const MAX_100HZ = 1000 // 10 secondi di dati a 100Hz
  const [terminator, setTerminator] = useState<'\r' | '\n' | '\r\n'>('\r')

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

  // Funzione per inviare una stringa lettera per lettera con delay
  const sendStringCharByChar = async (str: string, delayMs = 10) => {
    if (!selectedDevice || !connected) return
    for (let i = 0; i < str.length; i++) {
      await selectedDevice.write(str[i])
      await new Promise((res) => setTimeout(res, delayMs))
    }
  }

  // Funzione per inviare dati ASCII in base64 tramite writeToDevice
  const writeAscii = async (data: string) => {
    if (!selectedDevice || !connected) return;

    // Converti stringa in array di byte ASCII
    const asciiBytes = Array.from(data).map(c => c.charCodeAt(0));
    let base64: string;
    if (typeof Buffer !== 'undefined') {
      base64 = Buffer.from(asciiBytes).toString('base64');
    } else {
      // Fallback: usa btoa se Buffer non è disponibile
      base64 = typeof btoa !== 'undefined'
        ? btoa(String.fromCharCode(...asciiBytes))
        : '';
    }

    try {
      const deviceAny = selectedDevice as any;
      if (typeof deviceAny.writeToDevice === 'function') {
        await deviceAny.writeToDevice(base64);
        setStatusMessage(`Comando ASCII inviato (base64): ${data}`);
        console.log("Comando ASCII inviato (base64):", base64);
      } else {
        setStatusMessage("writeToDevice non disponibile su questo device!");
        console.log("writeToDevice non disponibile su questo device!");
      }
    } catch (e: any) {
      setStatusMessage("Errore invio ASCII: " + e.message);
    }
  };

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
      setRawData(prev => [event.data, ...prev.slice(0, 4)])
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
      <View style={{ padding: spacing.lg }}>
        <Text preset="heading" text="Bluetooth sEMG Board" style={$title} />
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
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <View style={{ flexDirection: "row", marginBottom: spacing.md }}>
                <TextInput
                  style={$input}
                  placeholder="Invia comando custom..."
                  value={inputCommand}
                  onChangeText={setInputCommand}
                  editable={connected && !isSending}
                />
                <Button text="Invia" onPress={() => { sendCommand(inputCommand); setInputCommand("") }} disabled={!inputCommand || isSending} style={{ marginLeft: spacing.xs }} />
              </View>
            </KeyboardAvoidingView>
            <Card preset="default" style={{ marginBottom: spacing.md, marginTop: spacing.md }}>
              <Text text={`Pacchetti ricevuti: ${packetCount}`} style={{ marginBottom: 4 }} />
              <Text text={`Buffer 1kHz: ${buffer1kHz.length} campioni | Buffer 100Hz: ${buffer100Hz.length} campioni`} style={{ marginBottom: 4 }} />
            </Card>
            <Text preset="subheading" text="Ultimi dati RAW ricevuti" style={{ marginTop: spacing.md }} />
            {rawData.map((d, i) => (
              <Text key={i} text={d} style={{ fontSize: 12, color: colors.palette.neutral600 }} />
            ))}
            <Text preset="subheading" text="Ultimi 10 campioni (1kHz)" style={{ marginBottom: spacing.sm }} />
            <FlatList
              data={buffer1kHz.slice(0, 10)}
              keyExtractor={(item) => item.timestamp.toString()}
              renderItem={({ item, index }) => (
                <Card style={{ marginBottom: spacing.xs, padding: spacing.sm }}>
                  <Text text={`#${index + 1} [${item.values.join(", ")}]`} />
                  <Text text={new Date(item.timestamp).toLocaleTimeString()} style={{ fontSize: 10, color: colors.palette.neutral500 }} />
                </Card>
              )}
              style={{ maxHeight: 300 }}
            />
            <Text preset="subheading" text="Ultimi 10 campioni (100Hz)" style={{ marginBottom: spacing.sm, marginTop: spacing.md }} />
            <FlatList
              data={buffer100Hz.slice(0, 10)}
              keyExtractor={(item) => item.timestamp.toString()}
              renderItem={({ item, index }) => (
                <Card style={{ marginBottom: spacing.xs, padding: spacing.sm }}>
                  <Text text={`#${index + 1} [${item.values.join(", ")}]`} />
                  <Text text={new Date(item.timestamp).toLocaleTimeString()} style={{ fontSize: 10, color: colors.palette.neutral500 }} />
                </Card>
              )}
              style={{ maxHeight: 300 }}
            />
          </>
        )}
      </View>
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