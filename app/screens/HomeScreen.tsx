import { observer } from "mobx-react-lite"
import { FC, useState, useEffect } from "react"
import { TextStyle, View, ViewStyle, FlatList, TouchableOpacity } from "react-native"
import { Button, Screen, Text, Card } from "@/components"
import { DemoTabScreenProps } from "@/navigators/DemoNavigator"
import { useStores } from "../models"
import { spacing, colors } from "@/theme"
import { useHeader } from "../utils/useHeader"
import { useNavigation } from "@react-navigation/native"
import { AppStackScreenProps } from "@/navigators"

export const HomeScreen: FC<DemoTabScreenProps<"Home">> = observer(function HomeScreen() {
  const navigation = useNavigation<AppStackScreenProps<"SessionDetail">["navigation"]>()
  const rootStore = useStores()
  const {
    authenticationStore: { authEmail },
    bluetoothStore,
  } = rootStore

  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)

  function handleLogout() {
    setIsLoggingOut(true)
    try {
      rootStore.completeLogout()
    } catch (error) {
      console.error("Logout error:", error)
    } finally {
      setIsLoggingOut(false)
    }
  }

  useHeader(
    {
      title: "Home",
      rightText: isLoggingOut ? "Logging out..." : "Logout",
      onRightPress: handleLogout,
    },
    [handleLogout, isLoggingOut],
  )

  const userName = authEmail?.split("@")[0] || "User"

  // Load sessions on component mount
  useEffect(() => {
    const loadSessions = async () => {
      if (bluetoothStore) {
        setIsLoadingSessions(true)
        try {
          await bluetoothStore.loadPreviousSessions()
        } catch (error) {
          console.error("Error loading sessions:", error)
        } finally {
          setIsLoadingSessions(false)
        }
      }
    }

    loadSessions()
  }, [bluetoothStore])

  return (
    <Screen
      preset="scroll"
      contentContainerStyle={$contentContainer}
      safeAreaEdges={["top"]}
      ScrollViewProps={{
        showsVerticalScrollIndicator: false,
      }}
    >
      {/* Main Title */}
      <Text preset="heading" text={`Welcome back, ${userName}!`} style={$title} />

      {/* User Information Card */}
      <View style={$section}>
        <Text preset="subheading" text="Account Information" style={$sectionTitle} />
        <Card preset="default" style={$infoCard}>
          <View style={$infoRow}>
            <Text text="Email:" style={$infoLabel} />
            <Text text={authEmail || "Not available"} style={$infoValue} />
          </View>
          <View style={$infoRow}>
            <Text text="Role:" style={$infoLabel} />
            <Text text="user" style={$infoValue} />
          </View>
        </Card>
      </View>

      {/* Recent Sessions Card */}
      <View style={$section}>
        <Text preset="subheading" text="Recent Sessions" style={$sectionTitle} />
        <Card preset="default" style={$sessionsCard}>
          {isLoadingSessions ? (
            <View style={$loadingContainer}>
              <Text text="Loading sessions..." style={$loadingText} />
            </View>
          ) : bluetoothStore?.sessions.length > 0 ? (
            <FlatList
              data={bluetoothStore.sessions.slice(0, 5)} // Show only last 5 sessions
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => {
                const startDate = new Date(item.startTime)
                const formattedDate = `${startDate.toLocaleDateString()} at ${startDate.toLocaleTimeString(
                  [],
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}`

                return (
                  <TouchableOpacity
                    style={$sessionItem}
                    onPress={() => {
                      console.log("Session clicked:", item.id)
                      navigation.navigate("SessionDetail", { sessionId: item.id })
                    }}
                  >
                    <View style={$sessionInfo}>
                      <View style={$sessionHeader}>
                        <Text text={item.deviceName} style={$sessionDeviceName} />
                        {item.deviceType && (
                          <View
                            style={[
                              $deviceTypeBadge,
                              {
                                backgroundColor:
                                  item.deviceType === "HC-05"
                                    ? colors.palette.primary500
                                    : colors.palette.accent500,
                              },
                            ]}
                          >
                            <Text
                              text={item.deviceType === "HC-05" ? "sEMG" : item.deviceType}
                              style={[$deviceTypeText, { color: colors.background }]}
                            />
                          </View>
                        )}
                      </View>
                      <Text text={formattedDate} style={$sessionDate} />
                    </View>
                    <View style={$sessionStats}>
                      <Text
                        text={`${Math.floor(
                          (item.endTime ? item.endTime - item.startTime : 0) / 1000,
                        )}s`}
                        style={$sessionDuration}
                      />
                      <Text
                        text={`${item.sampleCount.toLocaleString()} samples`}
                        style={$sessionSamples}
                      />
                    </View>
                  </TouchableOpacity>
                )
              }}
              showsVerticalScrollIndicator={false}
              scrollEnabled={false}
            />
          ) : (
            <View style={$emptyContainer}>
              <Text text="No sessions found" style={$emptyText} />
              <Text text="Start a recording session to see history here" style={$emptySubtext} />
            </View>
          )}

          <View style={$sessionActions}>
            <Button
              text={isLoadingSessions ? "Loading..." : "Refresh Sessions"}
              preset="default"
              onPress={async () => {
                if (bluetoothStore) {
                  setIsLoadingSessions(true)
                  try {
                    await bluetoothStore.loadPreviousSessions()
                  } catch (error) {
                    console.error("Error refreshing sessions:", error)
                  } finally {
                    setIsLoadingSessions(false)
                  }
                }
              }}
              disabled={isLoadingSessions}
              style={$sessionRefreshButton}
            />
          </View>
        </Card>
      </View>

      {/* Account Actions Card */}
      <View style={$section}>
        <Text preset="subheading" text="Account Actions" style={$sectionTitle} />
        <Card preset="default" style={$actionsCard}>
          <Button
            text="Refresh Profile"
            preset="default"
            onPress={() => console.log("Refresh profile")}
            style={$actionButton}
          />
          <Button
            text={isLoggingOut ? "Logging out..." : "Logout"}
            preset="reversed"
            onPress={handleLogout}
            disabled={isLoggingOut}
            style={$actionButton}
          />
        </Card>
      </View>
    </Screen>
  )
})

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

const $infoCard: ViewStyle = {
  backgroundColor: colors.palette.neutral100,
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

const $actionsCard: ViewStyle = {
  backgroundColor: colors.palette.neutral100,
}

const $actionButton: ViewStyle = {
  marginBottom: spacing.sm,
}

const $sessionsCard: ViewStyle = {
  backgroundColor: colors.palette.neutral100,
}

const $loadingContainer: ViewStyle = {
  alignItems: "center",
  paddingVertical: spacing.lg,
}

const $loadingText: TextStyle = {
  fontSize: 14,
  color: colors.palette.neutral600,
}

const $sessionItem: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.palette.neutral200,
}

const $sessionInfo: ViewStyle = {
  flex: 1,
}

const $sessionDeviceName: TextStyle = {
  fontSize: 14,
  fontWeight: "600",
  color: colors.palette.neutral700,
  marginBottom: 2,
}

const $sessionDate: TextStyle = {
  fontSize: 12,
  color: colors.palette.neutral500,
}

const $sessionStats: ViewStyle = {
  alignItems: "flex-end",
}

const $sessionDuration: TextStyle = {
  fontSize: 12,
  fontWeight: "600",
  color: colors.palette.primary500,
  marginBottom: 2,
}

const $sessionSamples: TextStyle = {
  fontSize: 10,
  color: colors.palette.neutral400,
}

const $emptyContainer: ViewStyle = {
  alignItems: "center",
  paddingVertical: spacing.xl,
}

const $emptyText: TextStyle = {
  fontSize: 14,
  fontWeight: "600",
  color: colors.palette.neutral600,
  marginBottom: spacing.xs,
}

const $emptySubtext: TextStyle = {
  fontSize: 12,
  color: colors.palette.neutral400,
  textAlign: "center",
}

const $sessionActions: ViewStyle = {
  borderTopWidth: 1,
  borderTopColor: colors.palette.neutral200,
  paddingTop: spacing.sm,
  marginTop: spacing.sm,
}

const $sessionRefreshButton: ViewStyle = {
  marginTop: spacing.xs,
}

const $sessionHeader: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: spacing.xs,
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
