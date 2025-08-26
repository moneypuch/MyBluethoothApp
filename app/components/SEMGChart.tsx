import React, { memo, useMemo } from "react"
import { View, ViewStyle, TextStyle, Dimensions } from "react-native"
import { Text } from "@/components"
import { colors } from "@/theme"

// Import Victory Native components
let VictoryChart: any, VictoryLine: any, VictoryAxis: any, VictoryContainer: any
try {
  const Victory = require("victory-native")
  VictoryChart = Victory.VictoryChart
  VictoryLine = Victory.VictoryLine
  VictoryAxis = Victory.VictoryAxis
  VictoryContainer = Victory.VictoryContainer
} catch (error) {
  console.warn("Victory Native not available:", error)
}

interface SEMGChartProps {
  data: Array<{ x: number; y: number }>
  channelIndex: number
  channelColor: string
  channelColorLight: string
  width: number
  height: number
  isStreaming: boolean
  yDomain?: [number, number] // Optional Y-axis range, defaults to sEMG range
  yTicks?: number[] // Optional custom Y-axis tick values
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
export const SEMGChart = memo<SEMGChartProps>(
  function SEMGChart({
    data,
    channelIndex,
    channelColor,
    channelColorLight,
    width,
    height,
    isStreaming,
    yDomain = [0, 5500], // Default to sEMG range
    yTicks,
    stats,
  }) {
    // Memoize chart data to prevent unnecessary processing
    const chartData = useMemo(() => {
      if (!data || data.length === 0) return []

      // Transform data for Victory Native (ensure proper format)
      return data
        .map((point) => {
          const yValue = point.y || (point as any).value || 0
          return {
            x: point.x, // Use the actual timestamp/sample number
            y: isFinite(yValue) ? yValue : 0, // Ensure y is always a finite number
          }
        })
        .filter((point) => isFinite(point.x) && isFinite(point.y)) // Remove any invalid points
    }, [data, channelIndex])

    // Y-axis domain - configurable for different data types

    // Memoize chart theme for performance
    const chartTheme = useMemo(
      () => ({
        axis: {
          style: {
            axis: { stroke: colors.palette.neutral300, strokeWidth: 1 },
            grid: { stroke: colors.palette.neutral200, strokeDasharray: "3,3" },
            tickLabels: {
              fontSize: 10,
              fill: colors.palette.neutral400,
              fontFamily: "System",
            },
          },
        },
        line: {
          style: {
            data: {
              stroke: channelColor,
              strokeWidth: 2,
              fill: "none",
            },
          },
        },
      }),
      [channelColor],
    )

    // Fallback if Victory Native is not available or chart data is empty
    if (!VictoryChart || !chartData || chartData.length === 0) {
      return (
        <View style={[$noDataContainer, { width, height }]}>
          <Text
            text={!VictoryChart ? "Victory Native not loaded" : "No data available"}
            style={$noDataText}
          />
          {!isStreaming && !VictoryChart && (
            <Text text="Using fallback chart rendering" style={$noDataSubtext} />
          )}
          {!isStreaming && VictoryChart && (
            <Text text="Start streaming to see real-time data" style={$noDataSubtext} />
          )}
        </View>
      )
    }

    return (
      <View style={[$chartContainer, { backgroundColor: channelColorLight + "20" }]}>
        <VictoryChart
          width={width}
          height={height}
          padding={{ left: 50, top: 20, right: 20, bottom: 50 }}
          domain={{ 
            y: yDomain as [number, number],
            x: chartData.length > 0 ? [chartData[0].x, chartData[chartData.length - 1].x] : [0, 50]
          }}
          animate={false} // Disable animations for better performance
        >
          {/* Y-axis */}
          <VictoryAxis
            dependentAxis
            tickValues={yTicks}
            tickCount={yTicks ? undefined : 5}
            tickFormat={(t: number) => {
              if (yTicks) {
                // For normalized data, show one decimal place
                return `${isFinite(t) ? t.toFixed(1) : "0.0"}`
              }
              return `${isFinite(t) ? t.toFixed(0) : "0"}`
            }}
            style={{
              axis: { stroke: colors.palette.neutral300, strokeWidth: 1 },
              grid: { stroke: colors.palette.neutral200, strokeDasharray: "2,2" },
              tickLabels: {
                fontSize: 9,
                fill: colors.palette.neutral400,
              },
            }}
          />

          {/* X-axis */}
          <VictoryAxis
            tickCount={5}
            tickFormat={(x) => `${Math.round(x / 1000)}`}
            style={{
              axis: { stroke: colors.palette.neutral300, strokeWidth: 1 },
              grid: { stroke: "transparent" },
              tickLabels: { 
                fontSize: 9,
                fill: colors.palette.neutral400,
              },
            }}
          />

          {/* Main data line */}
          <VictoryLine
            data={chartData}
            style={{
              data: {
                stroke: channelColor,
                strokeWidth: 2,
                fill: "none",
              },
            }}
            animate={false}
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
  },
  (prevProps, nextProps) => {
    // Optimized comparison for performance
    // Skip rerender if channel not expanded and basic props same
    if (prevProps.channelIndex !== nextProps.channelIndex) return false
    if (prevProps.isStreaming !== nextProps.isStreaming) return false

    // If data is empty for both, skip rerender
    const prevEmpty = !prevProps.data || prevProps.data.length === 0
    const nextEmpty = !nextProps.data || nextProps.data.length === 0
    if (prevEmpty && nextEmpty) return true

    // If one has data and other doesn't, rerender
    if (prevEmpty !== nextEmpty) return false

    // For data updates, check if last value changed (sufficient for real-time)
    if (prevProps.data?.length > 0 && nextProps.data?.length > 0) {
      const prevLastValue = prevProps.data[prevProps.data.length - 1]?.y
      const nextLastValue = nextProps.data[nextProps.data.length - 1]?.y
      return prevLastValue === nextLastValue // Only skip if last value unchanged
    }

    return false // Rerender by default for safety
  },
)

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
