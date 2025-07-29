// app/services/IMUDataService.ts
/**
 * IMU Data Service for analyzing and testing 40Hz sensor data
 * Handles accelerometer, gyroscope, and magnetometer data (9 values total)
 */

import { CircularBuffer } from "@/utils/CircularBuffer"
import { debugLog, debugError, debugWarn } from "@/utils/logger"
import type { BluetoothDevice, BluetoothEventSubscription } from "react-native-bluetooth-classic"
import RNBluetoothClassic from "react-native-bluetooth-classic"

export interface IMUSample {
  timestamp: number
  rawData: string // Store raw string for analysis
  values: number[] // Parsed 9 values
  accel: { x: number; y: number; z: number }
  gyro: { x: number; y: number; z: number }
  mag: { x: number; y: number; z: number }
  sessionId: string
}

export interface IMUDataAnalysis {
  dataType: "integer" | "float" | "mixed" | "unknown"
  valueRanges: {
    accel: { min: [number, number, number]; max: [number, number, number] }
    gyro: { min: [number, number, number]; max: [number, number, number] }
    mag: { min: [number, number, number]; max: [number, number, number] }
  }
  decimalPlaces: number[]
  sampleFormats: string[]
}

export interface IMUFrequencyAnalysis {
  expectedHz: number
  actualHz: number
  minInterval: number
  maxInterval: number
  avgInterval: number
  missedPackets: number
  jitter: number
  intervals: number[]
}

export interface IMUConnectionStatus {
  connected: boolean
  connecting: boolean
  streaming: boolean
  device: BluetoothDevice | null
  message: string
  signalStrength?: number
}

export interface IMUStatistics {
  totalSamples: number
  validPackets: number
  invalidPackets: number
  packetsPerSecond: number
  dataAnalysis: IMUDataAnalysis
  frequencyAnalysis: IMUFrequencyAnalysis
  lastUpdate: number
  sessionDuration: number
}

export class IMUDataService {
  // Data buffers
  private dataBuffer = new CircularBuffer<IMUSample>(2000) // 50 seconds at 40Hz
  private rawDataBuffer = new CircularBuffer<string>(1000) // Raw strings for analysis

  // Analysis state
  private dataAnalysis: IMUDataAnalysis = {
    dataType: "unknown",
    valueRanges: {
      accel: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
      gyro: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
      mag: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
    },
    decimalPlaces: new Array(9).fill(0),
    sampleFormats: [],
  }

  // Frequency tracking
  private lastPacketTime = 0
  private packetIntervals: number[] = []
  private expectedHz = 40

  // Statistics
  private totalSamples = 0
  private validPackets = 0
  private invalidPackets = 0
  private sessionStartTime = 0

  // Connection state
  private connectionStatus: IMUConnectionStatus = {
    connected: false,
    connecting: false,
    streaming: false,
    device: null,
    message: "Not connected",
  }

  // Bluetooth management
  private selectedDevice: BluetoothDevice | null = null
  private dataSubscription: BluetoothEventSubscription | null = null
  private currentSessionId = ""

  // Callbacks
  private onStatusChange?: (status: IMUConnectionStatus) => void
  private onDataUpdate?: (sample: IMUSample) => void
  private onStatisticsUpdate?: (stats: IMUStatistics) => void

  // Configuration
  private delimiter = "\n" // Can be adjusted based on IMU format
  private expectedValueCount = 9
  private startCommand = "START"
  private stopCommand = "STOP"
  private terminator = "\r" // Command terminator (like BluetoothScreen2)

  constructor() {
    // Basic logging test - this should appear in console immediately
    console.log("🧪 BASIC LOG TEST - If you see this, console logging is working!")
    debugLog("IMUDataService initialized for 40Hz analysis")
    
    // Test all logging levels
    console.log("📝 Console.log working")
    console.warn("⚠️ Console.warn working") 
    console.error("❌ Console.error working")
  }

  // Event subscriptions
  setOnStatusChange(callback: (status: IMUConnectionStatus) => void) {
    this.onStatusChange = callback
  }

  setOnDataUpdate(callback: (sample: IMUSample) => void) {
    this.onDataUpdate = callback
  }

  setOnStatisticsUpdate(callback: (stats: IMUStatistics) => void) {
    this.onStatisticsUpdate = callback
  }

  // Connection management
  async connectToDevice(device: BluetoothDevice): Promise<boolean> {
    try {
      this.connectionStatus.connecting = true
      this.connectionStatus.message = "Connecting to IMU..."
      this.connectionStatus.device = device
      this.notifyStatusChange()

      // Connect WITHOUT parameters (like BluetoothScreen2)
      const connected = await device.connect()

      if (!connected) {
        throw new Error("Failed to connect to IMU")
      }

      this.selectedDevice = device
      this.connectionStatus.connected = true
      this.connectionStatus.connecting = false
      this.connectionStatus.message = "Connected to IMU"

      // Start new session
      this.currentSessionId = `imu_${Date.now()}`
      this.sessionStartTime = Date.now()
      this.resetAnalysis()

      // DO NOT setup data listener here - wait for START command
      debugLog("🔌 Connection established. Data listener will be set up after START command...")

      this.notifyStatusChange()
      debugLog("✅ ✅ ✅ CONNECTED TO IMU DEVICE ✅ ✅ ✅")
      debugLog("Device name:", device.name)
      debugLog("Device address:", device.address)
      debugLog("Connection status:", this.connectionStatus.connected)
      debugLog("Data listener active:", !!this.dataSubscription)

      return true
    } catch (error) {
      debugError("IMU connection error:", error)
      this.connectionStatus.connected = false
      this.connectionStatus.connecting = false
      this.connectionStatus.message = `Connection failed: ${(error as any).message || "Unknown error"}`
      this.notifyStatusChange()
      return false
    }
  }

  async disconnectDevice(): Promise<void> {
    try {
      // Stop periodic status check
      this.stopPeriodicStatusCheck()
      
      if (this.dataSubscription) {
        this.dataSubscription.remove()
        this.dataSubscription = null
      }

      if (this.selectedDevice) {
        await this.selectedDevice.disconnect()
      }

      this.connectionStatus.connected = false
      this.connectionStatus.streaming = false
      this.connectionStatus.device = null
      this.connectionStatus.message = "Disconnected"
      this.selectedDevice = null

      this.notifyStatusChange()
      debugLog("Disconnected from IMU")
    } catch (error) {
      debugError("IMU disconnect error:", error)
    }
  }

  // Data streaming control
  async startStreaming(): Promise<boolean> {
    if (!this.connectionStatus.connected || !this.selectedDevice) {
      debugError("Cannot start streaming: not connected or no device")
      return false
    }

    try {
      debugLog("🚀 Starting IMU streaming...")
      
      // Send start command FIRST (like BluetoothScreen2)
      const commandSent = await this.sendCommand(this.startCommand)
      if (!commandSent) {
        debugError("Failed to send START command")
        return false
      }
      
      debugLog("✅ START command sent successfully")
      
      // Set up data listener AFTER sending START command (like BluetoothScreen2)
      debugLog("📡 Setting up data listener AFTER START command...")
      this.setupDataListener()

      this.connectionStatus.streaming = true
      this.connectionStatus.message = "Streaming IMU data"
      this.lastPacketTime = Date.now()
      
      debugLog("📡 IMU streaming started, waiting for data...")
      this.notifyStatusChange()
      return true
    } catch (error) {
      debugError("Failed to start IMU streaming:", error)
      return false
    }
  }

  async stopStreaming(): Promise<boolean> {
    if (!this.connectionStatus.connected || !this.selectedDevice) {
      return false
    }

    try {
      // Send stop command first
      await this.sendCommand(this.stopCommand)
      
      // Remove data listener after STOP command (like BluetoothScreen2)
      if (this.dataSubscription) {
        debugLog("🛑 Removing data listener after STOP command...")
        this.dataSubscription.remove()
        this.dataSubscription = null
      }

      this.connectionStatus.streaming = false
      this.connectionStatus.message = "Streaming stopped"

      this.notifyStatusChange()
      return true
    } catch (error) {
      debugError("Failed to stop IMU streaming:", error)
      return false
    }
  }

  // Data processing
  private setupDataListener() {
    if (!this.selectedDevice) {
      debugError("Cannot setup data listener: no selected device")
      return
    }

    debugLog("🎧 Setting up IMU data listener...")
    debugLog("🔍 Device info:", {
      name: this.selectedDevice.name,
      address: this.selectedDevice.address,
      connected: this.connectionStatus.connected
    })
    
    // Clean up any existing subscription
    if (this.dataSubscription) {
      debugLog("🧽 Cleaning up existing data subscription")
      this.dataSubscription.remove()
      this.dataSubscription = null
    }
    
    this.dataSubscription = this.selectedDevice.onDataReceived((data) => {
      console.log("📦 📦 📦 RAW DATA RECEIVED 📦 📦 📦")
      console.log("Data object:", data)
      console.log("Data type:", typeof data)
      console.log("Data keys:", Object.keys(data || {}))
      
      if (data && data.data) {
        console.log("📝 Data content (first 200 chars):", data.data.substring(0, 200))
        console.log("📝 Data length:", data.data.length)
        console.log("📝 Data type:", typeof data.data)
        this.processIMUData(data.data)
      } else {
        console.warn("⚠️ ⚠️ ⚠️ NO DATA PROPERTY FOUND ⚠️ ⚠️ ⚠️")
        console.warn("Received object:", JSON.stringify(data, null, 2))
      }
    })
    
    debugLog("✅ Data listener setup complete with subscription:", !!this.dataSubscription)
    
    // Add a test to verify the listener is working
    setTimeout(() => {
      console.log("🕰️ 5 seconds after setup - checking if data received...")
      console.log("📊 Current status:")
      console.log("- Total samples received:", this.totalSamples)
      console.log("- Data subscription active:", !!this.dataSubscription)
      console.log("- Connection status:", this.connectionStatus.connected)
      console.log("- Streaming status:", this.connectionStatus.streaming)
      console.log("- Selected device:", this.selectedDevice?.name)
      
      if (this.totalSamples === 0) {
        console.error("❌ NO DATA RECEIVED AFTER 5 SECONDS!")
        console.error("This means the IMU is NOT sending any data in response to commands")
        console.error("Possible issues:")
        console.error("1. IMU doesn't recognize the START command")
        console.error("2. IMU needs different command terminator")
        console.error("3. IMU needs initialization sequence before streaming")
        console.error("4. IMU requires different baud rate or connection settings")
        console.error("5. IMU needs pairing or authentication")
        
        // Add periodic listener status check
        this.startPeriodicStatusCheck()
      } else {
        console.log("✅ Data is being received successfully!")
      }
    }, 5000)
  }

  private processIMUData(rawData: string): void {
    debugLog("🔍 Processing IMU data. Length:", rawData.length, "Content:", rawData.substring(0, 200))
    
    const now = Date.now()

    // Store raw data for analysis
    this.rawDataBuffer.push(rawData)

    // Track packet intervals for frequency analysis
    if (this.lastPacketTime > 0) {
      const interval = now - this.lastPacketTime
      this.packetIntervals.push(interval)
      debugLog("⏱️ Packet interval:", interval + "ms")

      // Keep only last 100 intervals for analysis
      if (this.packetIntervals.length > 100) {
        this.packetIntervals.shift()
      }
    }
    this.lastPacketTime = now

    // Parse the data
    const lines = rawData
      .trim()
      .split(this.delimiter)
      .filter((line) => line.length > 0)
      
    debugLog("📋 Split into", lines.length, "lines using delimiter '", this.delimiter, "'")
    debugLog("📋 Lines:", lines)

    for (const line of lines) {
      this.parseSinglePacket(line, now)
    }

    // Update statistics periodically
    if (this.totalSamples % 10 === 0) {
      debugLog("📊 Updating statistics. Total samples:", this.totalSamples)
      this.notifyStatisticsUpdate()
    }
  }

  private parseSinglePacket(line: string, timestamp: number): void {
    debugLog("🎯 Parsing packet:", line)
    this.totalSamples++

    // Try to parse values
    const rawValues = line.trim().split(/[\s,;]+/)
    debugLog("🔢 Raw values after split:", rawValues)
    
    const values = rawValues
      .map((v) => {
        const num = Number(v)
        if (isNaN(num)) {
          debugWarn("⚠️ Invalid number:", v)
        }
        return isNaN(num) ? null : num
      })
      .filter((v) => v !== null) as number[]
      
    debugLog("✅ Parsed values:", values, "(count:", values.length, ")")

    if (values.length !== this.expectedValueCount) {
      this.invalidPackets++
      debugWarn(`Invalid packet: expected ${this.expectedValueCount} values, got ${values.length}`)
      return
    }

    this.validPackets++

    // Create IMU sample
    const sample: IMUSample = {
      timestamp,
      rawData: line,
      values,
      accel: { x: values[0], y: values[1], z: values[2] },
      gyro: { x: values[3], y: values[4], z: values[5] },
      mag: { x: values[6], y: values[7], z: values[8] },
      sessionId: this.currentSessionId,
    }

    // Store sample
    this.dataBuffer.push(sample)

    // Analyze data types and ranges
    this.analyzeDataTypes(values, line)
    this.updateValueRanges(sample)

    // Notify listeners
    if (this.onDataUpdate) {
      this.onDataUpdate(sample)
    }
  }

  private analyzeDataTypes(values: number[], rawLine: string): void {
    // Check if values contain decimals
    const parts = rawLine.trim().split(/[\s,;]+/)

    for (let i = 0; i < values.length && i < parts.length; i++) {
      const decimalPlaces = (parts[i].split(".")[1] || "").length
      this.dataAnalysis.decimalPlaces[i] = Math.max(
        this.dataAnalysis.decimalPlaces[i],
        decimalPlaces,
      )
    }

    // Store sample format
    if (this.dataAnalysis.sampleFormats.length < 10) {
      this.dataAnalysis.sampleFormats.push(rawLine.substring(0, 100))
    }

    // Determine overall data type
    const hasDecimals = this.dataAnalysis.decimalPlaces.some((d) => d > 0)
    const allIntegers = this.dataAnalysis.decimalPlaces.every((d) => d === 0)

    if (allIntegers) {
      this.dataAnalysis.dataType = "integer"
    } else if (hasDecimals) {
      this.dataAnalysis.dataType = "float"
    }
  }

  private updateValueRanges(sample: IMUSample): void {
    // Update accelerometer ranges
    for (let i = 0; i < 3; i++) {
      const accelVal = [sample.accel.x, sample.accel.y, sample.accel.z][i]
      this.dataAnalysis.valueRanges.accel.min[i] = Math.min(
        this.dataAnalysis.valueRanges.accel.min[i],
        accelVal,
      )
      this.dataAnalysis.valueRanges.accel.max[i] = Math.max(
        this.dataAnalysis.valueRanges.accel.max[i],
        accelVal,
      )
    }

    // Update gyroscope ranges
    for (let i = 0; i < 3; i++) {
      const gyroVal = [sample.gyro.x, sample.gyro.y, sample.gyro.z][i]
      this.dataAnalysis.valueRanges.gyro.min[i] = Math.min(
        this.dataAnalysis.valueRanges.gyro.min[i],
        gyroVal,
      )
      this.dataAnalysis.valueRanges.gyro.max[i] = Math.max(
        this.dataAnalysis.valueRanges.gyro.max[i],
        gyroVal,
      )
    }

    // Update magnetometer ranges
    for (let i = 0; i < 3; i++) {
      const magVal = [sample.mag.x, sample.mag.y, sample.mag.z][i]
      this.dataAnalysis.valueRanges.mag.min[i] = Math.min(
        this.dataAnalysis.valueRanges.mag.min[i],
        magVal,
      )
      this.dataAnalysis.valueRanges.mag.max[i] = Math.max(
        this.dataAnalysis.valueRanges.mag.max[i],
        magVal,
      )
    }
  }

  // Analysis methods
  getFrequencyAnalysis(): IMUFrequencyAnalysis {
    if (this.packetIntervals.length === 0) {
      return {
        expectedHz: this.expectedHz,
        actualHz: 0,
        minInterval: 0,
        maxInterval: 0,
        avgInterval: 0,
        missedPackets: 0,
        jitter: 0,
        intervals: [],
      }
    }

    const sorted = [...this.packetIntervals].sort((a, b) => a - b)
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length
    const actualHz = 1000 / avg

    // Calculate jitter (standard deviation)
    const variance =
      sorted.reduce((sum, interval) => {
        return sum + Math.pow(interval - avg, 2)
      }, 0) / sorted.length
    const jitter = Math.sqrt(variance)

    // Estimate missed packets (intervals > 1.5x expected)
    const expectedInterval = 1000 / this.expectedHz
    const missedPackets = sorted.filter((i) => i > expectedInterval * 1.5).length

    return {
      expectedHz: this.expectedHz,
      actualHz: Math.round(actualHz * 10) / 10,
      minInterval: Math.min(...sorted),
      maxInterval: Math.max(...sorted),
      avgInterval: Math.round(avg * 10) / 10,
      missedPackets,
      jitter: Math.round(jitter * 10) / 10,
      intervals: sorted.slice(-20), // Last 20 intervals
    }
  }

  getStatistics(): IMUStatistics {
    const freq = this.getFrequencyAnalysis()
    const sessionDuration = this.sessionStartTime ? Date.now() - this.sessionStartTime : 0

    return {
      totalSamples: this.totalSamples,
      validPackets: this.validPackets,
      invalidPackets: this.invalidPackets,
      packetsPerSecond: freq.actualHz,
      dataAnalysis: this.dataAnalysis,
      frequencyAnalysis: freq,
      lastUpdate: this.lastPacketTime,
      sessionDuration,
    }
  }

  getLatestSamples(count: number): IMUSample[] {
    return this.dataBuffer.getLatest(count)
  }

  getRawDataSamples(count: number): string[] {
    return this.rawDataBuffer.getLatest(count)
  }

  exportTestData(): string {
    const stats = this.getStatistics()
    const samples = this.getLatestSamples(100)
    const rawSamples = this.getRawDataSamples(20)

    return JSON.stringify(
      {
        statistics: stats,
        recentSamples: samples,
        rawDataExamples: rawSamples,
        analysisTimestamp: Date.now(),
      },
      null,
      2,
    )
  }

  getConnectionStatus(): IMUConnectionStatus {
    return { ...this.connectionStatus }
  }

  // Public method for testing commands
  async testSendCommand(command: string): Promise<boolean> {
    return this.sendCommand(command)
  }

  // Basic connection test - sends a simple command to verify communication
  async testConnection(): Promise<boolean> {
    console.log("🧪 TESTING BASIC CONNECTION COMMUNICATION...")
    
    if (!this.selectedDevice || !this.connectionStatus.connected) {
      console.log("❌ Cannot test connection: not connected")
      return false
    }
    
    try {
      console.log("📤 Testing basic write capability...")
      console.log("📱 Device details:", {
        name: this.selectedDevice.name,
        address: this.selectedDevice.address,
        connected: this.connectionStatus.connected
      })
      
      // Try sending a simple test command using slow write
      console.log("📤 Sending TEST command using slow write...")
      for (const char of "TEST") {
        await this.selectedDevice.write(char)
        await new Promise((res) => setTimeout(res, 50))
      }
      await this.selectedDevice.write("\r")
      console.log("✅ Basic slow write test successful")
      return true
    } catch (error) {
      console.error("❌ Basic connection test failed:", error)
      return false
    }
  }

  // Helper methods
  private async sendCommand(command: string): Promise<boolean> {
    if (!this.selectedDevice || !this.connectionStatus.connected) {
      debugError("Cannot send command: no device or not connected")
      debugError("Device:", this.selectedDevice?.name || "null")
      debugError("Connected:", this.connectionStatus.connected)
      return false
    }

    try {
      debugLog(`📤 📤 📤 SENDING COMMAND: '${command}' 📤 📤 📤`)
      debugLog("Device name:", this.selectedDevice.name)
      debugLog("Device address:", this.selectedDevice.address)
      
      // Try HC-05 style slow writing first
      debugLog("🐌 Using HC-05 slow write method (char by char with 50ms delay)")
      
      // Send command character by character (like BluetoothScreen2)
      for (const char of command) {
        await this.selectedDevice.write(char)
        console.log(`Lettera '${char}' inviata`) // Log like BluetoothScreen2
        await new Promise((res) => setTimeout(res, 50))
      }
      // Send terminator
      await this.selectedDevice.write(this.terminator)
      console.log(`Terminator '${this.terminator.replace('\r', '\\r').replace('\n', '\\n')}' inviato`)
      
      debugLog(`✅ ✅ ✅ SLOW COMMAND SENT: ${command} ✅ ✅ ✅`)
      
      // Wait a moment for potential immediate response
      setTimeout(() => {
        debugLog("🕰️ 1 second after sending slow command - any response?")
      }, 1000)
      
      return true
    } catch (error) {
      debugError("❌ ❌ ❌ SLOW COMMAND SEND FAILED ❌ ❌ ❌")
      debugError("Command:", command)
      debugError("Error:", error)
      return false
    }
  }

  // Alternative fast command method for testing
  private async sendCommandFast(command: string): Promise<boolean> {
    if (!this.selectedDevice || !this.connectionStatus.connected) {
      return false
    }
    try {
      debugLog(`⚡ SENDING FAST COMMAND: '${command}'`)
      const result = await this.selectedDevice.write(command + "\n")
      debugLog(`✅ FAST COMMAND SENT: ${command}`)
      return true
    } catch (error) {
      debugError("❌ FAST COMMAND FAILED:", error)
      return false
    }
  }

  // Test various common IMU commands to see if any trigger data
  async testCommonIMUCommands(): Promise<string> {
    console.log("🧪 Testing common IMU commands to find one that works...")
    
    const commands = [
      "START", "start", "S", "s", "1", "ON", "on",
      "BEGIN", "begin", "STREAM", "stream", "DATA", "data",
      "GO", "go", "RUN", "run", "ENABLE", "enable"
    ]
    
    for (const cmd of commands) {
      console.log(`🧪 Testing command: "${cmd}"`)
      
      // Reset sample count for this test
      const initialSamples = this.totalSamples
      
      // Send command using slow write with \r
      try {
        for (const char of cmd) {
          await this.selectedDevice?.write(char)
          await new Promise((res) => setTimeout(res, 50))
        }
        await this.selectedDevice?.write("\r")
        
        console.log(`📤 Sent command: "${cmd}" (slow write with \\r)`)
        
        // Wait 2 seconds to see if data flows
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        if (this.totalSamples > initialSamples) {
          console.log(`🎉 SUCCESS! Command "${cmd}" triggered data flow!`)
          return cmd
        }
      } catch (error) {
        console.log(`❌ Command "${cmd}" failed:`, error)
      }
    }
    
    console.log("😞 None of the common commands worked")
    return "none_worked"
  }

  // Public method to test both command approaches
  async testCommandApproaches(): Promise<string> {
    console.log("🧪 Testing both slow and fast command approaches...")
    
    // Test 1: Slow HC-05 style with \r terminator
    console.log("🐌 Test 1: Slow write with \\r terminator")
    try {
      await this.sendCommand("START")
      await new Promise(resolve => setTimeout(resolve, 3000)) // Wait 3 seconds
      if (this.totalSamples > 0) {
        return "slow_r_success"
      }
    } catch (error) {
      console.log("Slow \\r failed:", error)
    }
    
    // Test 2: Fast write with \n terminator  
    console.log("⚡ Test 2: Fast write with \\n terminator")
    try {
      await this.sendCommandFast("START")
      await new Promise(resolve => setTimeout(resolve, 3000)) // Wait 3 seconds
      if (this.totalSamples > 0) {
        return "fast_n_success"
      }
    } catch (error) {
      console.log("Fast \\n failed:", error)
    }
    
    // Test 3: Fast write with \r terminator
    console.log("⚡ Test 3: Fast write with \\r terminator")
    try {
      const result = await this.selectedDevice?.write("START\r")
      console.log("Fast \\r write result:", result)
      await new Promise(resolve => setTimeout(resolve, 3000))
      if (this.totalSamples > 0) {
        return "fast_r_success"
      }
    } catch (error) {
      console.log("Fast \\r failed:", error)
    }
    
    return "all_failed"
  }

  // Periodic status checking
  private statusCheckInterval: NodeJS.Timeout | null = null

  private startPeriodicStatusCheck(): void {
    console.log("🔄 Starting periodic status check every 10 seconds...")
    
    this.statusCheckInterval = setInterval(() => {
      console.log("🔄 Periodic Status Check:")
      console.log("- Time since last packet:", Date.now() - this.lastPacketTime, "ms")
      console.log("- Total samples:", this.totalSamples)
      console.log("- Data subscription active:", !!this.dataSubscription)
      console.log("- Device connected:", this.connectionStatus.connected)
      console.log("- Currently streaming:", this.connectionStatus.streaming)
      
      if (this.totalSamples === 0 && this.connectionStatus.streaming) {
        console.warn("⚠️ Still no data after streaming started!")
        console.warn("💡 Suggestion: Try sending different commands or check IMU documentation")
      }
    }, 10000)
  }
  
  private stopPeriodicStatusCheck(): void {
    if (this.statusCheckInterval) {
      clearInterval(this.statusCheckInterval)
      this.statusCheckInterval = null
    }
  }

  private resetAnalysis(): void {
    this.totalSamples = 0
    this.validPackets = 0
    this.invalidPackets = 0
    this.packetIntervals = []
    this.lastPacketTime = 0

    this.dataAnalysis = {
      dataType: "unknown",
      valueRanges: {
        accel: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
        gyro: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
        mag: { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] },
      },
      decimalPlaces: new Array(9).fill(0),
      sampleFormats: [],
    }
  }

  private notifyStatusChange(): void {
    if (this.onStatusChange) {
      this.onStatusChange({ ...this.connectionStatus })
    }
  }

  private notifyStatisticsUpdate(): void {
    if (this.onStatisticsUpdate) {
      this.onStatisticsUpdate(this.getStatistics())
    }
  }

  // Configuration methods for testing
  setDelimiter(delimiter: string): void {
    debugLog(`🔧 Setting delimiter to: '${delimiter.replace('\n', '\\n').replace('\r', '\\r')}'`)
    this.delimiter = delimiter
  }

  setCommands(startCommand: string, stopCommand: string): void {
    debugLog(`🔧 Setting commands to: START='${startCommand}', STOP='${stopCommand}'`)
    this.startCommand = startCommand
    this.stopCommand = stopCommand
  }

  setExpectedValueCount(count: number): void {
    debugLog(`🔧 Setting expected value count to: ${count}`)
    this.expectedValueCount = count
  }

  setTerminator(terminator: string): void {
    debugLog(`🔧 Setting command terminator to: '${terminator.replace('\n', '\\n').replace('\r', '\\r')}'`)
    this.terminator = terminator
  }

  getCurrentConfiguration() {
    return {
      delimiter: this.delimiter,
      startCommand: this.startCommand,
      stopCommand: this.stopCommand,
      expectedValueCount: this.expectedValueCount,
      terminator: this.terminator,
    }
  }

  // Test method to inject mock data
  injectTestData(data: string): void {
    debugLog(`🧪 Injecting test data: ${data}`)
    this.processIMUData(data)
  }

  destroy(): void {
    this.disconnectDevice()
    debugLog("IMUDataService destroyed")
  }
}

// Export singleton instance
export const imuDataService = new IMUDataService()
