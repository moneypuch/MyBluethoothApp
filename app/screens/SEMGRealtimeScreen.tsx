import { observer } from "mobx-react-lite"
import { FC, useState, useEffect, useRef, useMemo, useCallback, memo } from "react"
import { ViewStyle, TextStyle, ScrollView, View, Dimensions, TouchableOpacity } from "react-native"
import { Screen, Text, Card, Button, SEMGChart } from "@/components"
import { spacing, colors } from "@/theme"
import { useStores } from "@/models"
import { DemoTabScreenProps } from "@/navigators/DemoNavigator"
import { debugError } from "@/utils/logger"

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
              stats={{ min: 0, max: 0, avg: 0, rms: 0 }}
            />

            <View style={$channelControls}>
              <Button
                text="Calibrate"
                preset="default"
                style={$controlButton}
textStyle={$smallButtonText}
                onPress={() => {
                  console.log(`Calibrating channel ${channelIndex + 1}`)
                }}
              />
              <Button
                text="Reset"
                preset="default"
                style={$controlButton}
                textStyle={$smallButtonText}
                onPress={() => {
                  console.log(`Resetting channel ${channelIndex + 1}`)
                }}
              />
            </View>
          </View>
        </View>
      )}
    </Card>
  )
})

export const SEMGRealtimeScreen: FC<DemoTabScreenProps<"SEMGRealtimeScreen">> = observer(
  function SEMGRealtimeScreen() {
    const { bluetoothStore } = useStores()
    const [expandedChannel, setExpandedChannel] = useState<number | null>(null) // Only one channel can be expanded
    const [autoScroll, setAutoScroll] = useState(true)
    const [_updateTrigger, setUpdateTrigger] = useState(0) // Manual update trigger
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

    // Debug log to see if reactive triggers are working (disabled to prevent spam)
    // if (__DEV__ && buffer1kHzUpdateCount > 0) {
    //   console.log(
    //     `SEMGRealtimeScreen: buffer1kHzUpdateCount = ${buffer1kHzUpdateCount}, lastDataTimestamp = ${lastDataTimestamp}`,
    //   )
    // }


    // Single global timer for all UI updates - only runs when streaming
    useEffect(() => {
      let interval: NodeJS.Timeout | null = null

      if (isStreaming) {
        // Update UI every 100ms (10Hz) regardless of which channel is expanded
        interval = setInterval(() => {
          setUpdateTrigger((prev) => prev + 1)
        }, 100)
      }

      return () => {
        if (interval) clearInterval(interval)
      }
    }, [isStreaming]) // Only depend on streaming state, not expanded channel

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

          const samples = bluetoothStore.getLatestSamples(50, "100Hz")

          if (samples.length === 0) {
            return []
          }

          // Return data in Victory Native format with x,y coordinates
          return samples.reverse().map((sample, index) => ({
            x: index,
            y: sample.values[channelIndex] || 0,
          }))
        } catch (error) {
          console.error(`Error getting channel ${channelIndex} data:`, error)
          return []
        }
      },
      [bluetoothStore], // Only depend on store, updateTrigger causes unnecessary re-renders
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
        <Text preset="heading" text="sEMG Real-time Monitor (100Hz)" style={$title} />

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
              text={`Debug: Rendering ${10} channel cards.`}
              style={$debugText}
            />
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
                  mockTimeoutRef.current = setTimeout(() => {
                    console.log("After connect - connected:", bluetoothStore.connected)
                    if (bluetoothStore.startMockStreaming) {
                      console.log("Calling startMockStreaming at 100Hz...")
                      bluetoothStore.startMockStreaming()
                    } else {
                      console.log("startMockStreaming not available")
                    }
                    mockTimeoutRef.current = null // Clear ref after execution
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
                textStyle={$smallButtonText}
              />
              <Button
                text="📊 Statistics"
                preset="default"
                onPress={() => {
                  console.log("Navigate to statistics")
                }}
                style={$quickActionButton}
                textStyle={$smallButtonText}
              />
              <Button
                text="📈 Historical"
                preset="default"
                onPress={() => {
                  console.log("Navigate to historical data")
                }}
                style={$quickActionButton}
                textStyle={$smallButtonText}
              />
              <Button
                text="⚙️ Settings"
                preset="default"
                onPress={() => {
                  console.log("Navigate to settings")
                }}
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
