import { observer } from "mobx-react-lite"
import { FC, useState, useEffect } from "react"
import {
  ViewStyle,
  TextStyle,
  FlatList,
  TouchableOpacity,
  View,
  RefreshControl,
  Alert,
} from "react-native"
import { Screen, Text, Card, Button } from "@/components"
import { spacing, colors } from "@/theme"
import { useStores } from "@/models"
import { AppStackScreenProps } from "@/navigators/AppNavigator"
import { api, Session } from "@/services/api"
import { useNavigation, useRoute, RouteProp } from "@react-navigation/native"

type UserSessionsListScreenRouteProp = RouteProp<
  { UserSessionsList: { userId: string; userName: string } },
  "UserSessionsList"
>

export const UserSessionsListScreen: FC<AppStackScreenProps<"UserSessionsList">> = observer(
  function UserSessionsListScreen() {
    const { authenticationStore } = useStores()
    const navigation = useNavigation<AppStackScreenProps<"SessionDetail">["navigation"]>()
    const route = useRoute<UserSessionsListScreenRouteProp>()
    const { userId, userName } = route.params

    const [sessions, setSessions] = useState<Session[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed" | "normalized">(
      "all",
    )

    useEffect(() => {
      loadSessions()
    }, [statusFilter])

    const loadSessions = async (page = 1, isRefresh = false) => {
      if (!authenticationStore?.isAdmin) {
        setError("Admin access required")
        return
      }

      try {
        if (isRefresh) {
          setIsRefreshing(true)
        } else {
          setIsLoading(true)
        }
        setError(null)

        const params: any = {
          limit: 50, // Load more sessions at once
        }

        if (statusFilter !== "all") {
          params.status = statusFilter
        }

        const result = await api.getUserSessions(userId, params)

        console.log("User sessions result:", result)

        if (result.kind === "ok") {
          console.log("User sessions data:", result.data)
          console.log("Sessions array:", result.data.sessions)
          setSessions(result.data.sessions || [])
        } else {
          console.log("User sessions error:", result)
          setError("Failed to load sessions")
        }
      } catch (err: any) {
        setError(err.message || "Failed to load sessions")
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }

    const handleRefresh = () => {
      loadSessions(1, true)
    }

    const handleSessionPress = (session: Session) => {
      console.log("Navigating to session:", session.sessionId)
      console.log("Full session object:", session)
      navigation.navigate("SessionDetail", { sessionId: session.sessionId })
    }

    const handleDeleteSession = (session: Session) => {
      Alert.alert(
        "Delete Session",
        `Are you sure you want to delete this session?\n\nDevice: ${session.deviceName}\nDate: ${formatDateTime(session.startTime)}\n\nThis action cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => confirmDeleteSession(session.sessionId),
          },
        ],
      )
    }

    const confirmDeleteSession = async (sessionId: string) => {
      try {
        const result = await api.deleteAdminSession(sessionId)

        if (result.kind === "ok") {
          Alert.alert("Success", "Session deleted successfully")
          setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId))
        } else {
          Alert.alert("Error", "Failed to delete session")
        }
      } catch (err: any) {
        Alert.alert("Error", err.message || "Failed to delete session")
      }
    }

    const formatDateTime = (dateString: string) => {
      const date = new Date(dateString)
      return `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })}`
    }

    const formatDuration = (duration?: number) => {
      if (!duration) return "Unknown"
      const minutes = Math.floor(duration / 60)
      const seconds = duration % 60
      return `${minutes}m ${seconds}s`
    }

    const getStatusColor = (status: string) => {
      switch (status) {
        case "active":
          return colors.palette.success500
        case "completed":
          return colors.palette.primary500
        case "normalized":
          return colors.palette.secondary500
        case "error":
          return colors.palette.angry500
        default:
          return colors.palette.neutral500
      }
    }

    const getDeviceTypeColor = (deviceType: string) => {
      switch (deviceType) {
        case "HC-05":
          return colors.palette.primary500
        case "IMU":
          return colors.palette.accent500
        default:
          return colors.palette.neutral500
      }
    }

    const filteredSessions = sessions.filter((session) => {
      if (statusFilter === "all") return true
      return session.status === statusFilter
    })

    const renderSessionItem = ({ item }: { item: Session }) => (
      <TouchableOpacity onPress={() => handleSessionPress(item)} activeOpacity={0.7}>
        <Card preset="default" style={$sessionCard}>
          <View style={$sessionHeader}>
            <View style={$sessionInfo}>
              <Text text={item.deviceName} style={$deviceName} />
              <Text text={formatDateTime(item.startTime)} style={$sessionDate} />
            </View>
            <View style={$sessionBadges}>
              {item.deviceType && (
                <View
                  style={[
                    $deviceTypeBadge,
                    { backgroundColor: getDeviceTypeColor(item.deviceType) },
                  ]}
                >
                  <Text
                    text={item.deviceType === "HC-05" ? "sEMG" : item.deviceType}
                    style={[$deviceTypeText, { color: colors.background }]}
                  />
                </View>
              )}
              <View style={[$statusBadge, { backgroundColor: getStatusColor(item.status) }]}>
                <Text text={item.status.toUpperCase()} style={$statusText} />
              </View>
            </View>
          </View>

          <View style={$sessionStats}>
            <View style={$statItem}>
              <Text text={formatDuration(item.duration)} style={$statValue} />
              <Text text="Duration" style={$statLabel} />
            </View>
            <View style={$statItem}>
              <Text text={item.totalSamples.toLocaleString()} style={$statValue} />
              <Text text="Samples" style={$statLabel} />
            </View>
            <View style={$statItem}>
              <Text text={`${item.sampleRate}Hz`} style={$statValue} />
              <Text text="Sample Rate" style={$statLabel} />
            </View>
          </View>

          <View style={$sessionActions}>
            <Button
              text="🗑️ Delete"
              onPress={() => handleDeleteSession(item)}
              style={$deleteButton}
              textStyle={$deleteButtonText}
              preset="default"
            />
          </View>
        </Card>
      </TouchableOpacity>
    )

    if (!authenticationStore?.isAdmin) {
      return (
        <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$screenContainer}>
          <Card preset="default" style={$errorCard}>
            <Text text="⚠️ Admin Access Required" style={$errorTitle} />
            <Text text="You don't have permission to access this section." style={$errorMessage} />
          </Card>
        </Screen>
      )
    }

    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$screenContainer}>
        {/* Header with Back Button */}
        <View style={$header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={$backButtonTouchable}
            activeOpacity={0.7}
          >
            <View style={$backButtonContainer}>
              <Text text="← Back" style={$backButtonText} />
            </View>
          </TouchableOpacity>
          <View style={$headerContent}>
            <Text text={userName} style={$headerTitle} />
            <Text text={`${filteredSessions.length} sessions`} style={$headerSubtitle} />
          </View>
        </View>

        {/* Simple Status Filter */}
        <View style={$filtersContainer}>
          <Text text="Filter by status:" style={$filterLabel} />
          <View style={$filterButtons}>
            {(["all", "active", "completed", "normalized"] as const).map((status) => (
              <Button
                key={status}
                text={status === "all" ? "All" : status.charAt(0).toUpperCase() + status.slice(1)}
                onPress={() => setStatusFilter(status)}
                style={[$filterButton, statusFilter === status && $filterButtonActive]}
                textStyle={[$filterButtonText, statusFilter === status && $filterButtonTextActive]}
                preset="default"
              />
            ))}
          </View>
        </View>

        {error ? (
          <Card preset="default" style={$errorCard}>
            <Text text="⚠️ Error Loading Sessions" style={$errorTitle} />
            <Text text={error} style={$errorMessage} />
            <Button
              text="Retry"
              onPress={() => loadSessions(1)}
              style={$retryButton}
              preset="default"
            />
          </Card>
        ) : (
          <FlatList
            data={filteredSessions}
            renderItem={renderSessionItem}
            keyExtractor={(item) => item.sessionId}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
            ListEmptyComponent={
              isLoading ? (
                <Card preset="default" style={$emptyCard}>
                  <Text text="Loading sessions..." style={$emptyText} />
                </Card>
              ) : (
                <Card preset="default" style={$emptyCard}>
                  <Text text="No sessions found" style={$emptyText} />
                  <Text
                    text={
                      statusFilter !== "all"
                        ? `No ${statusFilter} sessions for this user`
                        : "This user hasn't created any sessions yet"
                    }
                    style={$emptySubtext}
                  />
                </Card>
              )
            }
            contentContainerStyle={$listContainer}
          />
        )}
      </Screen>
    )
  },
)

const $screenContainer: ViewStyle = {
  flex: 1,
}

const $header: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  paddingBottom: spacing.md,
  backgroundColor: colors.palette.primary100,
}

const $backButtonTouchable: ViewStyle = {
  minWidth: 60,
  minHeight: 44, // iOS minimum touch target
  justifyContent: "center",
  alignItems: "flex-start",
  paddingVertical: spacing.xs,
}

const $backButtonContainer: ViewStyle = {
  backgroundColor: "transparent",
}

const $backButtonText: TextStyle = {
  color: colors.palette.primary600,
  fontSize: 16,
  fontWeight: "600",
}

const $headerContent: ViewStyle = {
  flex: 1,
  marginLeft: spacing.md,
}

const $headerTitle: TextStyle = {
  fontSize: 18,
  fontWeight: "bold",
  color: colors.palette.primary600,
  marginBottom: spacing.xs,
}

const $headerSubtitle: TextStyle = {
  fontSize: 14,
  color: colors.palette.primary500,
}

const $filtersContainer: ViewStyle = {
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  backgroundColor: colors.palette.neutral50,
}

const $filterLabel: TextStyle = {
  fontSize: 14,
  fontWeight: "600",
  color: colors.palette.neutral700,
  marginBottom: spacing.sm,
}

const $filterButtons: ViewStyle = {
  flexDirection: "row",
  gap: spacing.sm,
}

const $filterButton: ViewStyle = {
  flex: 1,
  paddingVertical: spacing.sm,
  backgroundColor: colors.palette.neutral200,
  borderRadius: 8,
}

const $filterButtonActive: ViewStyle = {
  backgroundColor: colors.palette.primary500,
}

const $filterButtonText: TextStyle = {
  fontSize: 12,
  fontWeight: "600",
  color: colors.palette.neutral600,
  textAlign: "center",
}

const $filterButtonTextActive: TextStyle = {
  color: colors.background,
}

const $listContainer: ViewStyle = {
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
}

const $sessionCard: ViewStyle = {
  marginBottom: spacing.md,
}

const $sessionHeader: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: spacing.md,
}

const $sessionInfo: ViewStyle = {
  flex: 1,
}

const $deviceName: TextStyle = {
  fontSize: 16,
  fontWeight: "600",
  color: colors.palette.neutral800,
  marginBottom: spacing.xs,
}

const $sessionDate: TextStyle = {
  fontSize: 14,
  color: colors.palette.neutral600,
}

const $sessionBadges: ViewStyle = {
  alignItems: "flex-end",
  gap: spacing.xs,
}

const $deviceTypeBadge: ViewStyle = {
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  borderRadius: 8,
}

const $deviceTypeText: TextStyle = {
  fontSize: 10,
  fontWeight: "bold",
  letterSpacing: 0.5,
}

const $statusBadge: ViewStyle = {
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  borderRadius: 8,
}

const $statusText: TextStyle = {
  fontSize: 10,
  fontWeight: "bold",
  letterSpacing: 0.5,
  color: colors.background,
}

const $sessionStats: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-around",
  paddingVertical: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.palette.neutral200,
  borderBottomWidth: 1,
  borderBottomColor: colors.palette.neutral200,
  marginBottom: spacing.sm,
}

const $statItem: ViewStyle = {
  alignItems: "center",
}

const $statValue: TextStyle = {
  fontSize: 14,
  fontWeight: "bold",
  color: colors.palette.primary600,
  marginBottom: spacing.xs,
}

const $statLabel: TextStyle = {
  fontSize: 11,
  color: colors.palette.neutral500,
  textAlign: "center",
}

const $sessionActions: ViewStyle = {
  alignItems: "center",
}

const $deleteButton: ViewStyle = {
  backgroundColor: colors.palette.angry100,
  borderColor: colors.palette.angry200,
  borderWidth: 1,
  paddingHorizontal: spacing.lg,
}

const $deleteButtonText: TextStyle = {
  color: colors.palette.angry500,
  fontSize: 12,
  fontWeight: "600",
}

const $errorCard: ViewStyle = {
  backgroundColor: colors.palette.angry100,
  margin: spacing.lg,
}

const $errorTitle: TextStyle = {
  fontSize: 18,
  fontWeight: "bold",
  color: colors.palette.angry500,
  marginBottom: spacing.sm,
  textAlign: "center",
}

const $errorMessage: TextStyle = {
  textAlign: "center",
  color: colors.palette.angry500,
  fontSize: 14,
  lineHeight: 20,
}

const $retryButton: ViewStyle = {
  marginTop: spacing.md,
}

const $emptyCard: ViewStyle = {
  alignItems: "center",
  padding: spacing.lg,
}

const $emptyText: TextStyle = {
  fontSize: 16,
  color: colors.palette.neutral500,
  marginBottom: spacing.sm,
}

const $emptySubtext: TextStyle = {
  fontSize: 14,
  color: colors.palette.neutral400,
  textAlign: "center",
}
