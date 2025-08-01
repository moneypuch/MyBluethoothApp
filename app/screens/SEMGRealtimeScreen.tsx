import { observer } from "mobx-react-lite"
import { FC, useState, useEffect, useRef, useMemo, useCallback, memo } from "react"
import { ViewStyle, TextStyle, ScrollView, View, Dimensions, TouchableOpacity } from "react-native"
import { Screen, Text, Card, Button, SEMGChart } from "@/components"
import { spacing, colors } from "@/theme"
import { useStores } from "@/models"
import { DemoTabScreenProps } from "@/navigators/DemoNavigator"

const { width: screenWidth } = Dimensions.get("window")
const chartWidth = screenWidth - spacing.lg * 2 - spacing.md * 2

interface ChannelCardProps {
  channelIndex: number
  isExpanded: boolean
  onToggle: () => void
  chartData: any[]
  isStreaming: boolean
}

const ChannelCard: FC<ChannelCardProps> = memo(function ChannelCard({
  channelIndex,
  isExpanded,
  onToggle,
  chartData,
  isStreaming,
}) {
  // Calculate statistics from chartData
  const stats = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return { min: 1, max: 5000, avg: 2500, rms: 0 } // Real data range
    }

    const values = chartData.map((d) => d.y)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length
    const rms = Math.sqrt(values.reduce((sum, val) => sum + val * val, 0) / values.length)

    return { min, max, avg, rms }
  }, [chartData])
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
        </View>
        <View style={$cardHeaderRight}>
          {isStreaming && (
            <View
              style={[
                $realTimeDot,
                {
                  backgroundColor: colors.palette.success500,
                  opacity: 1,
                },
              ]}
            />
          )}
        </View>
      </View>

      {/* Static preview for collapsed channels - NO data updates */}
      {!isExpanded && (
        <View style={$channelPreview}>
          <View style={$simplePlaceholder}>
            <Text
              text={isStreaming ? "📈 Tap to expand" : "📈 Ready"}
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

      {isExpanded && (
        <View style={$expandableContent}>
          <View style={$chartSection}>
            <SEMGChart
              data={chartData}
              channelIndex={channelIndex}
              channelColor={channelColor}
              channelColorLight={channelColorLight}
              width={chartWidth}
              height={400}
              isStreaming={isStreaming}
              stats={stats}
            />

            <View style={$channelControls}>
              <Button
                text="Calibrate"
                preset="default"
                style={$controlButton}
                textStyle={$smallButtonText}
                onPress={() => {}}
              />
              <Button
                text="Reset"
                preset="default"
                style={$controlButton}
                textStyle={$smallButtonText}
                onPress={() => {}}
              />
            </View>
          </View>
        </View>
      )}
    </Card>
  )
})

export const SEMGRealtimeScreen: FC<DemoTabScreenProps<"Realtime">> = observer(
  function SEMGRealtimeScreen() {
    const { bluetoothStore } = useStores()
    const [expandedChannel, setExpandedChannel] = useState<number | null>(null) // Only one channel can be expanded
    const [autoScroll, setAutoScroll] = useState(true)
    const [_updateTrigger, setUpdateTrigger] = useState(0) // Manual update trigger
    const [highFrequencyMode, setHighFrequencyMode] = useState(false) // Toggle for 1kHz display
    const mockTimeoutRef = useRef<NodeJS.Timeout | null>(null) // For proper timeout cleanup

    const connectionStatus = bluetoothStore?.connectionStatus || {
      enabled: false,
      connected: false,
      connecting: false,
      streaming: false,
      sending: false,
      device: null,
      message: "No Bluetooth store available",
      samplesPerSecond: 0,
    }

    // Extract streaming status for easier access - memoized to prevent excessive updates
    const isStreaming = useMemo(() => connectionStatus.streaming, [connectionStatus.streaming])

    // Remove reactive buffer triggers to prevent infinite loops
    // const buffer1kHzUpdateCount = bluetoothStore?.buffer1kHzUpdateCount || 0

    // Single global timer for all UI updates - only runs when streaming
    useEffect(() => {
      let interval: NodeJS.Timeout | null = null

      if (isStreaming) {
        // Update frequency based on mode: 30Hz for high-frequency, 10Hz for normal
        const updateInterval = highFrequencyMode && expandedChannel !== null ? 33 : 100 // 33ms = ~30Hz, 100ms = 10Hz

        interval = setInterval(() => {
          setUpdateTrigger((prev) => prev + 1)
        }, updateInterval)
      }

      return () => {
        if (interval) clearInterval(interval)
      }
    }, [isStreaming, highFrequencyMode, expandedChannel]) // Update timer when mode changes

    // Cleanup timeout on unmount
    useEffect(() => {
      return () => {
        if (mockTimeoutRef.current) {
          clearTimeout(mockTimeoutRef.current)
          mockTimeoutRef.current = null
        }
      }
    }, [])

    const toggleChannel = (channelIndex: number) => {
      // Only one channel can be expanded at a time
      setExpandedChannel(expandedChannel === channelIndex ? null : channelIndex)
    }

    // Optimized: Only get data for expanded channel to reduce rerenders
    const getChannelData = useCallback(
      (channelIndex: number, isExpanded: boolean) => {
        // Don't process data for collapsed channels
        if (!isExpanded) return []

        try {
          if (!bluetoothStore || typeof bluetoothStore.getLatestSamples !== "function") {
            return []
          }

          // High-frequency mode: show 1 second of 1kHz data with decimation
          if (highFrequencyMode) {
            const samples = bluetoothStore.getLatestSamples(1000, "1kHz") // 1 second of data

            if (samples.length === 0) {
              return []
            }

            // Decimation: show every Nth point to keep performance reasonable
            const decimationFactor = Math.max(1, Math.floor(samples.length / 200)) // Target ~200 points max
            const decimatedSamples = samples.filter((_, index) => index % decimationFactor === 0)

            // Return data in Victory Native format with x,y coordinates
            // Reverse to get chronological order (oldest to newest) since getLatestSamples returns newest first
            const chronologicalSamples = decimatedSamples.reverse()
            return chronologicalSamples.map((sample, index) => ({
              x: index * decimationFactor, // Sample index
              y: sample.values[channelIndex] || 0,
            }))
          } else {
            // Normal mode: 100Hz data
            const samples = bluetoothStore.getLatestSamples(50, "100Hz")

            if (samples.length === 0) {
              return []
            }

            // Return data in Victory Native format with x,y coordinates
            // Reverse to get chronological order (oldest to newest) since getLatestSamples returns newest first
            const chartData = samples.reverse().map((sample, index) => ({
              x: index,
              y: sample.values[channelIndex] || 0,
            }))

            return chartData
          }
        } catch (error) {
          console.error(`Error getting channel ${channelIndex} data:`, error)
          return []
        }
      },
      [bluetoothStore, highFrequencyMode, _updateTrigger], // Add updateTrigger to refresh data
    )

    if (!bluetoothStore) {
      return (
        <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$screenContainer}>
          <ScrollView contentContainerStyle={$contentContainer}>
            <Text preset="heading" text="sEMG Real-time Monitor (100Hz)" style={$title} />
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
        <Text
          preset="heading"
          text={`sEMG Real-time Monitor (${highFrequencyMode && expandedChannel !== null ? "1000Hz" : "100Hz"})`}
          style={$title}
        />

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
                <Text text="Status" style={$systemStatLabel} />
                <Text
                  text={
                    isStreaming ? "Streaming" : connectionStatus.connected ? "Ready" : "Offline"
                  }
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
            {highFrequencyMode && expandedChannel !== null && (
              <Text
                text="⚡ High-Frequency Mode Active (1000Hz) - Showing decimated data"
                style={[$channelsSubtitle, { color: colors.palette.primary500, fontWeight: "600" }]}
              />
            )}
            {!connectionStatus.connected && (
              <Text
                text="Connect your device to see live data in these channels"
                style={$channelsSubtitle}
              />
            )}
            {connectionStatus.connected && !isStreaming && (
              <Text text="Start streaming to see real-time signals" style={$channelsSubtitle} />
            )}
          </View>
          {Array.from({ length: 10 }, (_, channelIndex) => {
            // Only load data for expanded channel to prevent infinite loops
            const isThisChannelExpanded = expandedChannel === channelIndex
            const chartData = getChannelData(channelIndex, isThisChannelExpanded)

            return (
              <ChannelCard
                key={channelIndex}
                channelIndex={channelIndex}
                isExpanded={expandedChannel === channelIndex}
                onToggle={() => toggleChannel(channelIndex)}
                chartData={chartData}
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
                text={`Connected: ${connectionStatus.connected} | Streaming: ${connectionStatus.streaming}`}
                style={$debugText}
              />
            </Card>
          </View>
        )}

        {/* Mock Testing Controls - Always show for debugging */}
        <View style={$section}>
          <Text preset="subheading" text="🔧 Mock Testing (Debug)" style={$sectionTitle} />
          <Card preset="default" style={$statusCard}>
            {/* Emergency Stop Button */}
            <Button
              text="🚨 EMERGENCY STOP"
              preset="default"
              onPress={() => {
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
                if (bluetoothStore?.connectToMockDevice) {
                  bluetoothStore.connectToMockDevice()

                  // Wait a bit then check if we can start streaming
                  mockTimeoutRef.current = setTimeout(() => {
                    if (bluetoothStore.startMockStreaming) {
                      bluetoothStore.startMockStreaming()
                    }
                    mockTimeoutRef.current = null // Clear ref after execution
                  }, 100)
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
                  onPress={() => bluetoothStore?.connectToMockDevice()}
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
                  onPress={() => bluetoothStore?.startMockStreaming()}
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
                textStyle={$smallButtonText}
              />
              <Button
                text={`⚡ ${highFrequencyMode ? "1kHz ON" : "1kHz OFF"}`}
                preset={highFrequencyMode ? "filled" : "default"}
                onPress={() => {
                  setHighFrequencyMode(!highFrequencyMode)
                }}
                style={$quickActionButton}
                textStyle={$smallButtonText}
                disabled={expandedChannel === null} // Only enable when a channel is expanded
              />
              <Button
                text="📊 Statistics"
                preset="default"
                onPress={() => {}}
                style={$quickActionButton}
                textStyle={$smallButtonText}
              />
              <Button
                text="📈 Historical"
                preset="default"
                onPress={() => {}}
                style={$quickActionButton}
                textStyle={$smallButtonText}
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

const $cardHeaderRight: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
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

const $smallButtonText: TextStyle = {
  fontSize: 12,
}
