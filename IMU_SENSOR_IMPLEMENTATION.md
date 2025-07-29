# IMU Sensor Analysis & Testing Implementation

## Overview

I've successfully implemented a comprehensive IMU sensor analysis and testing solution for your React Native application. This implementation enables you to connect to an IMU sensor via Bluetooth Classic, analyze its 40Hz data stream with 9 values (accelerometer, gyroscope, magnetometer), and perform real-time data quality assessment.

## Implementation Details

### 1. **IMU Data Service** (`app/services/IMUDataService.ts`)
- **Purpose**: Handles all IMU-specific Bluetooth communication and data processing
- **Key Features**:
  - Connection management optimized for 40Hz data streams
  - Real-time frequency analysis to verify actual transmission rate
  - Data type detection (integer vs float) with decimal place tracking
  - Value range tracking for each sensor axis
  - Packet validation and error tracking
  - Circular buffer implementation for efficient data storage
  - Export functionality for collected test data

### 2. **IMU Store** (`app/models/IMUStore.ts`)
- **Purpose**: MobX State Tree store for reactive UI state management
- **Key Features**:
  - Integration with existing MST architecture
  - Reactive properties for UI updates
  - Connection status management
  - Real-time statistics tracking
  - Device discovery and pairing

### 3. **IMU Debug Dashboard** (`app/screens/IMUDebugScreen.tsx`)
- **Purpose**: Comprehensive UI for IMU sensor testing and analysis
- **Key Components**:
  - Device discovery and connection interface
  - Real-time frequency analysis display
  - Data quality indicators
  - Live sensor value display (accel/gyro/mag)
  - Value range tracking
  - Raw data stream viewer
  - Export functionality

### 4. **Navigation Integration**
- Added IMU tab to the bottom navigation
- Accessible via "IMU" tab in the app

## Key Features Implemented

### Connection Testing
- Bluetooth device scanning and pairing
- Connection status monitoring
- Auto-reconnection handling
- Signal strength display (where available)

### Data Rate Verification
- Real-time frequency calculation
- Expected vs actual Hz comparison
- Packet interval tracking
- Jitter analysis
- Missed packet detection

### Data Type Analysis
- Automatic detection of integer vs float values
- Decimal place tracking per channel
- Sample format collection
- Value range analysis per sensor axis

### Data Structure Validation
- Validates exactly 9 values per packet
- Maps values to sensor types:
  - Values 0-2: Accelerometer (X, Y, Z)
  - Values 3-5: Gyroscope (X, Y, Z)
  - Values 6-8: Magnetometer (X, Y, Z)
- Tracks invalid packet count

### Debug Dashboard Features
- **Live Monitoring**: Real-time display of all 9 sensor values
- **Frequency Meter**: Shows actual Hz with health indicator
- **Packet Counter**: Total samples and valid packet percentage
- **Data Quality**: Excellent/Good/Poor indicators
- **Value Ranges**: Min/max tracking for each axis
- **Raw Data View**: Optional display of raw packet strings
- **Export Function**: JSON export of test results

## Usage Instructions

1. **Connect to IMU**:
   - Navigate to the IMU tab
   - Ensure Bluetooth is enabled
   - Select your IMU device from the list
   - Tap "Connect"

2. **Start Data Collection**:
   - Once connected, tap "Start Streaming"
   - Send "START" command to your IMU (configurable)
   - Monitor real-time data on the dashboard

3. **Analyze Data**:
   - Check frequency analysis (should show ~40Hz)
   - Monitor data type detection results
   - Review value ranges for each sensor
   - Check packet validity percentage

4. **Export Results**:
   - Tap "Export Test Data" button
   - Share or save the JSON analysis report

## Configuration Options

### Adjustable Parameters in IMUDataService:
```typescript
private delimiter = "\n"          // Line delimiter (adjust based on IMU format)
private expectedValueCount = 9    // Number of values per packet
private expectedHz = 40          // Expected transmission frequency
```

### Start/Stop Commands:
The service sends "START" and "STOP" commands by default. Modify in `startStreaming()` and `stopStreaming()` methods if your IMU uses different commands.

## Performance Considerations

- Uses circular buffers for O(1) data operations
- Throttled UI updates to prevent performance issues
- Efficient data parsing with regex splitting
- Memory-efficient with fixed buffer sizes

## Next Steps for Phase 2

Once you've validated the IMU connection and data characteristics:

1. **Data Visualization**: Integrate Victory Native charts for real-time plotting
2. **Backend Sync**: Implement data upload to your Express.js backend
3. **Session Management**: Store and retrieve historical IMU sessions
4. **Advanced Analysis**: Add FFT, motion detection, or other algorithms

## Troubleshooting

- **No devices found**: Ensure IMU is paired in system Bluetooth settings
- **Connection fails**: Check IMU is in discoverable/connectable mode
- **No data received**: Verify IMU start command and data format
- **Wrong frequency**: Check delimiter settings and data parsing logic

The implementation is now ready for testing with your IMU sensor. The analysis will help you understand the exact data format and characteristics before proceeding to the visualization phase.