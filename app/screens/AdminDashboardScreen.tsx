import { observer } from "mobx-react-lite"
import { FC, useState, useEffect } from "react"
import {
  ViewStyle,
  TextStyle,
  FlatList,
  TouchableOpacity,
  View,
  RefreshControl,
} from "react-native"
import { Screen, Text, Card, Button, TextField } from "@/components"
import { spacing, colors } from "@/theme"
import { useStores } from "@/models"
import { DemoTabScreenProps } from "@/navigators/DemoNavigator"
import { useHeader } from "@/utils/useHeader"
import { api, AdminUser } from "@/services/api"
import { AppStackScreenProps } from "@/navigators/AppNavigator"
import { useNavigation } from "@react-navigation/native"

export const AdminDashboardScreen: FC<DemoTabScreenProps<"Admin">> = observer(
  function AdminDashboardScreen() {
    const { authenticationStore } = useStores()
    const navigation = useNavigation<AppStackScreenProps<"UserSessionsList">["navigation"]>()
    const [users, setUsers] = useState<AdminUser[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [filteredUsers, setFilteredUsers] = useState<AdminUser[]>([])

    useHeader(
      {
        title: "Admin Panel",
      },
      [],
    )

    useEffect(() => {
      loadUsers()
    }, [])

    useEffect(() => {
      // Filter users based on search query
      if (searchQuery.trim()) {
        const filtered = users.filter(
          (user) =>
            user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            user.email.toLowerCase().includes(searchQuery.toLowerCase()),
        )
        setFilteredUsers(filtered)
      } else {
        setFilteredUsers(users)
      }
    }, [users, searchQuery])

    const loadUsers = async (isRefresh = false) => {
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

        const result = await api.getAdminUsers({ limit: 100 })
        console.log("Admin users result:", result)

        if (result.kind === "ok") {
          setUsers(result.data.users || [])
        } else {
          setError("Failed to load users")
        }
      } catch (err: any) {
        setError(err.message || "Failed to load users")
      } finally {
        setIsLoading(false)
        setIsRefreshing(false)
      }
    }

    const handleRefresh = () => {
      loadUsers(true)
    }

    const handleUserPress = (user: AdminUser) => {
      navigation.navigate("UserSessionsList", {
        userId: user._id,
        userName: user.name,
      })
    }

    const formatDate = (dateString: string) => {
      return new Date(dateString).toLocaleDateString()
    }

    const getUserStatusColor = (user: AdminUser) => {
      if (user.role === "admin") return colors.palette.angry500
      if (user.sessionCount > 0) return colors.palette.success500
      return colors.palette.neutral500
    }

    const renderUserItem = ({ item }: { item: AdminUser }) => (
      <TouchableOpacity onPress={() => handleUserPress(item)} activeOpacity={0.7}>
        <Card preset="default" style={$userCard}>
          <View style={$userHeader}>
            <View style={$userInfo}>
              <Text text={item.name} style={$userName} />
              <Text text={item.email} style={$userEmail} />
            </View>
            <View style={$userBadges}>
              <View style={[$roleBadge, { backgroundColor: getUserStatusColor(item) }]}>
                <Text
                  text={item.role.toUpperCase()}
                  style={[$roleText, { color: colors.background }]}
                />
              </View>
              {item.isVerified && (
                <View style={$verifiedBadge}>
                  <Text text="✓" style={$verifiedText} />
                </View>
              )}
            </View>
          </View>

          <View style={$userStats}>
            <View style={$statItem}>
              <Text text={`${item.sessionCount}`} style={$statNumber} />
              <Text text="Sessions" style={$statLabel} />
            </View>
            <View style={$statItem}>
              <Text text={`${item.totalSamples.toLocaleString()}`} style={$statNumber} />
              <Text text="Samples" style={$statLabel} />
            </View>
            <View style={$statItem}>
              <Text
                text={item.lastSessionDate ? formatDate(item.lastSessionDate) : "Never"}
                style={$statNumber}
              />
              <Text text="Last Session" style={$statLabel} />
            </View>
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
        {/* Header */}
        <View style={$header}>
          <Text
            text={`Welcome, ${authenticationStore?.userName || "Admin"}`}
            style={$welcomeText}
          />
          <Text text={`Managing ${filteredUsers.length} users`} style={$statsText} />
        </View>

        {/* Search */}
        <View style={$searchContainer}>
          <TextField
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search users by name or email..."
            style={$searchInput}
          />
        </View>

        {error ? (
          <Card preset="default" style={$errorCard}>
            <Text text="⚠️ Error Loading Users" style={$errorTitle} />
            <Text text={error} style={$errorMessage} />
            <Button
              text="Retry"
              onPress={() => loadUsers()}
              style={$retryButton}
              preset="default"
            />
          </Card>
        ) : (
          <FlatList
            data={filteredUsers}
            renderItem={renderUserItem}
            keyExtractor={(item) => item._id}
            refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
            ListEmptyComponent={
              isLoading ? (
                <Card preset="default" style={$emptyCard}>
                  <Text text="Loading users..." style={$emptyText} />
                </Card>
              ) : (
                <Card preset="default" style={$emptyCard}>
                  <Text text="No users found" style={$emptyText} />
                  <Text
                    text={
                      searchQuery
                        ? "Try adjusting your search"
                        : "No users have been registered yet"
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
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.md,
  paddingBottom: spacing.sm,
  backgroundColor: colors.palette.primary100,
}

const $welcomeText: TextStyle = {
  fontSize: 20,
  fontWeight: "bold",
  color: colors.palette.primary600,
  marginBottom: spacing.xs,
}

const $statsText: TextStyle = {
  fontSize: 14,
  color: colors.palette.primary500,
}

const $searchContainer: ViewStyle = {
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
}

const $searchInput: ViewStyle = {
  marginBottom: 0,
}

const $listContainer: ViewStyle = {
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
}

const $userCard: ViewStyle = {
  marginBottom: spacing.md,
}

const $userHeader: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "flex-start",
  marginBottom: spacing.md,
}

const $userInfo: ViewStyle = {
  flex: 1,
}

const $userName: TextStyle = {
  fontSize: 16,
  fontWeight: "600",
  color: colors.palette.neutral800,
  marginBottom: spacing.xs,
}

const $userEmail: TextStyle = {
  fontSize: 14,
  color: colors.palette.neutral600,
}

const $userBadges: ViewStyle = {
  alignItems: "flex-end",
  gap: spacing.xs,
}

const $roleBadge: ViewStyle = {
  paddingHorizontal: spacing.xs,
  paddingVertical: 2,
  borderRadius: 8,
}

const $roleText: TextStyle = {
  fontSize: 9,
  fontWeight: "bold",
  letterSpacing: 0.5,
}

const $verifiedBadge: ViewStyle = {
  width: 20,
  height: 20,
  borderRadius: 10,
  backgroundColor: colors.palette.success500,
  alignItems: "center",
  justifyContent: "center",
}

const $verifiedText: TextStyle = {
  color: colors.background,
  fontSize: 12,
  fontWeight: "bold",
}

const $userStats: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-around",
  paddingTop: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.palette.neutral200,
}

const $statItem: ViewStyle = {
  alignItems: "center",
}

const $statNumber: TextStyle = {
  fontSize: 16,
  fontWeight: "bold",
  color: colors.palette.primary600,
  marginBottom: spacing.xs,
}

const $statLabel: TextStyle = {
  fontSize: 11,
  color: colors.palette.neutral500,
  textAlign: "center",
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
