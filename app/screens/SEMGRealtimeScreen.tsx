import { observer } from "mobx-react-lite"
import { FC, useState, useEffect, useRef, useMemo, useCallback, memo } from "react"
import {
  ViewStyle,
  TextStyle,
  ScrollView,
  View,
  Dimensions,
  Animated,
  TouchableOpacity,
} from "react-native"
import { Screen, Text, Card, Button } from "@/components"
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

const ChannelCard: FC<ChannelCardProps> = memo(function ChannelCard({
  channelIndex,
  isExpanded,
  onToggle,
  chartData,
  currentValue,
  stats,
  isStreaming,
}) {
  const heightAnimation = useRef(new Animated.Value(isExpanded ? 1 : 0)).current
  const pulseAnimation = useRef(new Animated.Value(1)).current
  const dotOpacity = useRef(new Animated.Value(0)).current

  useEffect(() => {
    // Simplified animation to prevent excessive updates
    heightAnimation.setValue(isExpanded ? 1 : 0)
    // Animated.timing(heightAnimation, {
    //   toValue: isExpanded ? 1 : 0,
    //   duration: 300,
    //   useNativeDriver: false,
    // }).start()
  }, [isExpanded, heightAnimation])

  useEffect(() => {
    // Disabled animations to prevent render loops
    if (isStreaming) {
      pulseAnimation.setValue(1.1)
      dotOpacity.setValue(1)
    } else {
      pulseAnimation.setValue(1)
      dotOpacity.setValue(0.3)
    }
    return undefined
  }, [isStreaming, pulseAnimation, dotOpacity])

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
      {/* Card Header with Channel Info */}
      <View style={$cardHeader}>
        <View style={$cardHeaderLeft}>
          <View style={[$channelIcon, { backgroundColor: channelColorLight }]}>
            <Text text={`${channelIndex + 1}`} style={[$channelNumber, { color: channelColor }]} />
          </View>
          <View style={$cardHeaderText}>
            <Text text="sEMG Signal" style={$cardHeaderSubtitle} />
            <Text
              text={isStreaming ? "LIVE" : "No Signal"}
              style={[
                $cardHeaderStatus,
                { color: isStreaming ? colors.palette.success500 : colors.palette.neutral400 },
              ]}
            />
          </View>
        </View>
        <View style={$cardHeaderRight}>
          {isStreaming && (
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
          )}
          <Text
            text={`${currentValue.toFixed(2)} μV`}
            style={[$cardHeaderValue, { color: channelColor }]}
          />
        </View>
      </View>

      {/* Simplified channel info when collapsed - minimal to prevent re-renders */}
      {!isExpanded && (
        <View style={$channelPreview}>
          <View style={$simplePlaceholder}>
            <Text
              text={isStreaming ? `📈 ${currentValue.toFixed(1)} μV` : "📈 Ready"}
              style={[
                $placeholderText,
                { color: isStreaming ? channelColor : colors.palette.neutral500 },
              ]}
            />
          </View>
        </View>
      )}

      <TouchableOpacity onPress={onToggle} activeOpacity={0.7}>
        <View style={$channelAction}>
          <Text
            text={isExpanded ? "Tap to collapse" : "Tap to expand for chart"}
            style={$channelInstruction}
          />
        </View>
      </TouchableOpacity>

      <Animated.View
        style={[
          $expandableContent,
          {
            maxHeight: heightAnimation.interpolate({
              inputRange: [0, 1],
              outputRange: [0, 900],
            }),
            opacity: heightAnimation,
          },
        ]}
      >
        {isExpanded && (
          <View style={$chartSection}>
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

            <View style={[$chartContainer, { backgroundColor: channelColorLight + "20" }]}>
              {chartData.length > 0 ? (
                <View style={$chartWrapper}>
                  <LineChart
                    data={chartData}
                    width={chartWidth - 20}
                    height={450}
                    spacing={(chartWidth - 20) / Math.max(chartData.length - 1, 1)}
                    color={channelColor}
                    thickness={2}
                    startFillColor={channelColorLight}
                    endFillColor={channelColorLight + "40"}
                    startOpacity={0.6}
                    endOpacity={0.1}
                    initialSpacing={10}
                    noOfSections={6}
                    yAxisColor={colors.palette.neutral300}
                    xAxisColor={colors.palette.neutral300}
                    yAxisTextStyle={{ color: colors.palette.neutral400, fontSize: 10 }}
                    hideDataPoints={true}
                    curved={false}
                    isAnimated={false}
                    animationDuration={0}
                    scrollToEnd={false}
                    hideRules={false}
                    rulesColor={colors.palette.neutral200}
                    rulesType="dashed"
                    showVerticalLines={false}
                    hideYAxisText={true}
                    hideAxesAndRules={false}
                    hideYAxis={true}
                    yAxisOffset={0}
                    yAxisLabelWidth={0}
                    xAxisLabelTextStyle={{ color: colors.palette.neutral400, fontSize: 9 }}
                    rotateLabel={false}
                    xAxisThickness={1}
                    yAxisThickness={1}
                    stepValue={50}
                    endSpacing={30}
                    maxValue={Math.max(Math.abs(stats.max), Math.abs(stats.min), 100) + 50}
                    mostNegativeValue={
                      -Math.max(Math.abs(stats.max), Math.abs(stats.min), 100) - 50
                    }
                  />
                </View>
              ) : (
                <View style={$noDataContainer}>
                  <Text text="No data available" style={$noDataText} />
                  {!isStreaming && (
                    <Text text="Start streaming to see real-time data" style={$noDataSubtext} />
                  )}
                </View>
              )}

              {isStreaming && chartData.length > 0 && (
                <View style={$realtimeOverlay}>
                  <View style={[$realtimeLine, { backgroundColor: channelColor }]} />
                </View>
              )}
            </View>

            <View style={$channelControls}>
              <Button
                text="Calibrate"
                preset="default"
                style={$controlButton}
                textStyle={{ fontSize: 12 }}
                onPress={() => {
                  console.log(`Calibrating channel ${channelIndex + 1}`)
                }}
              />
              <Button
                text="Reset"
                preset="default"
                style={$controlButton}
                textStyle={{ fontSize: 12 }}
                onPress={() => {
                  console.log(`Resetting channel ${channelIndex + 1}`)
                }}
              />
            </View>
          </View>
        )}
      </Animated.View>
    </Card>
  )
})

export const SEMGRealtimeScreen: FC<DemoTabScreenProps<"SEMGRealtimeScreen">> = observer(
  function SEMGRealtimeScreen() {
    const { bluetoothStore } = useStores()
    const [expandedChannel, setExpandedChannel] = useState<number | null>(null) // Only one channel can be expanded
    const [autoScroll, setAutoScroll] = useState(true)

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

    // Extract streaming status for easier access - memoized to prevent excessive updates
    const isStreaming = useMemo(() => connectionStatus.streaming, [connectionStatus.streaming])

    // Access reactive buffer triggers to ensure this component updates when data changes
    const buffer1kHzUpdateCount = bluetoothStore?.buffer1kHzUpdateCount || 0

    // Debug log to see if reactive triggers are working (disabled to prevent spam)
    // if (__DEV__ && buffer1kHzUpdateCount > 0) {
    //   console.log(
    //     `SEMGRealtimeScreen: buffer1kHzUpdateCount = ${buffer1kHzUpdateCount}, lastDataTimestamp = ${lastDataTimestamp}`,
    //   )
    // }

    // Memoize channel statistics to prevent infinite loops
    const channelStats = useMemo(() => {
      try {
        if (bluetoothStore && typeof bluetoothStore.getChannelStatistics === "function") {
          return bluetoothStore.getChannelStatistics()
        } else {
          const defaultStats: Record<
            string,
            { min: number; max: number; avg: number; rms: number }
          > = {}
          for (let i = 0; i < 10; i++) {
            defaultStats[`ch${i}`] = { min: 0, max: 0, avg: 0, rms: 0 }
          }
          return defaultStats
        }
      } catch (error) {
        console.error("Error getting channel statistics:", error)
        const defaultStats: Record<string, { min: number; max: number; avg: number; rms: number }> =
          {}
        for (let i = 0; i < 10; i++) {
          defaultStats[`ch${i}`] = { min: 0, max: 0, avg: 0, rms: 0 }
        }
        return defaultStats
      }
    }, [bluetoothStore]) // Removed buffer1kHzUpdateCount to prevent infinite loops

    useEffect(() => {
      if (autoScroll && expandedChannel !== null) {
        const scrollTimeout = setTimeout(() => {
          // Scroll logic removed to prevent interference with rendering
          console.log(`Would scroll to channel ${expandedChannel}`)
        }, 500)

        return () => clearTimeout(scrollTimeout)
      }
      return undefined
    }, [autoScroll, expandedChannel])

    const toggleChannel = (channelIndex: number) => {
      // Only one channel can be expanded at a time
      setExpandedChannel(expandedChannel === channelIndex ? null : channelIndex)
    }

    const expandChannel = (channelIndex: number) => {
      setExpandedChannel(channelIndex)
    }

    const collapseAll = () => {
      setExpandedChannel(null)
    }

    // Memoize channel data fetching to prevent infinite loops
    const getChannelData = useCallback(
      (channelIndex: number) => {
        try {
          if (!bluetoothStore || typeof bluetoothStore.getLatestSamples !== "function") {
            return []
          }

          const samples = bluetoothStore.getLatestSamples(50, "1kHz")

          if (samples.length === 0) {
            return []
          }

          return samples.reverse().map((sample) => ({
            value: sample.values[channelIndex] || 0,
            label: "",
          }))
        } catch (error) {
          console.error(`Error getting channel ${channelIndex} data:`, error)
          return []
        }
      },
      [bluetoothStore],
    ) // Removed buffer1kHzUpdateCount to prevent infinite loops

    const getCurrentValue = useCallback(
      (channelIndex: number) => {
        try {
          if (!bluetoothStore || typeof bluetoothStore.getLatestSamples !== "function") {
            return 0
          }

          const latest = bluetoothStore.getLatestSamples(1, "1kHz")
          return latest.length > 0 ? latest[0].values[channelIndex] || 0 : 0
        } catch (error) {
          console.error(`Error getting current value for channel ${channelIndex}:`, error)
          return 0
        }
      },
      [bluetoothStore],
    ) // Removed buffer1kHzUpdateCount to prevent infinite loops

    if (!bluetoothStore) {
      return (
        <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$screenContainer}>
          <ScrollView contentContainerStyle={$contentContainer}>
            <Text preset="heading" text="sEMG Real-time Monitor" style={$title} />
            <Card preset="default" style={$errorCard}>
              <View style={$emptyStateContainer}>
                <Text text="⚠️" style={$emptyStateIcon} />
                <Text text="Bluetooth Store Not Available" style={$emptyStateTitle} />
                <Text
                  text="The Bluetooth store is not properly initialized. Please restart the application."
                  style={$emptyStateMessage}
                />
              </View>
            </Card>
          </ScrollView>
        </Screen>
      )
    }

    return (
      <Screen
        preset="scroll"
        safeAreaEdges={["top"]}
        contentContainerStyle={$contentContainer}
        ScrollViewProps={{
          showsVerticalScrollIndicator: false,
          nestedScrollEnabled: true,
        }}
      >
        {/* Main Title */}
        <Text preset="heading" text="sEMG Real-time Monitor" style={$title} />

        {/* Status Section */}
        <View style={$section}>
          <Text preset="subheading" text="Connection Status" style={$sectionTitle} />
          <Card preset="default" style={$statusCard}>
            <View style={$statusHeader}>
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
            </View>

            <View style={$systemStats}>
              <View style={$systemStatItem}>
                <Text text="Packets" style={$systemStatLabel} />
                <Text text={connectionStatus.packetCount.toString()} style={$systemStatValue} />
              </View>
              <View style={$systemStatItem}>
                <Text text="Buffer" style={$systemStatLabel} />
                <Text text={connectionStatus.buffer1kHzCount.toString()} style={$systemStatValue} />
              </View>
              <View style={$systemStatItem}>
                <Text text="Status" style={$systemStatLabel} />
                <Text
                  text={isStreaming ? "Streaming" : connectionStatus.connected ? "Ready" : "Offline"}
                  style={$systemStatValue}
                />
              </View>
            </View>
          </Card>
        </View>

        {/* Channels Section - Always show all 10 channels */}
        <View style={$section}>
          <View style={$channelsHeader}>
            <Text
              preset="subheading"
              text={`sEMG Channels ${isStreaming ? "(Live)" : connectionStatus.connected ? "(Ready)" : "(Preview)"}`}
              style={$sectionTitle}
            />
            {!connectionStatus.connected && (
              <Text
                text="Connect your device to see live data in these channels"
                style={$channelsSubtitle}
              />
            )}
            {connectionStatus.connected && !isStreaming && (
              <Text text="Start streaming to see real-time signals" style={$channelsSubtitle} />
            )}

            {/* Debug channel info */}
            <Text
              text={`Debug: Rendering ${10} channel cards. Stats available: ${Object.keys(channelStats).length}`}
              style={$debugText}
            />
          </View>
          {Array.from({ length: 10 }, (_, channelIndex) => {
            // Only load data for expanded channel to prevent infinite loops
            const isThisChannelExpanded = expandedChannel === channelIndex
            const chartData = isThisChannelExpanded ? getChannelData(channelIndex) : []
            // Get current value for display (even in collapsed state)
            const currentValue = getCurrentValue(channelIndex)
            const stats = isThisChannelExpanded
              ? channelStats[`ch${channelIndex}`] || {
                  min: 0,
                  max: 0,
                  avg: 0,
                  rms: 0,
                }
              : { min: 0, max: 0, avg: 0, rms: 0 }

            // Debug log for the first channel only (disabled to prevent spam)
            // if (__DEV__ && channelIndex === 0) {
            //   console.log(
            //     `SEMGRealtimeScreen: Channel ${channelIndex} - chartData.length: ${chartData.length}, currentValue: ${currentValue}, buffer1kHzUpdateCount: ${bluetoothStore?.buffer1kHzUpdateCount || "N/A"}`,
            //   )
            // }

            return (
              <ChannelCard
                key={channelIndex}
                channelIndex={channelIndex}
                isExpanded={expandedChannel === channelIndex}
                onToggle={() => toggleChannel(channelIndex)}
                chartData={chartData}
                currentValue={currentValue}
                stats={stats}
                isStreaming={isStreaming}
              />
            )
          })}
        </View>

        {/* Debug Section - Only in development */}
        {__DEV__ && (
          <View style={$section}>
            <Text preset="subheading" text="Debug Info" style={$sectionTitle} />
            <Card preset="default" style={$debugCard}>
              <Text text="Debug Information" style={$debugTitle} />
              <Text
                text={`Connected: ${connectionStatus.connected} | Streaming: ${connectionStatus.streaming} | Packets: ${connectionStatus.packetCount} | Buffer: ${connectionStatus.buffer1kHzCount} | Updates: ${buffer1kHzUpdateCount}`}
                style={$debugText}
              />
            </Card>
          </View>
        )}

        {/* Mock Testing Controls - Always show for debugging */}
        <View style={$section}>
          <Text preset="subheading" text="🔧 Mock Testing (Debug)" style={$sectionTitle} />
          <Card preset="default" style={$statusCard}>
            <Text text="Debug Mock Testing Section" style={$sectionTitle} />

            {/* Debug info */}
            <Text text={`__DEV__: ${__DEV__}`} style={$debugText} />
            <Text text={`Connected: ${connectionStatus.connected}`} style={$debugText} />
            <Text text={`Streaming: ${isStreaming}`} style={$debugText} />
            <Text
              text={`Mock functions: ${typeof bluetoothStore?.connectToMockDevice}`}
              style={$debugText}
            />

            {/* Emergency Stop Button */}
            <Button
              text="🚨 EMERGENCY STOP"
              preset="default"
              onPress={() => {
                console.log("=== EMERGENCY STOP ===")
                bluetoothStore?.stopMockStreaming()
                bluetoothStore?.disconnectMockDevice()
              }}
              style={$quickActionButton}
            />

            {/* Simple test button */}
            <Button
              text="🔴 Test Button (100Hz)"
              preset="filled"
              onPress={() => {
                console.log("=== TEST BUTTON PRESSED ===")
                console.log("bluetoothStore exists:", !!bluetoothStore)
                console.log(
                  "connectToMockDevice exists:",
                  typeof bluetoothStore?.connectToMockDevice,
                )
                console.log("startMockStreaming exists:", typeof bluetoothStore?.startMockStreaming)
                console.log("Current connection state:", connectionStatus.connected)
                console.log("Current streaming state:", isStreaming)

                if (bluetoothStore?.connectToMockDevice) {
                  console.log("Calling connectToMockDevice...")
                  bluetoothStore.connectToMockDevice()

                  // Wait a bit then check if we can start streaming
                  setTimeout(() => {
                    console.log("After connect - connected:", bluetoothStore.connected)
                    if (bluetoothStore.startMockStreaming) {
                      console.log("Calling startMockStreaming at 100Hz...")
                      bluetoothStore.startMockStreaming()
                    } else {
                      console.log("startMockStreaming not available")
                    }
                  }, 100)
                } else {
                  console.log("Mock functions not available - may need app restart")
                }
              }}
              style={$quickActionButton}
            />

            {/* Direct Mock Controls */}
            <View style={$quickActionsGrid}>
              {!connectionStatus.connected ? (
                <Button
                  text="📱 Connect Mock"
                  preset="filled"
                  onPress={() => {
                    console.log("Direct connect clicked")
                    bluetoothStore?.connectToMockDevice()
                  }}
                  style={$quickActionButton}
                />
              ) : (
                <Button
                  text="📱 Disconnect"
                  preset="default"
                  onPress={() => bluetoothStore?.disconnectMockDevice()}
                  style={$quickActionButton}
                />
              )}

              {!isStreaming ? (
                <Button
                  text="🔴 Start Stream"
                  preset="filled"
                  onPress={() => {
                    console.log("Direct stream clicked")
                    bluetoothStore?.startMockStreaming()
                  }}
                  style={$quickActionButton}
                  disabled={!connectionStatus.connected}
                />
              ) : (
                <Button
                  text="⏹️ Stop Stream"
                  preset="default"
                  onPress={() => bluetoothStore?.stopMockStreaming()}
                  style={$quickActionButton}
                />
              )}
            </View>
          </Card>
        </View>

        {/* Quick Actions - Always show */}
        <View style={$section}>
          <Text preset="subheading" text="Quick Actions" style={$sectionTitle} />
          <Card preset="default" style={$quickActionsCard}>
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
                  console.log("Navigate to statistics")
                }}
                style={$quickActionButton}
                textStyle={{ fontSize: 12 }}
              />
              <Button
                text="📈 Historical"
                preset="default"
                onPress={() => {
                  console.log("Navigate to historical data")
                }}
                style={$quickActionButton}
                textStyle={{ fontSize: 12 }}
              />
              <Button
                text="⚙️ Settings"
                preset="default"
                onPress={() => {
                  console.log("Navigate to settings")
                }}
                style={$quickActionButton}
                textStyle={{ fontSize: 12 }}
              />
            </View>
          </Card>
        </View>
      </Screen>
    )
  },
)

const $screenContainer: ViewStyle = {
  flex: 1,
}

const $contentContainer: ViewStyle = {
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
}

const $title: TextStyle = {
  marginBottom: spacing.xl,
  textAlign: "center",
  color: colors.palette.primary500,
}

const $section: ViewStyle = {
  marginBottom: spacing.xl,
}

const $sectionTitle: TextStyle = {
  marginBottom: spacing.md,
  color: colors.palette.neutral700,
  fontSize: 18,
  fontWeight: "600",
}

const $statusCard: ViewStyle = {
  backgroundColor: colors.palette.neutral100,
}

const $statusHeader: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: spacing.md,
}

const $channelsHeader: ViewStyle = {
  marginBottom: spacing.lg,
}

const $channelsSubtitle: TextStyle = {
  fontSize: 14,
  color: colors.palette.neutral600,
  fontStyle: "italic",
  marginTop: spacing.xs,
}

const $errorCard: ViewStyle = {
  marginBottom: spacing.md,
  backgroundColor: colors.palette.angry100,
}

const $emptyStateContainer: ViewStyle = {
  alignItems: "center",
  padding: spacing.lg,
}

const $emptyStateIcon: TextStyle = {
  fontSize: 48,
  marginBottom: spacing.md,
}

const $emptyStateTitle: TextStyle = {
  fontSize: 20,
  fontWeight: "bold",
  color: colors.palette.neutral700,
  marginBottom: spacing.sm,
  textAlign: "center",
}

const $emptyStateMessage: TextStyle = {
  textAlign: "center",
  color: colors.palette.neutral600,
  fontSize: 16,
  lineHeight: 24,
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

const $cardHeader: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.palette.neutral200,
}

const $cardHeaderLeft: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  flex: 1,
}

const $cardHeaderText: ViewStyle = {
  marginLeft: spacing.sm,
}

const $cardHeaderSubtitle: TextStyle = {
  fontSize: 14,
  color: colors.palette.neutral600,
}

const $cardHeaderStatus: TextStyle = {
  fontSize: 12,
  fontWeight: "600",
  marginTop: 2,
}

const $cardHeaderRight: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
}

const $cardHeaderValue: TextStyle = {
  fontSize: 18,
  fontWeight: "bold",
}

const $channelAction: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: spacing.sm,
  backgroundColor: colors.palette.neutral100,
  borderRadius: 8,
  paddingHorizontal: spacing.md,
  marginBottom: spacing.sm,
}

const $channelInstruction: TextStyle = {
  fontSize: 14,
  color: colors.palette.neutral600,
  fontStyle: "italic",
}

const $channelPreview: ViewStyle = {
  paddingVertical: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.palette.neutral200,
}

const $previewStats: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-around",
  marginBottom: spacing.md,
  backgroundColor: colors.palette.neutral50,
  paddingVertical: spacing.sm,
  borderRadius: 8,
}

const $previewStatItem: ViewStyle = {
  alignItems: "center",
  flex: 1,
}

const $previewStatLabel: TextStyle = {
  fontSize: 10,
  color: colors.palette.neutral400,
  marginBottom: 2,
}

const $previewStatValue: TextStyle = {
  fontSize: 14,
  fontWeight: "600",
}

const $miniChart: ViewStyle = {
  alignItems: "center",
}

const $miniChartLabel: TextStyle = {
  fontSize: 10,
  color: colors.palette.neutral400,
  marginBottom: spacing.xs,
}

const $miniChartContainer: ViewStyle = {
  flexDirection: "row",
  alignItems: "flex-end",
  height: 30,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  borderRadius: 4,
  gap: 2,
}

const $miniChartBar: ViewStyle = {
  width: 3,
  minHeight: 2,
  borderRadius: 1,
}

const $noDataPreview: ViewStyle = {
  alignItems: "center",
  paddingVertical: spacing.sm,
  backgroundColor: colors.palette.neutral100,
  borderRadius: 8,
  width: "100%",
}

const $noDataIcon: TextStyle = {
  fontSize: 16,
  marginBottom: 4,
}

const $noDataText: TextStyle = {
  fontSize: 10,
  color: colors.palette.neutral400,
}

const $simplePlaceholder: ViewStyle = {
  alignItems: "center",
  paddingVertical: spacing.md,
  backgroundColor: colors.palette.neutral50,
  borderRadius: 8,
  marginTop: spacing.sm,
}

const $placeholderText: TextStyle = {
  fontSize: 12,
  color: colors.palette.neutral500,
  fontStyle: "italic",
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

const $realTimeDot: ViewStyle = {
  width: 8,
  height: 8,
  borderRadius: 4,
  marginRight: spacing.xs,
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
  justifyContent: "center",
  borderRadius: 8,
  paddingVertical: spacing.lg,
  paddingHorizontal: spacing.sm,
  marginBottom: spacing.md,
  position: "relative",
}

const $chartWrapper: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
  width: "100%",
  paddingHorizontal: spacing.sm,
}

const $noDataContainer: ViewStyle = {
  height: 400,
  justifyContent: "center",
  alignItems: "center",
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
  backgroundColor: colors.palette.neutral100,
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
