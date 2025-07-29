# IMU Sensor Troubleshooting Guide

## Problem: No Data Received After Connection and Start Streaming

If you're connected to your IMU sensor but not receiving any data after starting streaming, here's a comprehensive troubleshooting guide with tools I've built into the app.

## Built-in Debug Tools

### 1. **Enhanced Debug Logging**
The IMU service now includes extensive debug logging. Check your console/logs for:
- 🚀 Connection attempts
- 📤 Commands being sent
- 📦 Raw data received
- 🔍 Data parsing attempts
- ⚠️ Any warnings or errors

### 2. **Diagnostic Tools**
On the IMU Debug screen, use the "Diagnostics" button to:
- Display current connection status
- Show data reception statistics
- Get troubleshooting suggestions
- Identify common configuration issues

### 3. **Configuration Testing**
Use the "Test Configurations" button to automatically test different combinations of:
- Delimiters: `\n`, `\r\n`, `\r`, `,`
- Commands: `START`/`STOP`, `start`/`stop`, `S`/`s`, `1`/`0`
- Expected value counts

### 4. **Mock Data Testing**
Use the "Test Mock Data" button to verify that data processing works correctly by injecting simulated IMU data.

## Common Issues and Solutions

### Issue 1: Wrong Start Command
**Symptoms**: Connected but no data after "Start Streaming"

**Solutions**:
1. Check your IMU documentation for the correct start command
2. Try common variations:
   - `START` / `STOP` (default)
   - `start` / `stop` (lowercase)
   - `S` / `s` (single character)
   - `1` / `0` (numeric)
   - Your IMU-specific commands

### Issue 2: Wrong Delimiter
**Symptoms**: Data received but not parsed correctly, invalid packet counts

**Solutions**:
1. Check what line ending your IMU uses:
   - `\n` (Unix/Linux - default)
   - `\r\n` (Windows)
   - `\r` (Old Mac)
   - `,` (CSV format)

### Issue 3: Wrong Data Format
**Symptoms**: Packets parsed but wrong number of values

**Check**:
- Does your IMU send exactly 9 values per line?
- Are values space-separated or comma-separated?
- Does the IMU send additional status/header data?

### Issue 4: IMU Not Responding to Commands
**Symptoms**: Commands sent but IMU doesn't start transmitting

**Troubleshooting**:
1. Check if IMU requires initialization sequence
2. Verify correct baud rate (configured in Bluetooth connection)
3. Try manual Bluetooth terminal app to test communication
4. Check if IMU needs configuration commands before streaming
5. Verify IMU is powered and in correct mode

### Issue 5: Bluetooth Connection Issues
**Symptoms**: Connection established but no communication

**Solutions**:
1. Ensure IMU is properly paired in system Bluetooth settings
2. Check if another app is using the IMU connection
3. Try disconnecting and reconnecting
4. Restart Bluetooth on your device
5. Check if IMU uses Bluetooth Classic vs BLE

## Step-by-Step Debugging Process

### Step 1: Verify Basic Functionality
1. Connect to your IMU sensor
2. Tap "Test Mock Data" button
3. If mock test passes, data processing is working correctly
4. If mock test fails, there's an issue with the data processing logic

### Step 2: Check Connection Communication
1. Tap "Diagnostics" to see current status
2. Start streaming and check console logs for:
   - Command sending confirmation: ✅ START command sent successfully
   - Data reception: 📦 Raw data received
   - Data processing: 🔍 Processing IMU data

### Step 3: Test Different Configurations
1. If no data received, tap "Test Configurations"
2. This will automatically try different delimiter and command combinations
3. Check console logs and alert results for working configurations

### Step 4: Manual Configuration
If automatic testing doesn't find a working configuration:

1. **Check Your IMU Documentation** for:
   - Correct start/stop commands
   - Data format specification
   - Line ending requirements
   - Initialization sequence

2. **Use External Tools**:
   - Bluetooth terminal apps (like Serial Bluetooth Terminal)
   - Test communication manually
   - Identify exact command format and responses

3. **Modify Configuration** in code if needed:
   ```typescript
   // In IMUDataService.ts, update these values:
   private delimiter = "\r\n"        // Change based on your IMU
   private startCommand = "START"    // Change to your IMU's command
   private stopCommand = "STOP"      // Change to your IMU's command
   private expectedValueCount = 9    // Change if different
   ```

## Console Log Analysis

Look for these patterns in your console logs:

### ✅ **Good Signs**:
```
🚀 Starting IMU streaming...
✅ START command sent successfully  
📦 Raw data received: "1.234 5.678 9.101 ..."
🔍 Processing IMU data. Length: 45 Content: 1.234 5.678...
📋 Split into 1 lines using delimiter '\n'
🎯 Parsing packet: 1.234 5.678 9.101 1.121 3.141 5.926 2.718 1.414 1.732
✅ Parsed values: [1.234, 5.678, 9.101, ...] (count: 9)
```

### ⚠️ **Warning Signs**:
```
📤 Sending IMU command: 'START'
✅ IMU command sent successfully: START
🎧 Setting up IMU data listener...
✅ Data listener setup complete
📡 IMU streaming started, waiting for data...
(No data received...)
```

### ❌ **Error Signs**:
```
❌ Failed to send START command
⚠️ Received data but no data.data property
⚠️ Invalid number: abc
Invalid packet: expected 9 values, got 5
```

## Advanced Troubleshooting

### Check IMU Requirements
1. **Power**: Ensure IMU has adequate power supply
2. **Mode**: Some IMUs have different modes (config vs streaming)
3. **Initialization**: May need setup commands before streaming
4. **Rate**: Some IMUs need rate configuration commands

### Bluetooth Settings
1. **Pairing**: Ensure device is properly paired (not just discovered)
2. **Services**: Check if IMU uses standard Serial Port Profile (SPP)
3. **Security**: Some devices require PIN or specific pairing methods

### Data Format Verification
1. Use raw data view in the app to see exactly what's received
2. Compare with IMU documentation
3. Check for hidden characters or formatting differences

## Getting Help

If you're still having issues:

1. **Export Debug Data**: Use "Export Test Data" to get detailed logs
2. **Console Logs**: Copy relevant console output
3. **IMU Specifications**: Have your IMU's technical documentation ready
4. **Test Results**: Include results from "Test Configurations" and "Test Mock Data"

The enhanced debugging tools should help identify exactly where the communication is failing and guide you to the solution.