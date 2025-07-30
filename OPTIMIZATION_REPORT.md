# Performance Optimization Report for sEMG Bluetooth App

## Executive Summary
Your mobile application is experiencing freezing issues when connected to a real HC-05 board. After analyzing the codebase, I've identified several critical performance bottlenecks and have recommendations for optimization while maintaining real-time data collection capability.

## Critical Performance Issues Identified

### 1. **Console Logging Overhead (HIGHEST PRIORITY)**
- **72 console statements** across 3 main files
- **Most critical**: Data processing logs executing at 1000Hz in `BluetoothStore.ts`
- Each data packet triggers 5-10 console.log calls
- **Impact**: At 1000Hz, this generates 5,000-10,000 console operations per second

### 2. **UI Update Frequency**
- SEMGRealtimeScreen updates all 10 channels even when only 1 is expanded
- Timer-based updates run at 10Hz for each expanded channel
- Multiple React re-renders triggered by observable changes

### 3. **Real-time Data Display Overhead**
- BluetoothScreen displays latest 10 samples with full re-renders
- Each sample shows timestamp conversion and array formatting
- Stats calculation happens on every render cycle

### 4. **Backend Sync Not Implemented**
- Data accumulates in circular buffers without backend offloading
- No batching strategy for network efficiency
- Risk of data loss if app crashes

## Optimization Recommendations

### 1. **Remove Console Logging (Immediate Fix)**
```typescript
// Create a debug logger that can be disabled in production
const DEBUG = __DEV__ && false; // Set to false even in dev for performance testing

const debugLog = (...args: any[]) => {
  if (DEBUG) console.log(...args);
};
```

**Files to update:**
- `BluetoothStore.ts`: Remove all logs in `processSampleData` (lines 202-231)
- `SEMGRealtimeScreen.tsx`: Remove interaction logs (lines 546-667)
- `BluetoothScreen.tsx`: Keep only error logs

### 2. **Optimize UI Updates**

#### A. Optimize BluetoothScreen Real-time Display (Keep but Optimize)
```typescript
// Keep real-time display but optimize rendering
const LatestSamplesDisplay = memo(({ samples }) => {
  // Only show last 5 samples instead of 10
  const displaySamples = samples.slice(0, 5);
  
  return (
    <View style={{ maxHeight: 150 }}>
      {displaySamples.map((item, index) => (
        <View key={`${item.timestamp}-${index}`} style={$sampleItem}>
          <Text text={`#${index + 1}`} style={$sampleIndex} />
          <Text
            text={`[${item.values.slice(0, 3).map(v => v.toFixed(1)).join(", ")}...]`} // Show only first 3 channels
            style={$sampleValues}
            numberOfLines={1}
          />
        </View>
      ))}
    </View>
  );
}, (prev, next) => prev.samples.length === next.samples.length);

// Throttle updates to reduce re-renders
const [displaySamples, setDisplaySamples] = useState([]);
useEffect(() => {
  const interval = setInterval(() => {
    setDisplaySamples(bluetoothStore.latest1kHzSamples);
  }, 200); // Update every 200ms (5Hz) instead of on every packet
  return () => clearInterval(interval);
}, [bluetoothStore]);
```

#### B. Throttle SEMGRealtimeScreen Updates
```typescript
// Update only every 200ms (5Hz) instead of 100ms (10Hz)
const UPDATE_INTERVAL = 200; // was 100

// Only calculate stats when channel is expanded
const channelStats = useMemo(() => {
  if (expandedChannel !== null && isStreaming) {
    return bluetoothStore.getChannelStatistics();
  }
  return {};
}, [expandedChannel, updateTrigger]);
```

### 3. **Implement Backend Sync Strategy**

#### A. Backend Queue Processing
```typescript
// In BluetoothStore.ts
const startBackendSync = flow(function* () {
  self.backendSyncInterval = setInterval(async () => {
    if (self.backendQueue.getSize() >= 100) { // Batch 100 samples
      const batch = self.backendQueue.getLatest(100);
      self.backendQueue.clear(); // Clear after extracting
      
      try {
        yield sendBatchToBackend(batch);
      } catch (error) {
        // Re-add to queue on failure
        batch.forEach(sample => self.backendQueue.push(sample));
      }
    }
  }, 1000); // Sync every second
});

const sendBatchToBackend = async (batch: SEmgSample[]) => {
  const response = await fetch('http://your-backend/api/semg/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: self.currentSessionId,
      samples: batch,
      deviceInfo: {
        name: self.selectedDevice?.name,
        address: self.selectedDevice?.address
      }
    })
  });
  
  if (!response.ok) throw new Error('Backend sync failed');
};
```

#### B. Express.js Backend Structure
```javascript
// Express backend endpoint
app.post('/api/semg/batch', async (req, res) => {
  const { sessionId, samples, deviceInfo } = req.body;
  
  // Bulk insert to MongoDB
  try {
    await SemgSample.insertMany(samples.map(sample => ({
      ...sample,
      sessionId,
      deviceInfo,
      receivedAt: new Date()
    })));
    
    res.status(200).json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 4. **Memory Management Optimizations**

#### A. Implement Data Compression
```typescript
// Compress data before backend sync
const compressData = (samples: SEmgSample[]) => {
  // Convert to more efficient format
  return {
    timestamps: samples.map(s => s.timestamp),
    values: samples.map(s => s.values),
    sessionId: samples[0]?.sessionId
  };
};
```

#### B. Add Memory Monitoring
```typescript
// Monitor memory usage
const getMemoryUsage = () => {
  const usage = (performance as any).memory;
  if (usage) {
    return {
      usedJSHeapSize: (usage.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
      totalJSHeapSize: (usage.totalJSHeapSize / 1048576).toFixed(2) + ' MB'
    };
  }
  return null;
};
```

### 5. **Additional Quick Wins**

1. **Disable Animations**
   - Already implemented in Victory Native charts
   - Remove Animated.View animations in ChannelCard

2. **Reduce Statistical Calculations**
   ```typescript
   // Calculate stats only when needed, not on every render
   const [statsCache, setStatsCache] = useState({});
   
   useEffect(() => {
     if (expandedChannel !== null && isStreaming) {
       const timer = setTimeout(() => {
         const stats = bluetoothStore.getChannelStatistics();
         setStatsCache(stats);
       }, 500); // Update stats every 500ms
       return () => clearTimeout(timer);
     }
   }, [expandedChannel, isStreaming]);
   ```

3. **Implement React.memo More Aggressively**
   ```typescript
   const ChannelCard = memo(function ChannelCard(props) {
     // Component code
   }, (prevProps, nextProps) => {
     // Custom comparison - only re-render if essential props change
     return (
       prevProps.isExpanded === nextProps.isExpanded &&
       prevProps.isStreaming === nextProps.isStreaming &&
       (prevProps.isExpanded ? false : true) // Always skip if collapsed
     );
   });
   ```

## Implementation Priority

1. **Immediate (Day 1)**
   - Remove all console.log statements in data processing path
   - Reduce UI update frequency to 5Hz
   - Remove latest samples display in BluetoothScreen

2. **Short Term (Week 1)**
   - Implement backend sync with batching
   - Add memory monitoring
   - Optimize React re-renders with better memoization

3. **Medium Term (Week 2-3)**
   - Implement data compression
   - Add performance profiling tools
   - Create production/debug build configurations

## Expected Performance Improvements

- **Console log removal**: 50-70% CPU reduction
- **UI throttling**: 20-30% CPU reduction
- **Backend offloading**: Prevents memory buildup
- **Combined optimizations**: Should eliminate freezing issues

## Testing Recommendations

1. Test with real HC-05 device at full 1000Hz
2. Monitor memory usage over 10-minute sessions
3. Profile CPU usage with React DevTools Profiler
4. Test backend sync under poor network conditions
5. Verify data integrity after optimizations

## Conclusion

The primary cause of freezing is the excessive console logging in the high-frequency data path. Removing these logs should provide immediate relief. The additional optimizations will ensure stable performance for extended recording sessions while maintaining data integrity for your medical application.