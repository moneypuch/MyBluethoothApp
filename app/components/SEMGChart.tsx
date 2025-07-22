import React, { memo, useMemo } from "react"
import { View, ViewStyle, TextStyle } from "react-native"
import { VictoryChart, VictoryLine, VictoryAxis, VictoryContainer } from "victory-native"
import { Text } from "@/components"
import { colors } from "@/theme"

interface SEMGChartProps {
  data: Array<{ x: number; y: number }>
  channelIndex: number
  channelColor: string
  channelColorLight: string
  width: number
  height: number
  isStreaming: boolean
  stats: {
    min: number
    max: number
    avg: number
    rms: number
  }
}

/**
 * High-performance Victory Native chart component optimized for real-time sEMG data streaming.
 * Uses React.memo to prevent unnecessary rerenders and Victory Native for smooth performance.
 */
export const SEMGChart = memo<SEMGChartProps>(function SEMGChart({
  data,
  channelIndex,
  channelColor,
  channelColorLight,
  width,
  height,
  isStreaming,
  stats,
}) {
  // Memoize chart data to prevent unnecessary processing
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return []
    
    // Debug: Log when chart data updates
    if (__DEV__ && channelIndex === 0) {
      console.log(`SEMGChart: Channel ${channelIndex} updating with ${data.length} points, last value: ${data[data.length - 1]?.y}`)
    }
    
    // Transform data for Victory Native (ensure proper format)
    return data.map((point, index) => ({
      x: index, // Use index for x-axis instead of timestamp for smoother rendering
      y: point.y || (point as any).value || 0, // Handle different data formats
    }))
  }, [data, channelIndex])

  // Memoize Y-axis domain for stable chart scaling
  const yDomain = useMemo(() => {
    const margin = Math.max(Math.abs(stats.max), Math.abs(stats.min), 100) * 0.1
    const maxValue = Math.max(Math.abs(stats.max), Math.abs(stats.min), 100) + margin
    return [-maxValue, maxValue]
  }, [stats.max, stats.min])

  // Memoize chart theme for performance
  const chartTheme = useMemo(() => ({
    axis: {
      style: {
        axis: { stroke: colors.palette.neutral300, strokeWidth: 1 },
        grid: { stroke: colors.palette.neutral200, strokeDasharray: "3,3" },
        tickLabels: { 
          fontSize: 10, 
          fill: colors.palette.neutral400,
          fontFamily: "System" 
        },
      },
    },
    line: {
      style: {
        data: { 
          stroke: channelColor, 
          strokeWidth: 2,
          fill: "none"
        },
      },
    },
  }), [channelColor])

  if (!chartData || chartData.length === 0) {
    return (
      <View style={[$noDataContainer, { width, height }]}>
        <Text text="No data available" style={$noDataText} />
        {!isStreaming && (
          <Text text="Start streaming to see real-time data" style={$noDataSubtext} />
        )}
      </View>
    )
  }

  return (
    <View style={[$chartContainer, { backgroundColor: channelColorLight + "20" }]}>
      <VictoryChart
        theme={chartTheme}
        width={width}
        height={height}
        padding={{ left: 40, top: 20, right: 20, bottom: 40 }}
        domain={{ y: yDomain as [number, number] }}
        containerComponent={
          <VictoryContainer
            responsive={false} // Disable responsive for performance
            style={{
              pointerEvents: "none", // Disable interactions for performance
              touchAction: "none",
            }}
          />
        }
        animate={{ duration: 200 }} // Enable smooth animations for real-time updates
        scale={{ x: "linear", y: "linear" }}
      >
        {/* Y-axis with minimal ticks for performance */}
        <VictoryAxis
          dependentAxis
          tickCount={5}
          tickFormat={(t) => `${t.toFixed(0)}`}
          style={{
            axis: { stroke: colors.palette.neutral300, strokeWidth: 1 },
            grid: { stroke: colors.palette.neutral200, strokeDasharray: "2,2" },
            tickLabels: { 
              fontSize: 9, 
              fill: colors.palette.neutral400,
              fontFamily: "System"
            },
          }}
        />

        {/* X-axis - minimal for performance */}
        <VictoryAxis
          tickCount={5}
          tickFormat={() => ""} // Hide x-axis labels for real-time data
          style={{
            axis: { stroke: colors.palette.neutral300, strokeWidth: 1 },
            grid: { stroke: "transparent" }, // Hide vertical grid lines
            tickLabels: { fontSize: 0 }, // Hide tick labels
          }}
        />

        {/* Main data line */}
        <VictoryLine
          data={chartData}
          interpolation="linear" // Linear interpolation for performance
          style={{
            data: { 
              stroke: channelColor, 
              strokeWidth: 2,
              fill: "none",
              strokeLinecap: "round",
              strokeLinejoin: "round"
            }
          }}
          animate={{ duration: 200 }} // Enable smooth line animations
        />
      </VictoryChart>

      {/* Real-time indicator */}
      {isStreaming && (
        <View style={$realtimeIndicator}>
          <View style={[$realtimeDot, { backgroundColor: channelColor }]} />
          <Text text="LIVE" style={[$realtimeText, { color: channelColor }]} />
        </View>
      )}
    </View>
  )
}, (prevProps, nextProps) => {
  // Less restrictive comparison to allow real-time updates
  // Only prevent rerender if absolutely nothing has changed
  const prevDataLength = prevProps.data?.length || 0
  const nextDataLength = nextProps.data?.length || 0
  
  // Allow any data changes to trigger updates
  if (prevDataLength !== nextDataLength) return false
  if (prevProps.isStreaming !== nextProps.isStreaming) return false
  if (prevProps.channelIndex !== nextProps.channelIndex) return false
  
  // Check if actual data values have changed (for real-time updates)
  if (prevProps.data?.length > 0 && nextProps.data?.length > 0) {
    const prevLastValue = prevProps.data[prevProps.data.length - 1]?.y
    const nextLastValue = nextProps.data[nextProps.data.length - 1]?.y
    if (prevLastValue !== nextLastValue) return false
  }
  
  return true // Prevent rerender only if everything is exactly the same
})

// Styles
const $chartContainer: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 8,
  paddingVertical: 10,
  paddingHorizontal: 5,
  marginBottom: 10,
  position: "relative",
}

const $noDataContainer: ViewStyle = {
  justifyContent: "center",
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  borderRadius: 8,
  marginBottom: 10,
}

const $noDataText: TextStyle = {
  color: colors.palette.neutral500,
  fontSize: 14,
  fontWeight: "500",
}

const $noDataSubtext: TextStyle = {
  color: colors.palette.neutral300,
  fontSize: 12,
  textAlign: "center",
  marginTop: 5,
}

const $realtimeIndicator: ViewStyle = {
  position: "absolute",
  top: 15,
  right: 15,
  flexDirection: "row",
  alignItems: "center",
  backgroundColor: "rgba(255, 255, 255, 0.9)",
  paddingHorizontal: 8,
  paddingVertical: 4,
  borderRadius: 12,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.1,
  shadowRadius: 2,
  elevation: 2,
}

const $realtimeDot: ViewStyle = {
  width: 6,
  height: 6,
  borderRadius: 3,
  marginRight: 5,
}

const $realtimeText: TextStyle = {
  fontSize: 10,
  fontWeight: "bold",
  letterSpacing: 0.5,
}