import { observer } from "mobx-react-lite"
import React, { FC, useState, useEffect, useRef } from "react"
import {
  ViewStyle,
  TextStyle,
  ScrollView,
  View,
  Dimensions,
  Animated,
  TouchableOpacity,
  RefreshControl,
} from "react-native"
import { Screen, Text, Card, Button, Icon } from "@/components"
import { spacing, colors } from "@/theme"
import { useStores } from "@/models"
import { LineChart } from "react-native-gifted-charts"
import { DemoTabScreenProps } from "@/navigators/DemoNavigator"

const { width: screenWidth } = Dimensions.get("window")
const chartWidth = screenWidth - spacing.lg * 2 - spacing.md * 2

interface ChannelCardProps {
  channelIndex: number
  isExpanded: boolean
  onToggle: () => void
  chartData: any[]
  currentValue: number
  stats: {
    min: number
    max: number
    avg: number
    rms: number
  }
  isStreaming: boolean
}

const ChannelCard: FC<ChannelCardProps> = ({
  channelIndex,
  isExpanded,
  onToggle,
  chartData,
  currentValue,
  stats,
  isStreaming,
}) => {
  const heightAnimation = useRef(new Animated.Value(isExpanded ? 1 : 0)).current
  const pulseAnimation = useRef(new Animated.Value(1)).current
  const dotOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.timing(heightAnimation, {
      toValue: isExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start()
  }, [isExpanded])

  useEffect(() => {
    if (isStreaming) {
      // Pulse animation for real-time indicator
      const pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      )

      // Blinking dot animation
      const dotLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(dotOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(dotOpacity, {
            toValue: 0.3,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
      )

      pulseLoop.start()
      dotLoop.start()

      return () => {
        pulseLoop.stop()
        dotLoop.stop()
      }
    } else {
      pulseAnimation.setValue(1)
      dotOpacity.setValue(0.3)
    }
  }, [isStreaming])

  const channelColor = [
    colors.palette.primary500,
    colors.palette.secondary500,
    colors.palette.accent500,
    colors.palette.success500,
    colors.palette.angry500,
    "#FF6B6B",
    "#4ECDC4",
    "#45B7D1",
    "#96CEB4",
    "#FECA57",
  ][channelIndex % 10]

  const channelColorLight = [
    colors.palette.primary200,
    colors.palette.secondary200,
    colors.palette.accent200,
    colors.palette.success200,
    colors.palette.angry200,
    "#FFE5E5",
    "#E5F9F8",
    "#E5F4FF",
    "#F0F8F0",
    "#FFF5E5",
  ][channelIndex % 10]

  return (
    <Card preset="default" style={[$channelCard, { borderLeftColor: channelColor }]}>
      <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
        <View style={$channelHeader}>
          <View style={$channelTitleSection}>
            <View style={[$channelIcon, { backgroundColor: channelColorLight }]}>
              <Text
                text={`${channelIndex + 1}`}
                style={[$channelNumber, { color: channelColor }]}
              />
            </View>
            <View style={$channelInfo}>
              <Text text={`Channel ${channelIndex + 1}`} style={$channelTitle} />
              <Text text={`sEMG Signal`} style={$channelSubtitle} />
            </View>
          </View>

          <View style={$channelMetrics}>
            {isStreaming && (
              <View style={$realTimeIndicator}>
                <Animated.View
                  style={[
                    $realTimeDot,
                    {
                      backgroundColor: colors.palette.success500,
                      opacity: dotOpacity,
                      transform: [{ scale: pulseAnimation }],
                    },
                  ]}
                />
                <Text text="LIVE" style={$realTimeText} />
              </View>
            )}

            <Animated.View
              style={[
                $currentValueContainer,
                {
                  backgroundColor: channelColorLight,
                  transform: isStreaming ? [{ scale: pulseAnimation }] : [],
                },
              ]}
            >
              <Text
                text={currentValue.toFixed(2)}
                style={[$currentValue, { color: channelColor }]}
              />
              <Text text="μV" style={[$currentUnit, { color: channelColor }]} />
            </Animated.View>

            <Icon
              icon={isExpanded ? "caretUp" : "caretDown"}
              color={colors.palette.neutral400}
              size={16}
            />
          </View>
        </View>
      </TouchableOpacity>

      <Animated.View
        style={[
          $expandableContent,
          {
            maxHeight: heightAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 400], // Adjust based on content height
            }),
            opacity: heightAnimation,
          },
        ]}
      >
        {isExpanded && (
          <View style={$chartSection}>
            {/* Statistics Row */}
            <View style={$statsRow}>
              <View style={$statItem}>
                <Text text="Min" style={$statLabel} />
                <Text text={stats.min.toFixed(1)} style={[$statValue, { color: channelColor }]} />
              </View>
              <View style={$statItem}>
                <Text text="Max" style={$statLabel} />
                <Text text={stats.max.toFixed(1)} style={[$statValue, { color: channelColor }]} />
              </View>
              <View style={$statItem}>
                <Text text="Avg" style={$statLabel} />
                <Text text={stats.avg.toFixed(1)} style={[$statValue, { color: channelColor }]} />
              </View>
              <View style={$statItem}>
                <Text text="RMS" style={$statLabel} />
                <Text text={stats.rms.toFixed(1)} style={[$statValue, { color: channelColor }]} />
              </View>
            </View>

            {/* Chart */}
            <View style={[$chartContainer, { backgroundColor: channelColorLight + "20" }]}>
              {chartData.length > 0 ? (
                <LineChart
                  data={chartData}
                  width={chartWidth}
                  height={180}
                  spacing={chartWidth / Math.max(chartData.length - 1, 1)}
                  color={channelColor}
                  thickness={2}
                  startFillColor={channelColorLight}
                  endFillColor={channelColorLight + "40"}
                  startOpacity={0.6}
                  endOpacity={0.1}
                  initialSpacing={0}
                  noOfSections={4}
                  yAxisColor={colors.palette.neutral300}
                  xAxisColor={colors.palette.neutral300}
                  yAxisTextStyle={{ color: colors.palette.neutral400, fontSize: 10 }}
                  hideDataPoints={true}
                  curved={false} // Better for sEMG signals
                  isAnimated={isStreaming}
                  animationDuration={100} // Fast for real-time feel
                  scrollToEnd={isStreaming}
                  hideRules={false}
                  rulesColor={colors.palette.neutral200}
                  rulesType="dashed"
                  showVerticalLines={false}
                  hideYAxisText={false}
                  hideXAxisText={true}
                  yAxisOffset={Math.abs(stats.min) + 10}
                  maxValue={Math.max(stats.max + 10, 100)}
                  minValue={Math.min(stats.min - 10, -100)}
                />
              ) : (
                <View style={$noDataContainer}>
                  <Text text="No data available" style={$noDataText} />
                  {!isStreaming && (
                    <Text text="Start streaming to see real-time data" style={$noDataSubtext} />
                  )}
                </View>
              )}

              {/* Real-time overlay effect */}
              {isStreaming && chartData.length > 0 && (
                <View style={$realtimeOverlay}>
                  <View style={[$realtimeLine, { backgroundColor: channelColor }]} />
                </View>
              )}
            </View>

            {/* Channel Controls */}
            <View style={$channelControls}>
              <Button
                text="Calibrate"
                preset="default"
                style={$controlButton}
                textStyle={{ fontSize: 12 }}
                onPress={() => {
                  // Implement calibration logic
                  console.log(`Calibrating channel ${channelIndex + 1}`)
                }}
              />
              <Button
                text="Reset"
                preset="default"
                style={$controlButton}
                textStyle={{ fontSize: 12 }}
                onPress={() => {
                  // Implement reset logic
                  console.log(`Resetting channel ${channelIndex + 1}`)
                }}
              />
            </View>
          </View>
        )}
      </Animated.View>
    </Card>
  )
}

export const SEMGRealtimeScreen: FC<DemoTabScreenProps<"SEMGRealtimeScreen">> = observer(
  function SEMGRealtimeScreen() {
    const { bluetoothStore } = useStores()

    // Debug logging
    console.log("=== SEMGRealtimeScreen Debug ===")
    console.log("bluetoothStore:", !!bluetoothStore)
    console.log("getLatestSamples available:", typeof bluetoothStore?.getLatestSamples)
    console.log("getChannelStatistics available:", typeof bluetoothStore?.getChannelStatistics)

    const [expandedChannels, setExpandedChannels] = useState<Set<number>>(new Set([0])) // First channel expanded by default
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [autoScroll, setAutoScroll] = useState(true)
    const [debugInfo, setDebugInfo] = useState<string>("")

    const scrollViewRef = useRef<ScrollView>(null)

    // Safely get connection status
    const connectionStatus = bluetoothStore?.connectionStatus || {
      enabled: false,
      connected: false,
      connecting: false,
      streaming: false,
      sending: false,
      device: null,
      message: "No Bluetooth store available",
      packetCount: 0,
      buffer1kHzCount: 0,
      buffer100HzCount: 0,
      samplesPerSecond: 0,
      bufferStats: { realTime: 0 },
    }

    // Safely get channel statistics
    const getChannelStatistics = () => {
      try {
        if (bluetoothStore && typeof bluetoothStore.getChannelStatistics === "function") {
          const stats = bluetoothStore.getChannelStatistics()
          console.log("Channel statistics:", stats)
          return stats
        } else {
          console.warn("getChannelStatistics not available or not a function")
          // Return default stats for all channels
          const defaultStats = {}
          for (let i = 0; i < 10; i++) {
            defaultStats[`ch${i}`] = { min: 0, max: 0, avg: 0, rms: 0 }
          }
          return defaultStats
        }
      } catch (error) {
        console.error("Error getting channel statistics:", error)
        // Return default stats for all channels
        const defaultStats = {}
        for (let i = 0; i < 10; i++) {
          defaultStats[`ch${i}`] = { min: 0, max: 0, avg: 0, rms: 0 }
        }
        return defaultStats
      }
    }

    const channelStats = getChannelStatistics()
    const isStreaming = connectionStatus.streaming

    // Debug effect to monitor data flow
    useEffect(() => {
      if (bluetoothStore) {
        const latestSamples = bluetoothStore.getLatestSamples
          ? bluetoothStore.getLatestSamples(5, "1kHz")
          : []
        const debugText = `
Connected: ${connectionStatus.connected}
Streaming: ${connectionStatus.streaming}
Packet Count: ${connectionStatus.packetCount}
Buffer 1kHz: ${connectionStatus.buffer1kHzCount}
Latest Samples: ${latestSamples.length}
Sample Data: ${latestSamples.length > 0 ? JSON.stringify(latestSamples[0].values.slice(0, 3)) : "No data"}
        `.trim()
        setDebugInfo(debugText)
        console.log("Debug Info:", debugText)
      }
    }, [connectionStatus, bluetoothStore])

    // Auto-scroll to expanded channels when streaming
    useEffect(() => {
      if (isStreaming && autoScroll && expandedChannels.size > 0) {
        const firstExpanded = Math.min(...Array.from(expandedChannels))
        const scrollTimeout = setTimeout(() => {
          scrollViewRef.current?.scrollTo({
            y: firstExpanded * 120, // Approximate card height
            animated: true,
          })
        }, 500)

        return () => clearTimeout(scrollTimeout)
      }
    }, [isStreaming, expandedChannels, autoScroll])

    const toggleChannel = (channelIndex: number) => {
      setExpandedChannels((prev) => {
        const newSet = new Set(prev)
        if (newSet.has(channelIndex)) {
          newSet.delete(channelIndex)
        } else {
          newSet.add(channelIndex)
        }
        return newSet
      })
    }

    const expandAll = () => {
      setExpandedChannels(new Set(Array.from({ length: 10 }, (_, i) => i)))
    }

    const collapseAll = () => {
      setExpandedChannels(new Set())
    }

    const onRefresh = async () => {
      setIsRefreshing(true)
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setIsRefreshing(false)
    }

    // Generate channel data for all 10 channels
    const getChannelData = (channelIndex: number) => {
      try {
        if (!bluetoothStore || typeof bluetoothStore.getLatestSamples !== "function") {
          console.warn("getLatestSamples not available")
          return []
        }

        const samples = bluetoothStore.getLatestSamples(50, "1kHz") // Last 50 samples for better performance
        console.log(`Channel ${channelIndex} - Samples available:`, samples.length)

        if (samples.length === 0) {
          return []
        }

        const chartData = samples.reverse().map((sample, index) => ({
          value: sample.values[channelIndex] || 0,
          label: "",
        }))

        console.log(`Channel ${channelIndex} - Chart data points:`, chartData.length)
        if (chartData.length > 0) {
          console.log(
            `Channel ${channelIndex} - First value:`,
            chartData[0].value,
            "Last value:",
            chartData[chartData.length - 1].value,
          )
        }

        return chartData
      } catch (error) {
        console.error(`Error getting channel ${channelIndex} data:`, error)
        return []
      }
    }

    const getCurrentValue = (channelIndex: number) => {
      try {
        if (!bluetoothStore || typeof bluetoothStore.getLatestSamples !== "function") {
          return 0
        }

        const latest = bluetoothStore.getLatestSamples(1, "1kHz")
        const value = latest.length > 0 ? latest[0].values[channelIndex] || 0 : 0
        return value
      } catch (error) {
        console.error(`Error getting current value for channel ${channelIndex}:`, error)
        return 0
      }
    }

    // If bluetoothStore is not available, show error state
    if (!bluetoothStore) {
      return (
        <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$screenContainer}>
          <View style={$errorContainer}>
            <Text text="Bluetooth Store Not Available" style={$errorTitle} />
            <Text text="The Bluetooth store is not properly initialized." style={$errorMessage} />
          </View>
        </Screen>
      )
    }

    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$screenContainer}>
        <ScrollView
          ref={scrollViewRef}
          style={$scrollView}
          contentContainerStyle={$contentContainer}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <Text preset="heading" text="sEMG Real-time Monitor" style={$title} />

          {/* Debug Information Card */}
          {__DEV__ && (
            <Card preset="default" style={$debugCard}>
              <Text text="Debug Information" style={$debugTitle} />
              <Text text={debugInfo} style={$debugText} />
            </Card>
          )}

          {/* Connection Status & Controls */}
          <Card preset="default" style={$controlCard}>
            <View style={$controlHeader}>
              <View style={$connectionStatus}>
                <View
                  style={[
                    $connectionDot,
                    {
                      backgroundColor: connectionStatus.connected
                        ? colors.palette.success500
                        : colors.palette.angry500,
                    },
                  ]}
                />
                <Text
                  text={connectionStatus.connected ? "Connected" : "Disconnected"}
                  style={$connectionText}
                />
                {isStreaming && (
                  <View style={$streamingBadge}>
                    <Text text={`${connectionStatus.samplesPerSecond} Hz`} style={$streamingText} />
                  </View>
                )}
              </View>

              <View style={$globalControls}>
                <Button
                  text="Expand All"
                  preset="default"
                  onPress={expandAll}
                  style={$globalButton}
                  textStyle={{ fontSize: 12 }}
                />
                <Button
                  text="Collapse All"
                  preset="default"
                  onPress={collapseAll}
                  style={$globalButton}
                  textStyle={{ fontSize: 12 }}
                />
              </View>
            </View>

            <View style={$systemStats}>
              <View style={$systemStatItem}>
                <Text text="Buffer" style={$systemStatLabel} />
                <Text
                  text={`${connectionStatus.bufferStats?.realTime || 0}`}
                  style={$systemStatValue}
                />
              </View>
              <View style={$systemStatItem}>
                <Text text="Packets" style={$systemStatLabel} />
                <Text text={connectionStatus.packetCount.toString()} style={$systemStatValue} />
              </View>
              <View style={$systemStatItem}>
                <Text text="Channels" style={$systemStatLabel} />
                <Text text={`${expandedChannels.size}/10`} style={$systemStatValue} />
              </View>
            </View>
          </Card>

          {/* Show message if not streaming */}
          {!isStreaming && (
            <Card preset="default" style={$messageCard}>
              <Text
                text="📡 Start streaming from the Bluetooth screen to see real-time data"
                style={$messageText}
              />
            </Card>
          )}

          {/* Channel Cards */}
          {Array.from({ length: 10 }, (_, channelIndex) => {
            const chartData = getChannelData(channelIndex)
            const currentValue = getCurrentValue(channelIndex)
            const stats = channelStats[`ch${channelIndex}`] || { min: 0, max: 0, avg: 0, rms: 0 }

            return (
              <ChannelCard
                key={channelIndex}
                channelIndex={channelIndex}
                isExpanded={expandedChannels.has(channelIndex)}
                onToggle={() => toggleChannel(channelIndex)}
                chartData={chartData}
                currentValue={currentValue}
                stats={stats}
                isStreaming={isStreaming}
              />
            )
          })}

          {/* Quick Actions */}
          <Card preset="default" style={$quickActionsCard}>
            <Text preset="subheading" text="Quick Actions" style={$quickActionsTitle} />
            <View style={$quickActionsGrid}>
              <Button
                text="🎯 Auto Scroll"
                preset={autoScroll ? "filled" : "default"}
                onPress={() => setAutoScroll(!autoScroll)}
                style={$quickActionButton}
                textStyle={{ fontSize: 12 }}
              />
              <Button
                text="📊 Statistics"
                preset="default"
                onPress={() => {
                  // Navigate to statistics screen
                  console.log("Navigate to statistics")
                }}
                style={$quickActionButton}
                textStyle={{ fontSize: 12 }}
              />
              <Button
                text="📈 Historical"
                preset="default"
                onPress={() => {
                  // Navigate to historical data screen
                  console.log("Navigate to historical data")
                }}
                style={$quickActionButton}
                textStyle={{ fontSize: 12 }}
              />
              <Button
                text="⚙️ Settings"
                preset="default"
                onPress={() => {
                  // Navigate to settings
                  console.log("Navigate to settings")
                }}
                style={$quickActionButton}
                textStyle={{ fontSize: 12 }}
              />
            </View>
          </Card>
        </ScrollView>
      </Screen>
    )
  },
)

// Styles
const $screenContainer: ViewStyle = {
  flex: 1,
}

const $scrollView: ViewStyle = {
  flex: 1,
}

const $contentContainer: ViewStyle = {
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
}

const $title: TextStyle = {
  marginBottom: spacing.lg,
  textAlign: "center",
  color: colors.palette.primary500,
}

const $errorContainer: ViewStyle = {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  padding: spacing.lg,
}

const $errorTitle: TextStyle = {
  fontSize: 20,
  fontWeight: "bold",
  color: colors.palette.angry500,
  marginBottom: spacing.md,
}

const $errorMessage: TextStyle = {
  textAlign: "center",
  color: colors.palette.neutral600,
}

const $debugCard: ViewStyle = {
  marginBottom: spacing.md,
  backgroundColor: colors.palette.neutral100,
}

const $debugTitle: TextStyle = {
  fontSize: 14,
  fontWeight: "bold",
  marginBottom: spacing.xs,
  color: colors.palette.primary500,
}

const $debugText: TextStyle = {
  fontSize: 10,
  fontFamily: "monospace",
  color: colors.palette.neutral600,
}

const $messageCard: ViewStyle = {
  marginBottom: spacing.md,
  backgroundColor: colors.palette.primary100,
}

const $messageText: TextStyle = {
  textAlign: "center",
  color: colors.palette.primary600,
  fontSize: 14,
}

const $controlCard: ViewStyle = {
  marginBottom: spacing.md,
  backgroundColor: colors.palette.neutral100,
}

const $controlHeader: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: spacing.md,
}

const $connectionStatus: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
}

const $connectionDot: ViewStyle = {
  width: 8,
  height: 8,
  borderRadius: 4,
  marginRight: spacing.xs,
}

const $connectionText: TextStyle = {
  fontSize: 14,
  fontWeight: "500",
  marginRight: spacing.sm,
}

const $streamingBadge: ViewStyle = {
  backgroundColor: colors.palette.success500,
  paddingHorizontal: spacing.xs,
  paddingVertical: 2,
  borderRadius: 8,
}

const $streamingText: TextStyle = {
  color: colors.background,
  fontSize: 10,
  fontWeight: "bold",
}

const $globalControls: ViewStyle = {
  flexDirection: "row",
  gap: spacing.xs,
}

const $globalButton: ViewStyle = {
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
}

const $systemStats: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-around",
  paddingTop: spacing.sm,
  borderTopWidth: 1,
  borderTopColor: colors.palette.neutral200,
}

const $systemStatItem: ViewStyle = {
  alignItems: "center",
}

const $systemStatLabel: TextStyle = {
  fontSize: 12,
  color: colors.palette.neutral400,
}

const $systemStatValue: TextStyle = {
  fontSize: 16,
  fontWeight: "bold",
  color: colors.palette.primary500,
}

const $channelCard: ViewStyle = {
  marginBottom: spacing.md,
  borderLeftWidth: 4,
  overflow: "hidden",
}

const $channelHeader: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: spacing.sm,
}

const $channelTitleSection: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  flex: 1,
}

const $channelIcon: ViewStyle = {
  width: 32,
  height: 32,
  borderRadius: 16,
  alignItems: "center",
  justifyContent: "center",
  marginRight: spacing.sm,
}

const $channelNumber: TextStyle = {
  fontSize: 14,
  fontWeight: "bold",
}

const $channelInfo: ViewStyle = {
  flex: 1,
}

const $channelTitle: TextStyle = {
  fontSize: 16,
  fontWeight: "600",
  color: colors.text,
}

const $channelSubtitle: TextStyle = {
  fontSize: 12,
  color: colors.palette.neutral400,
}

const $channelMetrics: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
}

const $realTimeIndicator: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
}

const $realTimeDot: ViewStyle = {
  width: 6,
  height: 6,
  borderRadius: 3,
  marginRight: spacing.xs,
}

const $realTimeText: TextStyle = {
  fontSize: 9,
  fontWeight: "bold",
  color: colors.palette.success500,
  marginRight: spacing.sm,
}

const $currentValueContainer: ViewStyle = {
  flexDirection: "row",
  alignItems: "baseline",
  paddingHorizontal: spacing.xs,
  paddingVertical: 2,
  borderRadius: 6,
}

const $currentValue: TextStyle = {
  fontSize: 16,
  fontWeight: "bold",
}

const $currentUnit: TextStyle = {
  fontSize: 10,
  marginLeft: 2,
}

const $expandableContent: ViewStyle = {
  overflow: "hidden",
}

const $chartSection: ViewStyle = {
  paddingTop: spacing.sm,
  borderTopWidth: 1,
  borderTopColor: colors.palette.neutral200,
}

const $statsRow: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-around",
  marginBottom: spacing.md,
  paddingVertical: spacing.sm,
  backgroundColor: colors.palette.neutral50,
  borderRadius: 8,
}

const $statItem: ViewStyle = {
  alignItems: "center",
}

const $statLabel: TextStyle = {
  fontSize: 10,
  color: colors.palette.neutral400,
  marginBottom: 2,
}

const $statValue: TextStyle = {
  fontSize: 14,
  fontWeight: "600",
}

const $chartContainer: ViewStyle = {
  alignItems: "center",
  borderRadius: 8,
  paddingVertical: spacing.sm,
  marginBottom: spacing.md,
  position: "relative",
}

const $noDataContainer: ViewStyle = {
  height: 180,
  justifyContent: "center",
  alignItems: "center",
}

const $noDataText: TextStyle = {
  color: colors.palette.neutral400,
  fontSize: 16,
  marginBottom: spacing.xs,
}

const $noDataSubtext: TextStyle = {
  color: colors.palette.neutral300,
  fontSize: 12,
  textAlign: "center",
}

const $realtimeOverlay: ViewStyle = {
  position: "absolute",
  right: spacing.md,
  top: 0,
  bottom: 0,
  justifyContent: "center",
}

const $realtimeLine: ViewStyle = {
  width: 2,
  height: "80%",
  opacity: 0.7,
}

const $channelControls: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-around",
  gap: spacing.sm,
}

const $controlButton: ViewStyle = {
  flex: 1,
  paddingVertical: spacing.xs,
}

const $quickActionsCard: ViewStyle = {
  marginTop: spacing.md,
}

const $quickActionsTitle: TextStyle = {
  marginBottom: spacing.md,
  textAlign: "center",
}

const $quickActionsGrid: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
}

const $quickActionButton: ViewStyle = {
  flex: 1,
  minWidth: "45%",
  paddingVertical: spacing.sm,
}
