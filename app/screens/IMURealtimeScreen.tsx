import { observer } from "mobx-react-lite"
import { FC, useState, useEffect, useMemo, useCallback, memo } from "react"
import { ViewStyle, TextStyle, ScrollView, View, Dimensions, TouchableOpacity } from "react-native"
import { Screen, Text, Card, Button, SEMGChart } from "@/components"
import { spacing, colors } from "@/theme"
import { useStores } from "@/models"
import { DemoTabScreenProps } from "@/navigators/DemoNavigator"
import { useHeader } from "@/utils/useHeader"

const { width: screenWidth } = Dimensions.get("window")
const chartWidth = screenWidth - spacing.lg * 2 - spacing.md * 2

interface IMUChannelCardProps {
  channelIndex: number
  isExpanded: boolean
  onToggle: () => void
  chartData: any[]
  isStreaming: boolean
  isConnected: boolean
}

const IMUChannelCard: FC<IMUChannelCardProps> = memo(function IMUChannelCard({
  channelIndex,
  isExpanded,
  onToggle,
  chartData,
  isStreaming,
  isConnected,
}) {
  // Calculate statistics from chartData - IMU range 0-100
  const stats = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return { min: 0, max: 100, avg: 50, rms: 0 } // IMU data range 0-100
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
  ][channelIndex % 9] // Only 9 channels for IMU

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
  ][channelIndex % 9] // Only 9 channels for IMU

  // IMU channel names
  const channelNames = [
    "Accel X",
    "Accel Y",
    "Accel Z",
    "Gyro X",
    "Gyro Y",
    "Gyro Z",
    "Mag X",
    "Mag Y",
    "Mag Z",
  ]

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
          {isStreaming && <View style={[$realTimeDot, $realTimeDotActive]} />}
        </View>
      </View>

      {/* Static preview for collapsed channels - NO data updates */}
      {!isExpanded && (
        <View style={$channelPreview}>
          <View style={$simplePlaceholder}>
            <Text
              text={
                isStreaming
                  ? "📊 IMU data streaming"
                  : isConnected
                    ? "📊 Ready to stream"
                    : "📊 Device disconnected"
              }
              style={[
                $placeholderText,
                {
                  color: isStreaming
                    ? channelColor
                    : isConnected
                      ? colors.palette.primary500
                      : colors.palette.neutral400,
                },
              ]}
            />
          </View>
        </View>
      )}

      {/* Expanded view with chart and controls */}
      {isExpanded && (
        <View style={$channelDetails}>
          <SEMGChart
            data={chartData}
            channelIndex={channelIndex}
            channelColor={channelColor}
            channelColorLight={channelColorLight}
            width={chartWidth}
            height={200}
            isStreaming={isStreaming}
            yDomain={[0, 100]} // IMU data range 0-100
            stats={stats}
          />

          <View style={$expandableContent}>
            <Text text={channelNames[channelIndex]} style={$channelInstruction} />
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
    </Card>
  )
})

export const IMURealtimeScreen: FC<DemoTabScreenProps<"Realtime">> = observer(
  function IMURealtimeScreen() {
    const { bluetoothStore } = useStores()
    const [expandedChannel, setExpandedChannel] = useState<number | null>(null) // Only one channel can be expanded
    const [_updateTrigger, setUpdateTrigger] = useState(0) // Manual update trigger

    useHeader(
      {
        title: "IMU Realtime",
      },
      [],
    )

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

    // Single global timer for all UI updates - only runs when streaming
    useEffect(() => {
      let interval: NodeJS.Timeout | null = null

      if (isStreaming) {
        // Update every 100ms (10Hz) for UI updates
        const updateInterval = 100

        interval = setInterval(() => {
          setUpdateTrigger((prev) => prev + 1)
        }, updateInterval)
      }

      return () => {
        if (interval) clearInterval(interval)
      }
    }, [isStreaming, expandedChannel])

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

          // Get 100Hz data for display
          const samples = bluetoothStore.getLatestSamples(50, "100Hz")

          if (samples.length === 0) {
            return []
          }

          // Return data in Victory Native format with x,y coordinates
          // Reverse to get chronological order (oldest to newest) since getLatestSamples returns newest first
          const chartData = samples.reverse().map((sample) => ({
            x: sample.timestamp,  // Use sample timestamp (sample number)
            y: sample.values[channelIndex] || 0,
          }))

          return chartData
        } catch (error) {
          console.error(`Error getting IMU channel ${channelIndex} data:`, error)
          return []
        }
      },
      [bluetoothStore], // Dependencies for data fetching
    )

    if (!bluetoothStore) {
      return (
        <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$screenContainer}>
          <ScrollView contentContainerStyle={$contentContainer}>
            <Text preset="heading" text="IMU Real-time Monitor" style={$sectionTitle} />
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

            {/* Streaming Control Buttons */}
            {connectionStatus.connected && (
              <View style={$streamingControls}>
                <Button
                  text={isStreaming ? "Stop IMU Streaming" : "Start IMU Streaming"}
                  onPress={async () => {
                    if (isStreaming) {
                      await bluetoothStore.stopStreamingCommand()
                    } else {
                      await bluetoothStore.startStreamingCommand()
                    }
                  }}
                  disabled={!connectionStatus.connected || connectionStatus.sending}
                  style={$streamingButton}
                  preset={isStreaming ? "filled" : "default"}
                />
              </View>
            )}
          </Card>
        </View>

        {/* Channels Section - Show 9 IMU channels */}
        <View style={$section}>
          <View style={$channelsHeader}>
            <Text
              preset="subheading"
              text={`IMU Channels ${isStreaming ? "(Live)" : connectionStatus.connected ? "(Ready)" : "(Preview)"}`}
              style={$sectionTitle}
            />
            {!connectionStatus.connected && (
              <Text
                text="Connect your IMU device to see live data in these channels"
                style={$channelsSubtitle}
              />
            )}
            {connectionStatus.connected && !isStreaming && (
              <Text text="Start streaming to see real-time IMU signals" style={$channelsSubtitle} />
            )}
            {isStreaming && (
              <Text
                text="📊 IMU streaming active - Tap channels to expand and view their data"
                style={$channelsSubtitle}
              />
            )}
          </View>
          {Array.from({ length: 9 }, (_, channelIndex) => {
            // Only load data for expanded channel to prevent infinite loops
            const isThisChannelExpanded = expandedChannel === channelIndex
            const chartData = getChannelData(channelIndex, isThisChannelExpanded)

            return (
              <IMUChannelCard
                key={channelIndex}
                channelIndex={channelIndex}
                isExpanded={expandedChannel === channelIndex}
                onToggle={() => toggleChannel(channelIndex)}
                chartData={chartData}
                isStreaming={isStreaming}
                isConnected={connectionStatus.connected}
              />
            )
          })}
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
  fontSize: 18,
  fontWeight: "bold",
  color: colors.palette.angry500,
  marginBottom: spacing.sm,
}

const $emptyStateMessage: TextStyle = {
  textAlign: "center",
  color: colors.palette.neutral600,
  fontSize: 16,
  lineHeight: 24,
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

const $streamingControls: ViewStyle = {
  paddingTop: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.palette.neutral200,
  marginTop: spacing.sm,
}

const $streamingButton: ViewStyle = {
  marginTop: spacing.xs,
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
}

const $cardHeaderRight: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
}

const $channelAction: ViewStyle = {
  backgroundColor: colors.palette.neutral50,
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

const $realTimeDotActive: ViewStyle = {
  backgroundColor: colors.palette.success500,
  opacity: 1,
}

const $expandableContent: ViewStyle = {
  overflow: "hidden",
}

const $channelDetails: ViewStyle = {
  paddingTop: spacing.md,
}

