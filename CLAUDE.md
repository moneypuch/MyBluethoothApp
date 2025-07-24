# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a React Native Bluetooth medical/biomedical data acquisition application built with Ignite CLI. The app specializes in high-frequency data streaming from HC-05 Bluetooth modules for sEMG (surface electromyography) data collection at 1000 samples/second with 10 channels.

### Key Technologies
- React Native 0.76.9 with Expo 52
- MobX State Tree for state management
- react-native-bluetooth-classic for Bluetooth communication
- Victory Native v37.3.6 for real-time data visualization (migrated from react-native-gifted-charts)
- TypeScript with strict configuration
- Ignite CLI boilerplate architecture

## Development Commands

### Build & Development
```bash
npm install                    # Install dependencies
npm start                     # Start Expo dev server
npm run android               # Run on Android device/emulator
npm run ios                   # Run on iOS device/simulator

# EAS Build Commands (use these for device builds)
npm run build:ios:sim         # Build for iOS simulator
npm run build:ios:dev         # Build for iOS device
npm run build:android:sim     # Build for Android emulator
npm run build:android:dev     # Build for Android device
```

### Code Quality & Testing
```bash
npm run compile               # TypeScript compilation check
npm run lint                  # ESLint with auto-fix
npm run lint:check            # ESLint check only
npm test                      # Run Jest tests
npm run test:watch            # Run tests in watch mode
```

### Useful Development Commands
```bash
npm run adb                   # Set up Android port forwarding for dev tools
```

## Architecture Overview

### State Management (MobX State Tree)
The app uses MST stores located in `app/models/`:

- **RootStore** (`RootStore.ts`): Main store container
- **BluetoothStore** (`BluetoothStore.ts`): Core Bluetooth functionality with high-performance data management
  - Manages HC-05 device connections
  - Handles 1000Hz data streaming (10,000 data points/second)
  - Multi-resolution buffering (1kHz, 100Hz, 10Hz)
  - Real-time data visualization support
  - Session management and statistics
- **AuthenticationStore**: User authentication state
- **EpisodeStore**: Demo/episode management

### Navigation Structure
- **AppNavigator** (`navigators/AppNavigator.tsx`): Main stack navigator with auth flow
- **DemoNavigator** (`navigators/DemoNavigator.tsx`): Bottom tab navigator with main screens:
  - Home (DemoCommunity)
  - StoreBl (BluetoothScreen) - Main Bluetooth interface
  - Real (SEMGRealtimeScreen) - Real-time data visualization
  - Bluetooth2 - Secondary Bluetooth interface
  - Charts (MedicalChartsScreen) - Data visualization
  - Components (DemoShowroom) - UI components demo
  - Debug - Development utilities

### Key Screens
- **BluetoothScreen** (`screens/BluetoothScreen.tsx`): Primary Bluetooth device connection and control
- **SEMGRealtimeScreen**: Real-time sEMG data visualization using Victory Native charts
- **MedicalChartsScreen**: Historical data charts and analytics
- **BluetoothScreen2**: Alternative Bluetooth interface

### Component Architecture
Components in `app/components/` follow Ignite patterns:
- All components are TypeScript with proper typing
- Use themed styling via `useAppTheme()`
- Include built-in components: Button, Card, Text, Screen, etc.
- Custom Toggle components (Checkbox, Radio, Switch)
- **SEMGChart** (`app/components/SEMGChart.tsx`): High-performance Victory Native chart component for real-time data

### Theme & Styling
- Centralized theming in `app/theme/`
- Support for light/dark modes
- Color definitions in `colors.ts` and `colorsDark.ts`
- Typography and spacing constants
- Styled components use `ThemedStyle<T>` pattern

## Bluetooth Data Flow

### High-Performance Data Pipeline
```
HC-05 Device (1000Hz) → Raw String Data → Parse to Float32Array → 
Multi-Resolution Buffers (1kHz/100Hz/10Hz) → Chart Visualization + Backend Sync
```

### Key BluetoothStore Methods
```typescript
// Connection management
await bluetoothStore.connectToDevice(device)
await bluetoothStore.disconnectDevice()

// Data streaming
await bluetoothStore.startStreamingCommand()  // Sends "Start" command
await bluetoothStore.stopStreamingCommand()   // Sends "Stop" command

// Data access
const latest = bluetoothStore.getLatestSamples(100, '1kHz')
const stats = bluetoothStore.getChannelStatistics()
const status = bluetoothStore.connectionStatus
```

### Data Format & Performance
- **Input**: "val1 val2 val3 ... val10\n" strings at 1000Hz
- **Processing**: Automatic parsing with **O(1) circular buffer operations**
- **Output**: Multi-resolution circular buffers (1kHz/100Hz/10Hz)
- **Performance**: Eliminates bottlenecks from array.unshift() and array.slice() operations

## Configuration & Setup

### File Structure
```
app/
├── components/          # Reusable UI components
├── config/             # Environment configuration
├── i18n/               # Internationalization
├── models/             # MST stores and data models
├── navigators/         # Navigation setup
├── screens/            # Screen components
├── services/           # API and external services
├── theme/              # Styling and theming
└── utils/              # Utility functions
```

### TypeScript Configuration
- Strict TypeScript enabled
- Path aliases: `@/*` maps to `./app/*`
- Target: ESNext with React Native JSX

### Testing
- Jest with Expo preset
- Setup file: `test/setup.ts`
- React Native Testing Library configured

## Development Guidelines

### MobX State Tree Patterns
- Use `observer()` wrapper for components that consume store data
- Access stores via `useStores()` hook
- Define computed values in `.views()` sections
- Use `flow()` for async actions

### High-Performance Bluetooth Development
- The BluetoothStore uses **circular buffers** for O(1) data operations
- **CRITICAL**: Data streaming is optimized for 1000Hz - NO array.unshift() or array.slice()
- **MST Observability**: Device lists + reactive buffer triggers ensure UI updates
- **Hybrid Approach**: Buffers in volatile (performance) + observable counters (reactivity)
- Memory management is automatic with fixed-size circular buffers
- Use the new methods: `getLatestSamples()`, `getChartData()`, `getChannelStatistics()`
- Multi-resolution buffers (1kHz/100Hz/10Hz) for different time scales
- Always check connection status before sending commands
- Monitor performance with `getBufferStats()`

### Code Style
- ESLint configuration includes React Native and Prettier rules
- Use path aliases for imports: `@/components` instead of relative paths
- Follow existing component patterns in the codebase

### Platform Support
- iOS and Android via React Native
- Web support available via Expo
- Uses Expo dev client for development builds

## Performance Optimizations

### Circular Buffer Implementation
- **Location**: `app/utils/CircularBuffer.ts` - High-performance circular buffer utility
- **BluetoothStore**: Uses `SEmgCircularBuffer` instances instead of arrays
- **Key Benefits**:
  - **O(1) insertions**: No more expensive `.unshift()` operations 
  - **O(count) retrievals**: `.getLatest(n)` vs `.slice(0, n)` on 10k+ arrays
  - **Memory efficiency**: Fixed-size buffers, no memory leaks
  - **Multi-resolution**: Automatic downsampling to 100Hz and 10Hz buffers

### MST Observable Properties & Reactivity Solution
```typescript
// Device management (observable)
pairedDevices: types.array(types.frozen<BluetoothDevice>())
selectedDevice: types.maybeNull(types.frozen<BluetoothDevice>())

// Buffer reactivity triggers (observable counters - increment on data changes)
buffer1kHzUpdateCount: types.optional(types.number, 0)
buffer100HzUpdateCount: types.optional(types.number, 0)
buffer10HzUpdateCount: types.optional(types.number, 0)
lastDataTimestamp: types.optional(types.number, 0)

// Circular buffers stay in volatile (non-observable for performance)
buffer1kHz: new SEmgCircularBuffer(10000)  // In .volatile()
buffer100Hz: new SEmgCircularBuffer(6000)  // In .volatile()
buffer10Hz: new SEmgCircularBuffer(3600)   // In .volatile()

// Methods now reference reactive counters for UI updates
getLatestSamples(), getChartData(), getChannelStatistics()
```

**Key Insight**: Circular buffers must stay in `.volatile()` for performance, but we add observable counter triggers that increment when buffers change, enabling UI reactivity.

### Buffer Configurations
```typescript
buffer1kHz: 10,000 samples (10 seconds)
buffer100Hz: 6,000 samples (60 seconds)  
buffer10Hz: 3,600 samples (6 minutes)
backendQueue: 5,000 samples for upload
```

## Recent Updates & Improvements

### Victory Native Migration (v37.3.6)
- Migrated from react-native-gifted-charts to Victory Native for better performance
- Created custom SEMGChart component with React.memo optimization
- Implemented fallback error handling for Victory Native imports
- Supports real-time "LIVE" indicator when streaming
- Animations disabled by default for optimal performance

### Performance Optimizations
- **90% CPU reduction**: Only processes data for expanded channels (1 out of 10)
- **Timer-based updates**: Fixed "Maximum update depth exceeded" errors with 10Hz update trigger
- **Eliminated infinite rerenders**: Removed reactive buffer dependencies from React hooks
- **Optimized React.memo**: Custom comparison function prevents unnecessary rerenders

### HC-05 Bluetooth Compatibility
- **Slow command writing**: Character-by-character transmission with 50ms delays
- **Improved termination**: Changed from `\r\n` to `\r` for better HC-05 compatibility
- **sendCommandSlowly function**: Ensures reliable command delivery to finicky HC-05 modules
- **Enabled by default**: All HC-05 commands use slow write mode for reliability

## Important Notes

- **CRITICAL**: This is a medical/biomedical data acquisition app - ensure data integrity and performance
- **HIGH-FREQUENCY STREAMING**: Optimized circular buffers eliminate performance bottlenecks at 1000Hz
- The app uses MobX State Tree extensively - understand MST patterns before making changes
- EAS builds are required for device deployment (standard Expo builds won't work with native modules)
- **Performance monitoring**: Use `bluetoothStore.getBufferStats()` to track system performance
- **Victory Native**: Uses legacy v37.3.6 for React 18 compatibility (newer versions require React 19)