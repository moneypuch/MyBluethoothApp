// app/screens/IMUDebugScreen.tsx
/**
 * IMU Debug Dashboard Screen
 * Real-time monitoring and analysis of IMU sensor data at 40Hz
 */

import { FC, useEffect, useRef } from "react"
import { observer } from "mobx-react-lite"
import {
  View,
  ScrollView,
  Alert,
  Share,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from "react-native"
import { Text, Button, Card, Screen } from "@/components"
import { Switch } from "@/components/Toggle/Switch"
import { useStores } from "@/models"
import { colors, spacing, typography } from "@/theme"
import { BluetoothDevice } from "react-native-bluetooth-classic"
import { useAppTheme } from "@/utils/useAppTheme"
import type { ThemedStyle } from "@/theme"
import { IMUDebugHelper } from "@/utils/IMUDebugHelper"

export const IMUDebugScreen: FC = observer(function IMUDebugScreen() {
  const { imuStore } = useStores()
  const { themed } = useAppTheme()
  const scrollViewRef = useRef<ScrollView>(null)

  // Auto-scroll to bottom when new data arrives
  useEffect(() => {
    if (imuStore.autoScroll && imuStore.streaming && scrollViewRef.current) {
      scrollViewRef.current.scrollToEnd({ animated: true })
    }
  }, [imuStore.updateCounter, imuStore.autoScroll, imuStore.streaming])

  // Periodic Bluetooth check
  useEffect(() => {
    const interval = setInterval(() => {
      if (!imuStore.connected && !imuStore.connecting) {
        imuStore.checkBluetooth()
      }
    }, 5000)

    return () => clearInterval(interval)
  }, [imuStore])

  const handleDeviceSelect = async (device: BluetoothDevice) => {
    try {
      const success = await imuStore.connectToDevice(device)
      if (!success) {
        Alert.alert("Connection Failed", "Could not connect to IMU device")
      }
    } catch (error: any) {
      Alert.alert("Error", `Connection error: ${error?.message || "Unknown error"}`)
    }
  }

  const handleExportData = async () => {
    try {
      const data = imuStore.exportTestData()
      await Share.share({
        message: data,
        title: "IMU Test Data Export",
      })
    } catch (error: any) {
      Alert.alert("Export Failed", error?.message || "Unknown error")
    }
  }

  const handleRunDiagnostics = () => {
    IMUDebugHelper.logConnectionDiagnostics()
    IMUDebugHelper.suggestTroubleshootingSteps()
    Alert.alert(
      "Diagnostics Complete", 
      "Check the console logs for detailed diagnostic information and troubleshooting suggestions."
    )
  }

  const handleTestConfigurations = async () => {
    Alert.alert(
      "Testing Configurations", 
      "This will test different delimiter and command combinations. Check console logs for results."
    )
    
    try {
      const workingConfig = await IMUDebugHelper.runAllTests()
      if (workingConfig) {
        Alert.alert(
          "Configuration Found!", 
          `Working configuration: ${workingConfig.testDescription}\n\nCheck console logs for details.`
        )
      } else {
        Alert.alert(
          "No Working Configuration", 
          "None of the test configurations worked. Check console logs and IMU documentation."
        )
      }
    } catch (error: any) {
      Alert.alert("Test Error", error?.message || "Unknown error")
    }
  }

  const handleTestMockData = async () => {
    try {
      const success = await IMUDebugHelper.testMockData()
      Alert.alert(
        success ? "Mock Test Passed" : "Mock Test Failed", 
        success 
          ? "Mock data was processed successfully. Data processing is working correctly."
          : "Mock data test failed. Check console logs for details."
      )
    } catch (error: any) {
      Alert.alert("Mock Test Error", error?.message || "Unknown error")
    }
  }

  const handleTestConnection = async () => {
    try {
      console.log("🧪 UI: Starting connection test...")
      const { imuDataService } = await import("@/services/IMUDataService")
      const success = await imuDataService.testConnection()
      
      Alert.alert(
        success ? "Connection Test Passed" : "Connection Test Failed",
        success 
          ? "Basic communication with device is working. Check console for details."
          : "Cannot communicate with device. Check console logs for details."
      )
    } catch (error: any) {
      Alert.alert("Connection Test Error", error?.message || "Unknown error")
    }
  }

  const handleTestCommonCommands = async () => {
    try {
      console.log("🧪 UI: Testing common IMU commands...")
      const { imuDataService } = await import("@/services/IMUDataService")
      
      Alert.alert(
        "Testing Common Commands",
        "This will test various common IMU commands (START, start, S, 1, ON, etc.). Check console for progress..."
      )
      
      const result = await imuDataService.testCommonIMUCommands()
      
      if (result !== "none_worked") {
        Alert.alert("Command Found!", `✅ SUCCESS: Command "${result}" works! Check console for data flow.`)
      } else {
        Alert.alert("No Commands Worked", "❌ None of the common commands triggered data. Your IMU may need:\n\n1. Specific initialization sequence\n2. Different commands (check documentation)\n3. Configuration before streaming\n4. Authentication/pairing")
      }
    } catch (error: any) {
      Alert.alert("Command Test Error", error?.message || "Unknown error")
    }
  }

  const handleTestCommandApproaches = async () => {
    try {
      console.log("🧪 UI: Testing different command approaches...")
      const { imuDataService } = await import("@/services/IMUDataService")
      
      Alert.alert(
        "Testing Command Approaches",
        "This will test slow/fast write methods with different terminators. Check console for progress..."
      )
      
      const result = await imuDataService.testCommandApproaches()
      
      let message = ""
      switch (result) {
        case "slow_r_success":
          message = "✅ SUCCESS: Slow write with \\r terminator works!"
          break
        case "fast_n_success":
          message = "✅ SUCCESS: Fast write with \\n terminator works!"
          break
        case "fast_r_success":
          message = "✅ SUCCESS: Fast write with \\r terminator works!"
          break
        default:
          message = "❌ None of the command approaches worked. Check IMU documentation."
      }
      
      Alert.alert("Command Test Results", message)
    } catch (error: any) {
      Alert.alert("Command Test Error", error?.message || "Unknown error")
    }
  }

  const renderDeviceItem = ({ item }: { item: BluetoothDevice }) => (
    <Card
      style={themed($deviceCard)}
      HeadingComponent={
        <View style={$deviceHeader}>
          <Text preset="bold">{item.name || "Unknown Device"}</Text>
          {/* RSSI display - not available in BluetoothDevice extra map */}
        </View>
      }
      ContentComponent={<Text size="xs">{item.address}</Text>}
      FooterComponent={
        <Button
          text="Connect"
          preset="reversed"
          style={$connectButton}
          onPress={() => handleDeviceSelect(item)}
        />
      }
    />
  )

  const renderConnectionSection = () => (
    <Card
      style={themed($card)}
      HeadingComponent={<Text preset="subheading">Connection Status</Text>}
      ContentComponent={
        <View>
          <View style={$statusRow}>
            <Text>Bluetooth:</Text>
            <Text preset="bold" style={imuStore.bluetoothEnabled ? $statusGood : $statusBad}>
              {imuStore.bluetoothEnabled ? "Enabled" : "Disabled"}
            </Text>
          </View>
          <View style={$statusRow}>
            <Text>Status:</Text>
            <Text preset="bold">{imuStore.statusMessage}</Text>
          </View>
          {imuStore.debugMessage && (
            <View style={$statusRow}>
              <Text>Debug:</Text>
              <Text preset="bold" style={$debugMessage}>{imuStore.debugMessage}</Text>
            </View>
          )}
          {imuStore.selectedDevice && (
            <View style={$statusRow}>
              <Text>Device:</Text>
              <Text preset="bold">{imuStore.selectedDevice.name}</Text>
            </View>
          )}
        </View>
      }
      FooterComponent={
        imuStore.connected ? (
          <View style={$buttonRow}>
            {imuStore.streaming ? (
              <Button
                text="Stop Streaming"
                preset="reversed"
                style={$actionButton}
                onPress={() => imuStore.stopStreaming()}
              />
            ) : (
              <Button
                text="Start Streaming"
                style={$actionButton}
                onPress={() => imuStore.startStreaming()}
              />
            )}
            <Button
              text="Disconnect"
              preset="default"
              style={$actionButton}
              onPress={() => imuStore.disconnectDevice()}
            />
          </View>
        ) : (
          <Button
            text="Scan for Devices"
            onPress={() => imuStore.discoverDevices()}
            disabled={imuStore.connecting}
          />
        )
      }
    />
  )

  const renderFrequencyAnalysis = () => {
    const stats = imuStore.statistics
    const freqColor =
      imuStore.frequencyHealth === "good"
        ? $statusGood
        : imuStore.frequencyHealth === "warning"
          ? $statusWarning
          : $statusBad

    return (
      <Card
        style={themed($card)}
        HeadingComponent={<Text preset="subheading">Frequency Analysis</Text>}
        ContentComponent={
          <View>
            <View style={$statusRow}>
              <Text>Expected:</Text>
              <Text preset="bold">{stats.expectedHz} Hz</Text>
            </View>
            <View style={$statusRow}>
              <Text>Actual:</Text>
              <Text preset="bold" style={freqColor}>
                {stats.actualHz} Hz
              </Text>
            </View>
            <View style={$statusRow}>
              <Text>Interval:</Text>
              <Text size="xs">
                {stats.minInterval}ms - {stats.maxInterval}ms (avg: {stats.avgInterval}ms)
              </Text>
            </View>
            <View style={$statusRow}>
              <Text>Jitter:</Text>
              <Text preset="bold">{stats.jitter}ms</Text>
            </View>
          </View>
        }
      />
    )
  }

  const renderDataAnalysis = () => {
    const qualityColor =
      imuStore.dataQuality === "excellent"
        ? $statusGood
        : imuStore.dataQuality === "good"
          ? $statusWarning
          : $statusBad

    return (
      <Card
        style={themed($card)}
        HeadingComponent={<Text preset="subheading">Data Analysis</Text>}
        ContentComponent={
          <View>
            <View style={$statusRow}>
              <Text>Data Type:</Text>
              <Text preset="bold">{imuStore.statistics.dataType}</Text>
            </View>
            <View style={$statusRow}>
              <Text>Total Samples:</Text>
              <Text preset="bold">{imuStore.statistics.totalSamples}</Text>
            </View>
            <View style={$statusRow}>
              <Text>Valid Packets:</Text>
              <Text preset="bold" style={qualityColor}>
                {imuStore.packetsPercentage}%
              </Text>
            </View>
            <View style={$statusRow}>
              <Text>Invalid Packets:</Text>
              <Text preset="bold">{imuStore.statistics.invalidPackets}</Text>
            </View>
          </View>
        }
      />
    )
  }

  const renderSensorValues = () => (
    <Card
      style={themed($card)}
      HeadingComponent={<Text preset="subheading">Current Sensor Values</Text>}
      ContentComponent={
        <View>
          <Text preset="bold" style={$sensorHeader}>
            Accelerometer (m/s²)
          </Text>
          <View style={$sensorRow}>
            <Text>X: {imuStore.currentAccel.x.toFixed(3)}</Text>
            <Text>Y: {imuStore.currentAccel.y.toFixed(3)}</Text>
            <Text>Z: {imuStore.currentAccel.z.toFixed(3)}</Text>
          </View>

          <Text preset="bold" style={$sensorHeader}>
            Gyroscope (rad/s)
          </Text>
          <View style={$sensorRow}>
            <Text>X: {imuStore.currentGyro.x.toFixed(3)}</Text>
            <Text>Y: {imuStore.currentGyro.y.toFixed(3)}</Text>
            <Text>Z: {imuStore.currentGyro.z.toFixed(3)}</Text>
          </View>

          <Text preset="bold" style={$sensorHeader}>
            Magnetometer (μT)
          </Text>
          <View style={$sensorRow}>
            <Text>X: {imuStore.currentMag.x.toFixed(3)}</Text>
            <Text>Y: {imuStore.currentMag.y.toFixed(3)}</Text>
            <Text>Z: {imuStore.currentMag.z.toFixed(3)}</Text>
          </View>
        </View>
      }
    />
  )

  const renderValueRanges = () => (
    <Card
      style={themed($card)}
      HeadingComponent={<Text preset="subheading">Value Ranges</Text>}
      ContentComponent={
        <View>
          <Text preset="bold" style={$sensorHeader}>
            Accelerometer
          </Text>
          <Text size="xs">
            X: [{imuStore.accelRange.minX.toFixed(2)}, {imuStore.accelRange.maxX.toFixed(2)}]
          </Text>
          <Text size="xs">
            Y: [{imuStore.accelRange.minY.toFixed(2)}, {imuStore.accelRange.maxY.toFixed(2)}]
          </Text>
          <Text size="xs">
            Z: [{imuStore.accelRange.minZ.toFixed(2)}, {imuStore.accelRange.maxZ.toFixed(2)}]
          </Text>

          <Text preset="bold" style={$sensorHeader}>
            Gyroscope
          </Text>
          <Text size="xs">
            X: [{imuStore.gyroRange.minX.toFixed(2)}, {imuStore.gyroRange.maxX.toFixed(2)}]
          </Text>
          <Text size="xs">
            Y: [{imuStore.gyroRange.minY.toFixed(2)}, {imuStore.gyroRange.maxY.toFixed(2)}]
          </Text>
          <Text size="xs">
            Z: [{imuStore.gyroRange.minZ.toFixed(2)}, {imuStore.gyroRange.maxZ.toFixed(2)}]
          </Text>

          <Text preset="bold" style={$sensorHeader}>
            Magnetometer
          </Text>
          <Text size="xs">
            X: [{imuStore.magRange.minX.toFixed(2)}, {imuStore.magRange.maxX.toFixed(2)}]
          </Text>
          <Text size="xs">
            Y: [{imuStore.magRange.minY.toFixed(2)}, {imuStore.magRange.maxY.toFixed(2)}]
          </Text>
          <Text size="xs">
            Z: [{imuStore.magRange.minZ.toFixed(2)}, {imuStore.magRange.maxZ.toFixed(2)}]
          </Text>
        </View>
      }
    />
  )

  const renderRawData = () => {
    if (!imuStore.showRawData) return null

    const rawSamples = imuStore.getRawDataSamples(10)

    return (
      <Card
        style={themed($card)}
        HeadingComponent={<Text preset="subheading">Raw Data Stream</Text>}
        ContentComponent={
          <ScrollView style={$rawDataScroll}>
            {rawSamples.map((sample, index) => (
              <Text key={index} size="xs" style={$rawDataLine}>
                {sample}
              </Text>
            ))}
          </ScrollView>
        }
      />
    )
  }

  const renderSettings = () => (
    <Card
      style={themed($card)}
      HeadingComponent={<Text preset="subheading">Settings</Text>}
      ContentComponent={
        <View>
          <Switch
            label="Auto-scroll"
            value={imuStore.autoScroll}
            onValueChange={() => imuStore.toggleAutoScroll()}
          />
          <Switch
            label="Show Raw Data"
            value={imuStore.showRawData}
            onValueChange={() => imuStore.toggleShowRawData()}
          />
        </View>
      }
      FooterComponent={
        <View>
          <View style={$buttonRow}>
            <Button
              text="Export Data"
              preset="reversed"
              style={$actionButton}
              onPress={handleExportData}
              disabled={imuStore.statistics.totalSamples === 0}
            />
            <Button
              text="Diagnostics"
              style={$actionButton}
              onPress={handleRunDiagnostics}
            />
          </View>
          <View style={$buttonRow}>
            <Button
              text="Test Connection"
              preset="default"
              style={$actionButton}
              onPress={handleTestConnection}
              disabled={!imuStore.connected}
            />
            <Button
              text="Test Mock Data"
              preset="default"
              style={$actionButton}
              onPress={handleTestMockData}
            />
          </View>
          <View style={$buttonRow}>
            <Button
              text="Test Common Commands"
              preset="default"
              style={$actionButton}
              onPress={handleTestCommonCommands}
              disabled={!imuStore.connected}
            />
            <Button
              text="Test Command Methods"
              preset="default"
              style={$actionButton}
              onPress={handleTestCommandApproaches}
              disabled={!imuStore.connected}
            />
          </View>
        </View>
      }
    />
  )

  if (!imuStore.connected && !imuStore.connecting) {
    return (
      <Screen style={themed($root)} preset="fixed">
        <Text preset="heading" style={$title}>
          IMU Sensor Analysis
        </Text>
        {renderConnectionSection()}
        <Text preset="subheading" style={$subtitle}>
          Available Devices
        </Text>
        <FlatList
          data={imuStore.availableDevices}
          keyExtractor={(item) => item.address}
          renderItem={renderDeviceItem}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={() => imuStore.checkBluetooth()} />
          }
          ListEmptyComponent={
            <Card
              style={themed($card)}
              ContentComponent={
                <View style={$emptyState}>
                  <Text>No devices found</Text>
                  <Button
                    text="Refresh"
                    preset="reversed"
                    style={$refreshButton}
                    onPress={() => imuStore.checkBluetooth()}
                  />
                </View>
              }
            />
          }
        />
      </Screen>
    )
  }

  if (imuStore.connecting) {
    return (
      <Screen style={themed($root)} preset="fixed">
        <View style={$centerContent}>
          <ActivityIndicator size="large" color={colors.palette.primary500} />
          <Text style={$loadingText}>Connecting to IMU...</Text>
        </View>
      </Screen>
    )
  }

  return (
    <Screen style={themed($root)} preset="fixed">
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={$scrollContent}
      >
        <Text preset="heading" style={$title}>
          IMU Debug Dashboard
        </Text>

        {renderConnectionSection()}
        {renderFrequencyAnalysis()}
        {renderDataAnalysis()}
        {renderSensorValues()}
        {renderValueRanges()}
        {renderRawData()}
        {renderSettings()}
      </ScrollView>
    </Screen>
  )
})

// Styles
const $root: ThemedStyle<any> = ({ colors }) => ({
  flex: 1,
  backgroundColor: colors.background,
})

const $scrollContent: any = {
  paddingBottom: spacing.lg,
}

const $centerContent: any = {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
}

const $title: any = {
  marginBottom: spacing.sm,
  marginHorizontal: spacing.md,
}

const $subtitle: any = {
  marginTop: spacing.md,
  marginBottom: spacing.sm,
  marginHorizontal: spacing.md,
}

const $card: ThemedStyle<any> = ({ colors }) => ({
  marginHorizontal: spacing.md,
  marginBottom: spacing.md,
  backgroundColor: colors.palette.neutral100,
})

const $deviceCard: ThemedStyle<any> = ({ colors }) => ({
  marginHorizontal: spacing.md,
  marginBottom: spacing.sm,
  backgroundColor: colors.palette.neutral100,
})

const $deviceHeader: any = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
}

const $statusRow: any = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: spacing.xs,
}

const $buttonRow: any = {
  flexDirection: "row",
  justifyContent: "space-around",
  gap: spacing.sm,
}

const $actionButton: any = {
  flex: 1,
}


const $connectButton: any = {
  marginTop: spacing.xs,
}

const $refreshButton: any = {
  marginTop: spacing.sm,
}

const $sensorHeader: any = {
  marginTop: spacing.sm,
  marginBottom: spacing.xs,
}

const $sensorRow: any = {
  flexDirection: "row",
  justifyContent: "space-around",
  marginBottom: spacing.xs,
}

const $rawDataScroll: any = {
  maxHeight: 150,
  backgroundColor: colors.palette.neutral900,
  padding: spacing.xs,
  borderRadius: 4,
}

const $rawDataLine: any = {
  fontFamily: typography.primary.normal,
  color: colors.palette.neutral100,
  marginBottom: 2,
}

const $emptyState: any = {
  alignItems: "center",
  padding: spacing.lg,
}

const $loadingText: any = {
  marginTop: spacing.md,
}

const $statusGood: any = {
  color: colors.palette.secondary500,
}

const $statusWarning: any = {
  color: colors.palette.accent500,
}

const $statusBad: any = {
  color: colors.error,
}

const $debugMessage: any = {
  color: colors.palette.primary500,
  fontStyle: "italic",
}
