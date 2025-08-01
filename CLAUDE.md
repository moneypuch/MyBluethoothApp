# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React Native medical/biomedical data acquisition application supporting multiple device types:
- **sEMG (HC-05)**: 1000Hz sampling with 10 channels for surface electromyography  
- **IMU**: 100Hz sampling with 9 channels (Accel XYZ, Gyro XYZ, Mag XYZ)
Built with Ignite CLI boilerplate for high-performance Bluetooth data streaming.

### Key Technologies
- React Native 0.76.9 with Expo 52 (using expo-dev-client)
- MobX State Tree (MST) for state management
- react-native-bluetooth-classic for HC-05 communication
- Victory Native v37.3.6 for real-time data visualization
- TypeScript with strict mode enabled
- Ignite CLI boilerplate patterns

## Critical Commands

```bash
# Development
npm install                   # Install dependencies
npm start                     # Start Expo dev server
npm run android               # Run on Android
npm run ios                   # Run on iOS

# EAS Build (required for native modules)
npm run build:ios:sim         # iOS simulator build
npm run build:ios:dev         # iOS device build
npm run build:android:sim     # Android emulator build
npm run build:android:dev     # Android device build

# Code Quality
npm run compile               # TypeScript compilation check
npm run lint                  # ESLint with auto-fix
npm test                      # Run Jest tests
npm run adb                   # Android port forwarding
```

## Architecture Overview

### High-Performance Data Flow
The app uses a dual-store architecture to handle high-frequency data streaming without UI performance issues:

1. **BluetoothDataService** (`app/services/BluetoothDataService.ts`)
   - Non-reactive service handling raw Bluetooth data (1000Hz sEMG, 100Hz IMU)
   - Uses circular buffers for O(1) performance
   - Multi-resolution buffering: 1kHz → 100Hz → 10Hz downsampling
   - Device type-aware sample rate handling
   - Backend queue management for data upload

2. **BluetoothStoreLite** (`app/models/BluetoothStoreLite.ts`)
   - MST store for UI state and reactive properties only
   - Receives throttled updates from data service
   - Manages device connections and UI reactivity

### Store Architecture
```
RootStore
├── authenticationStore      # User authentication
└── bluetoothStore          # BluetoothStoreLite (UI state only)
    └── delegates to → BluetoothDataService (high-frequency data)
```

### Navigation Structure
- **AppNavigator**: Main stack with auth flow
- **DemoNavigator**: Bottom tabs:
  - Home (HomeScreen)
  - StoreBl (BluetoothScreen) - Device connection UI
  - Real (SEMGRealtimeScreen) - Live data visualization
  - Components (DemoShowroom)
  - Debug (DemoDebugScreen)

## Bluetooth Implementation Details

### Data Format
- **Input**: "val1 val2 val3 ... val10\n" at 1000Hz
- **Processing**: Parsed to Float32Array, stored in circular buffers
- **Buffers**: 
  - 1kHz: 10,000 samples (10 seconds)
  - 100Hz: 6,000 samples (60 seconds)
  - 10Hz: 3,600 samples (6 minutes)

### HC-05 Specific Optimizations
- **Connection**: Uses empty delimiter and 512-byte read buffer
- **Commands**: Character-by-character transmission with 50ms delays
- **Termination**: Uses `\r` instead of `\r\n`
- **Key Commands**: "Start", "Stop" for streaming control

### Performance Critical Points
1. **Circular Buffers** (`app/utils/CircularBuffer.ts`)
   - Fixed-size Float32Array storage
   - O(1) insertion and retrieval
   - No array.unshift() or slice() operations

2. **MST Reactivity Hybrid**
   - Buffers in `.volatile()` (non-observable)
   - Observable update counters trigger UI refreshes
   - 10Hz throttled updates to prevent rerender storms

3. **Victory Native Charts**
   - React.memo with custom comparison
   - Animations disabled for performance
   - Only renders expanded channels

## Key Implementation Files

- `app/services/BluetoothDataService.ts` - Core data handling
- `app/models/BluetoothStoreLite.ts` - MST store for UI
- `app/screens/BluetoothScreen.tsx` - Device connection UI
- `app/screens/SEMGRealtimeScreen.tsx` - Real-time visualization
- `app/components/SEMGChart.tsx` - Victory Native chart wrapper
- `app/utils/CircularBuffer.ts` - High-performance buffer implementation

## Development Guidelines

### MST Patterns
- Use `observer()` on all components reading store data
- Access stores via `useStores()` hook
- Use `flow()` for async actions in stores
- Keep high-frequency data out of observable properties

### Performance Guidelines
- Never use array.unshift() or slice() on data buffers
- Use throttled callbacks for UI updates (100ms minimum)
- Process only visible channel data
- Monitor with `bluetoothDataService.getStatistics()`

### TypeScript Configuration
- Strict mode enabled
- Path alias: `@/*` → `./app/*`
- Target: ESNext

## Recent Critical Changes

1. **BluetoothStore Split** (Performance Fix)
   - Separated high-frequency data (BluetoothDataService) from UI state (BluetoothStoreLite)
   - Eliminated MST reactivity overhead on 1000Hz data

2. **Victory Native Migration**
   - Replaced react-native-gifted-charts with Victory Native v37.3.6
   - Custom SEMGChart component with optimizations

3. **HC-05 Compatibility**
   - Implemented slow command writing for reliability
   - Optimized connection parameters for 1000Hz streaming

## Important Notes

- **Medical Device**: Maintain data integrity and performance at all times
- **Native Modules**: EAS builds required (not standard Expo builds)
- **Performance**: Monitor buffer stats and sampling rates continuously
- **Victory Native**: Locked to v37.3.6 for React 18 compatibility