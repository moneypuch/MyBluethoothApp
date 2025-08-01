import { observer } from "mobx-react-lite"
import { FC, useState, useEffect, useMemo, useCallback } from "react"
import { ViewStyle, TextStyle, ScrollView, View, Dimensions, Alert } from "react-native"
import { Screen, Text, Card, Button, SEMGChart } from "@/components"
import { spacing, colors } from "@/theme"
import { AppStackScreenProps } from "@/navigators"
import { useStores } from "@/models"
import { api } from "@/services/api"
import { debugLog, debugError } from "@/utils/logger"

const { width: screenWidth } = Dimensions.get("window")
const chartWidth = screenWidth - spacing.lg * 2 - spacing.md * 2

interface SessionData {
  sessionId: string
  deviceName: string
  deviceType?: "HC-05" | "IMU" | null
  startTime: string
  endTime?: string
  duration?: number
  totalSamples: number
  sampleRate: number
  channelCount: number
  status: string
}

interface ChannelData {
  timestamp: number
  values: number[]
}

export const SessionDetailScreen: FC<AppStackScreenProps<"SessionDetail">> = observer(
  function SessionDetailScreen({ route, navigation }) {
    const { sessionId } = route.params
    const { bluetoothStore } = useStores()
    const [sessionData, setSessionData] = useState<SessionData | null>(null)
    const [channelData, setChannelData] = useState<ChannelData[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expandedChannel, setExpandedChannel] = useState<number | null>(null)
    const [timeRange, setTimeRange] = useState<{ start?: number; end?: number }>({})
    const [isDataLoaded, setIsDataLoaded] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    // Load session metadata on mount, but don't auto-load data
    useEffect(() => {
      loadSessionMetadata()
    }, [sessionId])

    const loadSessionMetadata = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Load session metadata only
        const sessionResult = await api.getSession(sessionId)
        if (sessionResult.kind === "ok") {
          setSessionData(sessionResult.data.session)
        } else {
          throw new Error("Failed to load session details")
        }
      } catch (err: any) {
        debugError("Error loading session metadata:", err)
        setError(err.message || "Failed to load session details")
      } finally {
        setIsLoading(false)
      }
    }

    const loadSessionData = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Load session data
        const dataResult = await api.getSessionData(sessionId, {
          maxPoints: 10000, // Limit for performance
        })

        if (dataResult.kind === "ok") {
          // Convert backend data format to chart format
          const rawData = dataResult.data.data
          if (rawData.channels) {
            const convertedData: ChannelData[] = []

            // API format: { "0": [{timestamp, value}, ...], "1": [{timestamp, value}, ...] }
            const channelKeys = Object.keys(rawData.channels).sort(
              (a, b) => parseInt(a) - parseInt(b),
            )
            const maxLength = channelKeys.reduce(
              (max, key) => Math.max(max, rawData.channels[key]?.length || 0),
              0,
            )

            for (let i = 0; i < maxLength; i++) {
              const channelCount = sessionData?.channelCount || 10
              const values = new Array(channelCount).fill(0)
              let timestamp = Date.now() + i // fallback timestamp

              channelKeys.forEach((channelKey, idx) => {
                if (idx < channelCount && rawData.channels[channelKey]?.[i]) {
                  const dataPoint = rawData.channels[channelKey][i]

                  // Use timestamp from first valid data point
                  if (idx === 0 && dataPoint.timestamp) {
                    const ts =
                      typeof dataPoint.timestamp === "number"
                        ? dataPoint.timestamp
                        : parseFloat(dataPoint.timestamp)
                    timestamp = isFinite(ts) ? ts : Date.now() + i
                  }

                  // Extract and validate the value
                  const rawValue = dataPoint.value
                  const numValue = typeof rawValue === "number" ? rawValue : parseFloat(rawValue)
                  values[idx] = isFinite(numValue) ? numValue : 0
                }
              })

              convertedData.push({
                timestamp,
                values,
              })
            }

            setChannelData(convertedData)
            setIsDataLoaded(true)
          }
        } else {
          debugError("Failed to load session data:", dataResult)
          setChannelData([]) // Set empty data instead of throwing
        }
      } catch (err: any) {
        debugError("Error loading session data:", err)
        setError(err.message || "Failed to load session data")
      } finally {
        setIsLoading(false)
      }
    }

    const stopDataLoading = () => {
      setChannelData([])
      setIsDataLoaded(false)
      setExpandedChannel(null)
    }

    const handleDeleteSession = () => {
      Alert.alert(
        "Delete Session",
        `Are you sure you want to delete this session?\n\nThis will permanently remove:\n• Session: ${sessionData?.deviceName}\n• Date: ${sessionData ? new Date(sessionData.startTime).toLocaleString() : "Unknown"}\n• All recorded data and charts\n\nThis action cannot be undone.`,
        [
          {
            text: "Cancel",
            style: "cancel",
          },
          {
            text: "Delete",
            style: "destructive",
            onPress: confirmDeleteSession,
          },
        ],
      )
    }

    const confirmDeleteSession = async () => {
      try {
        setIsDeleting(true)

        if (bluetoothStore) {
          const result = await bluetoothStore.deleteSession(sessionId)

          if (result.success) {
            Alert.alert(
              "Session Deleted",
              "The session and all its data have been successfully deleted.",
              [
                {
                  text: "OK",
                  onPress: () => navigation.goBack(),
                },
              ],
            )
          } else {
            Alert.alert("Error", result.message || "Failed to delete session")
          }
        } else {
          Alert.alert("Error", "Bluetooth store not available")
        }
      } catch (error: any) {
        debugError("Error deleting session:", error)
        Alert.alert("Error", "An unexpected error occurred while deleting the session")
      } finally {
        setIsDeleting(false)
      }
    }

    // Generate chart data for a specific channel
    const getChannelChartData = useCallback(
      (channelIndex: number) => {
        if (!channelData.length) return []

        return channelData
          .map((sample, index) => {
            const value = sample.values[channelIndex]
            // Ensure we have valid numbers, convert to finite numbers
            const y = typeof value === "number" && isFinite(value) ? value : 0

            return {
              x: index,
              y: y,
            }
          })
          .filter((point) => isFinite(point.x) && isFinite(point.y)) // Remove any invalid points
      },
      [channelData],
    )

    // Calculate channel statistics
    const getChannelStats = useCallback(
      (channelIndex: number) => {
        if (!channelData.length) return { min: 0, max: 0, avg: 0, rms: 0 }

        // Filter out invalid values and ensure we have numbers
        const values = channelData
          .map((sample) => sample.values[channelIndex])
          .filter((val) => typeof val === "number" && isFinite(val))

        if (values.length === 0) return { min: 0, max: 0, avg: 0, rms: 0 }

        const min = Math.min(...values)
        const max = Math.max(...values)
        const avg = values.reduce((sum, val) => sum + val, 0) / values.length
        const rms = Math.sqrt(values.reduce((sum, val) => sum + val * val, 0) / values.length)

        // Ensure all returned values are finite numbers
        return {
          min: isFinite(min) ? min : 0,
          max: isFinite(max) ? max : 0,
          avg: isFinite(avg) ? avg : 0,
          rms: isFinite(rms) ? rms : 0,
        }
      },
      [channelData],
    )

    const channelColors = [
      colors.palette.primary500,
      colors.palette.secondary500,
      colors.palette.accent500,
      colors.palette.success500,
      colors.palette.angry500,
      colors.palette.neutral600,
      colors.palette.primary300,
      colors.palette.secondary300,
      colors.palette.accent300,
      colors.palette.success500,
    ]

    if (isLoading) {
      return (
        <Screen preset="scroll" safeAreaEdges={["top"]}>
          <View style={$loadingContainer}>
            <Text text="Loading session data..." style={$loadingText} />
          </View>
        </Screen>
      )
    }

    if (error || !sessionData) {
      return (
        <Screen preset="scroll" safeAreaEdges={["top"]}>
          <View style={$errorContainer}>
            <Text text={error || "Session not found"} style={$errorText} />
            <Button text="Go Back" onPress={() => navigation.goBack()} style={$backButton} />
          </View>
        </Screen>
      )
    }

    return (
      <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$contentContainer}>
        {/* Header */}
        <View style={$header}>
          <Button
            text="← Back"
            preset="default"
            onPress={() => navigation.goBack()}
            style={$backButton}
            textStyle={$backButtonText}
          />
          <Text text="Session Details" style={$title} />
        </View>

        {/* Session Info */}
        <Card preset="default" style={$infoCard}>
          <Text preset="subheading" text="Session Information" style={$sectionTitle} />
          <View style={$infoRow}>
            <Text text="Device:" style={$infoLabel} />
            <View style={$deviceInfo}>
              <Text text={sessionData.deviceName} style={$infoValue} />
              {sessionData.deviceType && (
                <View style={[
                  $deviceTypeBadge, 
                  { backgroundColor: sessionData.deviceType === "HC-05" ? colors.palette.primary500 : colors.palette.accent500 }
                ]}>
                  <Text 
                    text={sessionData.deviceType} 
                    style={[$deviceTypeText, { color: colors.background }]} 
                  />
                </View>
              )}
            </View>
          </View>
          <View style={$infoRow}>
            <Text text="Date:" style={$infoLabel} />
            <Text text={new Date(sessionData.startTime).toLocaleString()} style={$infoValue} />
          </View>
          <View style={$infoRow}>
            <Text text="Duration:" style={$infoLabel} />
            <Text
              text={`${Math.floor((sessionData.duration || 0) / 60)}m ${(sessionData.duration || 0) % 60}s`}
              style={$infoValue}
            />
          </View>
          <View style={$infoRow}>
            <Text text="Samples:" style={$infoLabel} />
            <Text text={sessionData.totalSamples.toLocaleString()} style={$infoValue} />
          </View>
          <View style={$infoRow}>
            <Text text="Sample Rate:" style={$infoLabel} />
            <Text text={`${sessionData.sampleRate} Hz`} style={$infoValue} />
          </View>

          {/* Delete Button */}
          <View style={$deleteButtonContainer}>
            <Button
              text={isDeleting ? "🗑️ Deleting..." : "🗑️ Delete Session"}
              onPress={handleDeleteSession}
              disabled={isDeleting || isLoading}
              style={$deleteButton}
              textStyle={$deleteButtonText}
              preset="default"
            />
          </View>
        </Card>

        {/* Session Navigation Controls */}
        <Card preset="default" style={$controlsCard}>
          <Text preset="subheading" text="Data Navigation" style={$sectionTitle} />
          <View style={$controlsRow}>
            {!isDataLoaded ? (
              <Button
                text={isLoading ? "Loading Data..." : "🔍 Load Session Data"}
                onPress={loadSessionData}
                disabled={isLoading}
                style={$controlButton}
                preset="reversed"
              />
            ) : (
              <>
                <Button
                  text="🔄 Reload Data"
                  onPress={loadSessionData}
                  disabled={isLoading}
                  style={$controlButtonSmall}
                />
                <Button
                  text="🛑 Clear Data"
                  onPress={stopDataLoading}
                  style={$controlButtonSmall}
                  preset="default"
                />
              </>
            )}
          </View>
          {isDataLoaded && (
            <Text
              text={`📊 Loaded ${channelData.length.toLocaleString()} data points`}
              style={$dataInfoText}
            />
          )}
        </Card>

        {/* Channel Data */}
        {isDataLoaded && (
          <View style={$section}>
            <Text preset="subheading" text="Channel Data" style={$sectionTitle} />
            <Text text="Tap a channel to expand and view detailed data" style={$instructionText} />

            {Array.from(
              { length: sessionData?.channelCount || 0 },
              (_, channelIndex) => {
                const isExpanded = expandedChannel === channelIndex
                const chartData = isExpanded ? getChannelChartData(channelIndex) : []
                const stats = isExpanded
                  ? getChannelStats(channelIndex)
                  : { min: 0, max: 0, avg: 0, rms: 0 }

                // Channel names for IMU
                const imuChannelNames = [
                  "Accel X", "Accel Y", "Accel Z",
                  "Gyro X", "Gyro Y", "Gyro Z", 
                  "Mag X", "Mag Y", "Mag Z"
                ]
                
                const channelName = sessionData?.deviceType === "IMU" && channelIndex < 9
                  ? imuChannelNames[channelIndex]
                  : `Channel ${channelIndex + 1}`
                
                const colorIndex = channelIndex % channelColors.length

                return (
                  <Card
                    key={channelIndex}
                    preset="default"
                    style={[$channelCard, isExpanded && $channelCardExpanded]}
                  >
                    <Button
                      text={`${channelName} ${isExpanded ? "▼" : "▶"}`}
                      preset="default"
                      onPress={() => setExpandedChannel(isExpanded ? null : channelIndex)}
                      style={$channelToggle}
                      textStyle={[$channelToggleText, { color: channelColors[colorIndex] }]}
                    />

                    {isExpanded && (
                      <View style={$channelDetails}>
                        <SEMGChart
                          data={chartData}
                          channelIndex={channelIndex}
                          channelColor={channelColors[colorIndex]}
                          channelColorLight={channelColors[colorIndex] + "40"}
                          width={chartWidth}
                          height={200}
                          isStreaming={false}
                          yDomain={sessionData?.deviceType === "IMU" ? [0, 100] : [0, 5500]}
                          stats={stats}
                        />

                        <View style={$statsRow}>
                          <Text
                            text={`Min: ${isFinite(stats.min) ? stats.min.toFixed(2) : "0.00"}`}
                            style={$statText}
                          />
                          <Text
                            text={`Max: ${isFinite(stats.max) ? stats.max.toFixed(2) : "0.00"}`}
                            style={$statText}
                          />
                          <Text
                            text={`Avg: ${isFinite(stats.avg) ? stats.avg.toFixed(2) : "0.00"}`}
                            style={$statText}
                          />
                          <Text
                            text={`RMS: ${isFinite(stats.rms) ? stats.rms.toFixed(2) : "0.00"}`}
                            style={$statText}
                          />
                        </View>
                      </View>
                    )}
                  </Card>
                )
              },
            )}
          </View>
        )}

        {/* Empty state when no data loaded */}
        {!isDataLoaded && !isLoading && (
          <Card preset="default" style={$emptyCard}>
            <Text text="Ready to load session data" style={$emptyText} />
            <Text
              text="Use the 'Load Session Data' button above to view channel data and charts"
              style={$emptySubtext}
            />
          </Card>
        )}
      </Screen>
    )
  },
)

const $contentContainer: ViewStyle = {
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
}

const $header: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: spacing.lg,
}

const $title: TextStyle = {
  flex: 1,
  textAlign: "center",
  fontSize: 18,
  fontWeight: "600",
  color: colors.palette.neutral700,
  marginLeft: -60, // Offset back button width
}

const $backButton: ViewStyle = {
  backgroundColor: "transparent",
  borderWidth: 0,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  minWidth: 60,
}

const $backButtonText: TextStyle = {
  color: colors.palette.primary500,
  fontSize: 16,
  fontWeight: "500",
}

const $infoCard: ViewStyle = {
  marginBottom: spacing.lg,
}

const $sectionTitle: TextStyle = {
  marginBottom: spacing.md,
  color: colors.palette.neutral700,
  fontSize: 18,
  fontWeight: "600",
}

const $infoRow: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: spacing.sm,
}

const $infoLabel: TextStyle = {
  fontSize: 14,
  color: colors.palette.neutral600,
  fontWeight: "500",
}

const $infoValue: TextStyle = {
  fontSize: 14,
  fontWeight: "600",
  color: colors.palette.neutral700,
}

const $section: ViewStyle = {
  marginBottom: spacing.xl,
}

const $instructionText: TextStyle = {
  fontSize: 12,
  color: colors.palette.neutral500,
  marginBottom: spacing.md,
  textAlign: "center",
}

const $channelCard: ViewStyle = {
  marginBottom: spacing.md,
}

const $channelCardExpanded: ViewStyle = {
  backgroundColor: colors.palette.neutral50,
}

const $channelToggle: ViewStyle = {
  backgroundColor: "transparent",
  paddingVertical: spacing.sm,
}

const $channelToggleText: TextStyle = {
  fontSize: 16,
  fontWeight: "600",
}

const $channelDetails: ViewStyle = {
  paddingTop: spacing.md,
}

const $statsRow: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-around",
  paddingTop: spacing.sm,
  borderTopWidth: 1,
  borderTopColor: colors.palette.neutral200,
  marginTop: spacing.sm,
}

const $statText: TextStyle = {
  fontSize: 12,
  color: colors.palette.neutral600,
  fontWeight: "500",
}

const $loadingContainer: ViewStyle = {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingVertical: spacing.xl,
}

const $loadingText: TextStyle = {
  fontSize: 16,
  color: colors.palette.neutral600,
}

const $errorContainer: ViewStyle = {
  flex: 1,
  justifyContent: "center",
  alignItems: "center",
  paddingHorizontal: spacing.lg,
}

const $errorText: TextStyle = {
  fontSize: 16,
  color: colors.palette.angry500,
  textAlign: "center",
  marginBottom: spacing.lg,
}

const $emptyCard: ViewStyle = {
  alignItems: "center",
  paddingVertical: spacing.xl,
}

const $emptyText: TextStyle = {
  fontSize: 14,
  color: colors.palette.neutral600,
  marginBottom: spacing.md,
}

const $controlsCard: ViewStyle = {
  marginBottom: spacing.lg,
}

const $controlsRow: ViewStyle = {
  flexDirection: "row",
  justifyContent: "center",
  alignItems: "center",
  gap: spacing.md,
  marginTop: spacing.sm,
}

const $controlButton: ViewStyle = {
  flex: 1,
  paddingVertical: spacing.md,
}

const $controlButtonSmall: ViewStyle = {
  flex: 1,
  paddingVertical: spacing.sm,
}

const $dataInfoText: TextStyle = {
  fontSize: 12,
  color: colors.palette.neutral600,
  textAlign: "center",
  marginTop: spacing.sm,
  fontStyle: "italic",
}

const $emptySubtext: TextStyle = {
  fontSize: 12,
  color: colors.palette.neutral400,
  textAlign: "center",
  marginTop: spacing.xs,
}

const $deleteButtonContainer: ViewStyle = {
  marginTop: spacing.lg,
  paddingTop: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.palette.neutral200,
}

const $deleteButton: ViewStyle = {
  backgroundColor: colors.palette.angry100,
  borderColor: colors.palette.angry500,
  borderWidth: 1,
}

const $deleteButtonText: TextStyle = {
  color: colors.palette.angry500,
  fontWeight: "600",
}

const $deviceInfo: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
}

const $deviceTypeBadge: ViewStyle = {
  paddingHorizontal: spacing.xs,
  paddingVertical: 2,
  borderRadius: 8,
  marginLeft: spacing.xs,
}

const $deviceTypeText: TextStyle = {
  fontSize: 9,
  fontWeight: "bold",
  letterSpacing: 0.5,
}
