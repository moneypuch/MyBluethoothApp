// app/utils/IMUDebugHelper.ts
/**
 * Debug utility for testing IMU configurations and troubleshooting data reception
 */

import { debugLog, debugError, debugWarn } from "@/utils/logger"
import { imuDataService } from "@/services/IMUDataService"

export interface IMUTestConfig {
  delimiter: string
  startCommand: string
  stopCommand: string
  expectedValueCount: number
  testDescription: string
}

export class IMUDebugHelper {
  private static configs: IMUTestConfig[] = [
    {
      delimiter: "\n",
      startCommand: "START",
      stopCommand: "STOP",
      expectedValueCount: 9,
      testDescription: "Standard config (\\n delimiter, START/STOP)"
    },
    {
      delimiter: "\r\n",
      startCommand: "START",
      stopCommand: "STOP", 
      expectedValueCount: 9,
      testDescription: "Windows line endings (\\r\\n delimiter)"
    },
    {
      delimiter: "\r",
      startCommand: "START",
      stopCommand: "STOP",
      expectedValueCount: 9,
      testDescription: "Mac line endings (\\r delimiter)"
    },
    {
      delimiter: "\n",
      startCommand: "start",
      stopCommand: "stop",
      expectedValueCount: 9,
      testDescription: "Lowercase commands"
    },
    {
      delimiter: "\n",
      startCommand: "S",
      stopCommand: "s",
      expectedValueCount: 9,
      testDescription: "Single character commands"
    },
    {
      delimiter: "\n",
      startCommand: "1",
      stopCommand: "0",
      expectedValueCount: 9,
      testDescription: "Numeric commands"
    },
    {
      delimiter: ",",
      startCommand: "START",
      stopCommand: "STOP",
      expectedValueCount: 9,
      testDescription: "Comma delimiter (CSV format)"
    }
  ]

  static getTestConfigs(): IMUTestConfig[] {
    return this.configs
  }

  static async testConfiguration(config: IMUTestConfig): Promise<boolean> {
    debugLog(`🧪 Testing IMU config: ${config.testDescription}`)
    
    try {
      // Apply configuration to service
      this.applyConfig(config)
      
      // Try to start streaming with this config
      debugLog(`📤 Sending start command: '${config.startCommand}'`)
      const success = await imuDataService.startStreaming()
      
      if (success) {
        debugLog(`✅ Configuration test successful: ${config.testDescription}`)
        
        // Wait a moment for data
        await new Promise(resolve => setTimeout(resolve, 2000))
        
        // Check if we received data
        const stats = imuDataService.getStatistics()
        if (stats.totalSamples > 0) {
          debugLog(`🎉 Data received with config: ${config.testDescription}. Samples: ${stats.totalSamples}`)
          return true
        } else {
          debugWarn(`⚠️ No data received with config: ${config.testDescription}`)
          return false
        }
      } else {
        debugError(`❌ Failed to start streaming with config: ${config.testDescription}`)
        return false
      }
    } catch (error) {
      debugError(`💥 Error testing config ${config.testDescription}:`, error)
      return false
    }
  }

  static async runAllTests(): Promise<IMUTestConfig | null> {
    debugLog("🚀 Running all IMU configuration tests...")
    
    for (const config of this.configs) {
      const success = await this.testConfiguration(config)
      if (success) {
        debugLog(`🎯 Found working configuration: ${config.testDescription}`)
        return config
      }
      
      // Stop streaming before trying next config
      await imuDataService.stopStreaming()
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
    
    debugError("😞 No working configuration found")
    return null
  }

  private static applyConfig(config: IMUTestConfig): void {
    debugLog(`🔧 Applying config: ${config.testDescription}`)
    debugLog(`   Delimiter: '${config.delimiter.replace('\n', '\\n').replace('\r', '\\r')}'`)
    debugLog(`   Start command: '${config.startCommand}'`)
    debugLog(`   Stop command: '${config.stopCommand}'`)
    debugLog(`   Expected values: ${config.expectedValueCount}`)
    
    // Apply configuration to the service
    imuDataService.setDelimiter(config.delimiter)
    imuDataService.setCommands(config.startCommand, config.stopCommand)
    imuDataService.setExpectedValueCount(config.expectedValueCount)
  }

  static generateMockIMUData(): string {
    // Generate 9 values: 3 accel + 3 gyro + 3 mag
    const values: number[] = []
    
    // Accelerometer (m/s²) - typical range: -20 to +20
    values.push(
      (Math.random() - 0.5) * 40, // X
      (Math.random() - 0.5) * 40, // Y 
      9.8 + (Math.random() - 0.5) * 4 // Z (gravity + noise)
    )
    
    // Gyroscope (rad/s) - typical range: -10 to +10
    values.push(
      (Math.random() - 0.5) * 20, // X
      (Math.random() - 0.5) * 20, // Y
      (Math.random() - 0.5) * 20  // Z
    )
    
    // Magnetometer (μT) - typical range: -100 to +100
    values.push(
      (Math.random() - 0.5) * 200, // X
      (Math.random() - 0.5) * 200, // Y
      (Math.random() - 0.5) * 200  // Z
    )
    
    return values.map(v => v.toFixed(3)).join(' ')
  }

  static startMockDataStream(): NodeJS.Timeout {
    debugLog("🎭 Starting mock IMU data stream at 40Hz")
    
    return setInterval(() => {
      const mockData = this.generateMockIMUData() + "\n"
      debugLog("📡 Mock data:", mockData.trim())
      
      // Simulate data reception by calling the processing method directly
      // Note: This requires making processIMUData public or adding a test method
    }, 25) // 25ms = 40Hz
  }

  static async testMockData(): Promise<boolean> {
    debugLog("🎭 Testing with mock IMU data...")
    
    try {
      // Generate and inject some test data
      for (let i = 0; i < 5; i++) {
        const mockData = this.generateMockIMUData() + "\n"
        imuDataService.injectTestData(mockData)
        await new Promise(resolve => setTimeout(resolve, 25)) // 40Hz
      }
      
      // Check if data was processed
      const stats = imuDataService.getStatistics()
      if (stats.totalSamples > 0) {
        debugLog("✅ Mock data test successful! Data processing is working.")
        return true
      } else {
        debugError("❌ Mock data test failed. No samples processed.")
        return false
      }
    } catch (error) {
      debugError("💥 Mock data test error:", error)
      return false
    }
  }

  static logConnectionDiagnostics(): void {
    debugLog("🔍 IMU Connection Diagnostics:")
    
    const stats = imuDataService.getStatistics()
    const connectionStatus = imuDataService.getConnectionStatus()
    
    debugLog("📊 Statistics:")
    debugLog(`   Total samples: ${stats.totalSamples}`)
    debugLog(`   Valid packets: ${stats.validPackets}`)
    debugLog(`   Invalid packets: ${stats.invalidPackets}`)
    debugLog(`   Packets per second: ${stats.packetsPerSecond}`)
    debugLog(`   Data type: ${stats.dataAnalysis.dataType}`)
    
    debugLog("🔗 Connection Status:")
    debugLog(`   Connected: ${connectionStatus.connected}`)
    debugLog(`   Streaming: ${connectionStatus.streaming}`)
    debugLog(`   Message: ${connectionStatus.message}`)
    debugLog(`   Device: ${connectionStatus.device?.name || 'None'}`)
    
    if (stats.totalSamples === 0) {
      debugWarn("⚠️ No data received. Possible issues:")
      debugWarn("   1. IMU not sending data after START command")
      debugWarn("   2. Wrong delimiter configuration")
      debugWarn("   3. Wrong start command")
      debugWarn("   4. Bluetooth connection issues")
      debugWarn("   5. IMU requires different initialization sequence")
    }
  }

  static suggestTroubleshootingSteps(): void {
    debugLog("🛠️ IMU Troubleshooting Suggestions:")
    debugLog("1. Check if IMU requires pairing/bonding first")
    debugLog("2. Try different start commands: START, start, S, 1")
    debugLog("3. Test different delimiters: \\n, \\r\\n, \\r")
    debugLog("4. Verify IMU is powered and in correct mode")
    debugLog("5. Check if IMU needs configuration commands before streaming")
    debugLog("6. Try manual Bluetooth terminal app to test communication")
    debugLog("7. Check IMU documentation for command protocol")
    debugLog("8. Verify Bluetooth Classic vs BLE requirements")
  }
}