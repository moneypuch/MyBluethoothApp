import { observer } from "mobx-react-lite"
import { FC, useState, useEffect, useCallback } from "react"
import {
  ViewStyle,
  TextStyle,
  View,
  Dimensions,
  Alert,
  TouchableOpacity,
  Platform,
  PermissionsAndroid,
} from "react-native"
import { Screen, Text, Card, Button, SEMGChart } from "@/components"
import { spacing, colors } from "@/theme"
import { AppStackScreenProps } from "@/navigators"
import { useStores } from "@/models"
import { api } from "@/services/api"
import { debugError } from "@/utils/logger"
import * as FileSystem from "expo-file-system"
import RNFS from "react-native-fs"

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
    const { bluetoothStore, authenticationStore } = useStores()

    // Smart back navigation
    const handleBackPress = () => {
      if (navigation.canGoBack()) {
        navigation.goBack()
      } else if (authenticationStore?.isAdmin) {
        // If we're an admin and can't go back, go to admin tab
        navigation.navigate("Demo", { screen: "Admin" })
      } else {
        // Regular users go to their sessions
        navigation.navigate("Demo", { screen: "Home" })
      }
    }
    const [sessionData, setSessionData] = useState<SessionData | null>(null)
    const [channelData, setChannelData] = useState<ChannelData[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [expandedChannel, setExpandedChannel] = useState<number | null>(null)
    const [isDataLoaded, setIsDataLoaded] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)
    const [isDownloading, setIsDownloading] = useState(false)

    // Load session metadata on mount, but don't auto-load data
    useEffect(() => {
      loadSessionMetadata()
    }, [sessionId])

    const loadSessionMetadata = async () => {
      try {
        setIsLoading(true)
        setError(null)

        console.log("Loading session metadata for sessionId:", sessionId)

        // Load session metadata only
        const sessionResult = await api.getSession(sessionId)

        console.log("Session result:", sessionResult)

        if (sessionResult.kind === "ok") {
          console.log("Session data:", sessionResult.data)
          setSessionData(sessionResult.data.session)
        } else {
          console.log("Session result error:", sessionResult)

          // Provide more specific error messages
          if (sessionResult.kind === "not-found") {
            if (authenticationStore?.isAdmin) {
              throw new Error(
                `Session ${sessionId} not found. This might be a permissions issue - admins may need special access to view other users' sessions.`,
              )
            } else {
              throw new Error(
                `Session ${sessionId} not found or you don't have permission to view it.`,
              )
            }
          } else if (sessionResult.kind === "unauthorized") {
            throw new Error("You don't have permission to view this session.")
          } else {
            throw new Error(`Failed to load session: ${sessionResult.kind}`)
          }
        }
      } catch (err: any) {
        console.log("Error loading session metadata:", err)
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
        console.log("Loading session data for sessionId:", sessionId)
        const dataResult = await api.getSessionData(sessionId, {
          maxPoints: 10000, // Limit for performance
        })

        console.log("Session data result:", dataResult)

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
          console.log("Failed to load session data:", dataResult)
          debugError("Failed to load session data:", dataResult)

          // For admins viewing other users' sessions, data endpoint might not be accessible
          if (authenticationStore?.isAdmin && dataResult.kind === "not-found") {
            console.log("Admin data access limitation - showing session info only")
            setError("Chart data not available - admin viewing other user's session")
          }

          setChannelData([]) // Set empty data instead of throwing
        }
      } catch (err: any) {
        debugError("Error loading session data:", err)
        console.log("Error loading session data:", err)

        // Don't set error for data loading failures - just show session info without charts
        setChannelData([])
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
                  onPress: handleBackPress,
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

    const handleNormalizeSession = async () => {
      try {
        Alert.alert(
          "Normalize Session",
          "Choose normalization method:",
          [
            { text: "Cancel", style: "cancel" },
            {
              text: "Min-Max (0-1)",
              onPress: () => normalizeSession("min_max"),
            },
            {
              text: "Z-Score",
              onPress: () => normalizeSession("z_score"),
            },
            {
              text: "RMS",
              onPress: () => normalizeSession("rms"),
            },
          ],
        )
      } catch (error: any) {
        debugError("Error in normalize dialog:", error)
        Alert.alert("Error", "Failed to show normalization options")
      }
    }

    const normalizeSession = async (method: string) => {
      try {
        setIsLoading(true)
        
        const result = await api.normalizeSession(sessionId, method)
        
        if (result.kind === "ok") {
          Alert.alert(
            "Success",
            `Session normalized successfully!\n\nNew session ID: ${result.data.newSessionId}`,
            [
              {
                text: "View Normalized Session",
                onPress: () => {
                  navigation.replace("SessionDetail", { 
                    sessionId: result.data.newSessionId 
                  })
                },
              },
              { text: "Stay Here" },
            ],
          )
        } else {
          Alert.alert("Error", `Failed to normalize session: ${result.kind}`)
        }
      } catch (error: any) {
        debugError("Error normalizing session:", error)
        Alert.alert("Error", "An unexpected error occurred while normalizing the session")
      } finally {
        setIsLoading(false)
      }
    }

    const handleDownloadSession = async () => {
      try {
        setIsDownloading(true)

        // Download the session data from API
        const result = await api.downloadSession(sessionId)

        if (result.kind === "ok") {
          // Convert blob to CSV text
          const reader = new FileReader()
          reader.readAsText(result.data)
          reader.onloadend = async () => {
            const csvContent = reader.result as string

            // Create file path in Downloads folder
            const downloadsPath =
              Platform.OS === "android" ? RNFS.DownloadDirectoryPath : RNFS.DocumentDirectoryPath
            const filePath = `${downloadsPath}/${result.filename}`

            try {
              // Save to app's external directory - this should work without Downloads permission
              const publicPath = RNFS.ExternalDirectoryPath + "/" + result.filename
              await RNFS.writeFile(publicPath, csvContent, "utf8")

              Alert.alert(
                "✅ CSV File Saved!",
                `Your session data has been saved:\n\n📄 ${result.filename}\n\n📁 File path: ${publicPath}\n\n🔍 To find it:\n1. Open File Manager\n2. Go to: Android → data → com.mybluethoothapp → files\n3. Find: ${result.filename}\n\nYou can copy it to Downloads from there!`,
                [
                  {
                    text: "Copy Path",
                    onPress: () => {
                      // Copy path to clipboard would be nice, but not essential
                      Alert.alert("Path", publicPath)
                    },
                  },
                  { text: "Perfect!" },
                ],
              )
            } catch (saveError) {
              debugError("External directory save failed:", saveError)

              // Last resort: app documents directory using Expo FileSystem
              try {
                const lastResortPath = FileSystem.documentDirectory + result.filename
                await FileSystem.writeAsStringAsync(lastResortPath, csvContent)

                Alert.alert(
                  "CSV Saved (App Directory)",
                  `File saved internally:\n\n📄 ${result.filename}\n\n📁 ${lastResortPath}\n\nThe CSV contains your session data. To access it, you'll need to use the app's share functionality or connect via USB.`,
                  [{ text: "OK" }],
                )
              } catch (lastError) {
                debugError("Final save attempt failed:", lastError)
                Alert.alert("Error", "Could not save CSV file. Please try again.")
              }
            }
          }
        } else {
          Alert.alert("Error", `Failed to download session: ${result.kind}`)
        }
      } catch (error: any) {
        debugError("Error downloading session:", error)
        Alert.alert("Error", "An unexpected error occurred while downloading the session")
      } finally {
        setIsDownloading(false)
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
            <TouchableOpacity
              onPress={handleBackPress}
              style={$backButtonTouchable}
              activeOpacity={0.7}
            >
              <View style={$backButton}>
                <Text text="Go Back" style={$backButtonText} />
              </View>
            </TouchableOpacity>
          </View>
        </Screen>
      )
    }

    return (
      <Screen preset="scroll" safeAreaEdges={["top"]} contentContainerStyle={$contentContainer}>
        {/* Header */}
        <View style={$header}>
          <TouchableOpacity
            onPress={handleBackPress}
            style={$backButtonTouchable}
            activeOpacity={0.7}
          >
            <View style={$backButton}>
              <Text text="← Back" style={$backButtonText} />
            </View>
          </TouchableOpacity>
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
                <View
                  style={[
                    $deviceTypeBadge,
                    {
                      backgroundColor:
                        sessionData.deviceType === "HC-05"
                          ? colors.palette.primary500
                          : colors.palette.accent500,
                    },
                  ]}
                >
                  <Text
                    text={sessionData.deviceType === "HC-05" ? "sEMG" : sessionData.deviceType}
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

          {/* Action Buttons */}
          <View style={$actionButtonsContainer}>
            <Button
              text={isDownloading ? "📥 Downloading..." : "📥 Download CSV"}
              onPress={handleDownloadSession}
              disabled={isDownloading || isLoading}
              style={$downloadButton}
              textStyle={$downloadButtonText}
              preset="default"
            />
            <Button
              text="🔄 Normalize"
              onPress={handleNormalizeSession}
              disabled={isLoading}
              style={$normalizeButton}
              textStyle={$normalizeButtonText}
              preset="default"
            />
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
                text={
                  isLoading
                    ? "Loading Data..."
                    : authenticationStore?.isAdmin
                      ? "🔍 Load Session Data (Admin)"
                      : "🔍 Load Session Data"
                }
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

            {Array.from({ length: sessionData?.channelCount || 0 }, (_, channelIndex) => {
              const isExpanded = expandedChannel === channelIndex
              const chartData = isExpanded ? getChannelChartData(channelIndex) : []
              const stats = isExpanded
                ? getChannelStats(channelIndex)
                : { min: 0, max: 0, avg: 0, rms: 0 }

              // Channel names for IMU
              const imuChannelNames = [
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

              const channelName =
                sessionData?.deviceType === "IMU" && channelIndex < 9
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
            })}
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

const $backButtonTouchable: ViewStyle = {
  minWidth: 80,
  minHeight: 44, // iOS minimum touch target
  justifyContent: "center",
  alignItems: "flex-start",
}

const $backButton: ViewStyle = {
  backgroundColor: colors.palette.primary100,
  borderWidth: 1,
  borderColor: colors.palette.primary300,
  borderRadius: 8,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
}

const $backButtonText: TextStyle = {
  color: colors.palette.primary600,
  fontSize: 16,
  fontWeight: "600",
  textAlign: "center",
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

const $actionButtonsContainer: ViewStyle = {
  marginTop: spacing.lg,
  paddingTop: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.palette.neutral200,
  flexDirection: "row",
  gap: spacing.sm,
}

const $downloadButton: ViewStyle = {
  flex: 1,
  backgroundColor: colors.palette.primary100,
  borderColor: colors.palette.primary500,
  borderWidth: 1,
}

const $downloadButtonText: TextStyle = {
  color: colors.palette.primary600,
  fontWeight: "600",
}

const $deleteButton: ViewStyle = {
  flex: 1,
  backgroundColor: colors.palette.angry100,
  borderColor: colors.palette.angry500,
  borderWidth: 1,
}

const $deleteButtonText: TextStyle = {
  color: colors.palette.angry500,
  fontWeight: "600",
}

const $normalizeButton: ViewStyle = {
  flex: 1,
  backgroundColor: colors.palette.secondary100,
  borderColor: colors.palette.secondary500,
  borderWidth: 1,
}

const $normalizeButtonText: TextStyle = {
  color: colors.palette.secondary600,
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
