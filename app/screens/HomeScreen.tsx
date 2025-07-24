import { observer } from "mobx-react-lite"
import { FC, useState } from "react"
import { TextStyle, View, ViewStyle } from "react-native"
import { Button, Screen, Text, Card } from "@/components"
import { DemoTabScreenProps } from "@/navigators/DemoNavigator"
import { useStores } from "../models"
import { spacing, colors } from "@/theme"
import { useHeader } from "../utils/useHeader"

export const HomeScreen: FC<DemoTabScreenProps<"DemoCommunity">> = observer(function HomeScreen() {
  const {
    authenticationStore: { logout, authEmail, authUser },
    bluetoothStore,
  } = useStores()

  const [isLoggingOut, setIsLoggingOut] = useState(false)

  async function handleLogout() {
    setIsLoggingOut(true)
    try {
      await logout()
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

  const userName = authUser?.name || authEmail?.split("@")[0] || "User"

  const connectionStatus = bluetoothStore?.connectionStatus || {
    enabled: false,
    connected: false,
    connecting: false,
    streaming: false,
    device: null,
    message: "No Bluetooth store available",
    packetCount: 0,
    buffer1kHzCount: 0,
  }

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
            <Text text={authUser?.role || "user"} style={$infoValue} />
          </View>
          <View style={$infoRow}>
            <Text text="Verified:" style={$infoLabel} />
            <Text
              text={authUser?.isVerified ? "Yes" : "No"}
              style={[
                $infoValue,
                {
                  color: authUser?.isVerified ? colors.palette.success500 : colors.palette.angry500,
                },
              ]}
            />
          </View>
        </Card>
      </View>

      {/* System Status Card */}
      <View style={$section}>
        <Text preset="subheading" text="System Status" style={$sectionTitle} />
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
                text={connectionStatus.connected ? "Device Connected" : "No Device Connected"}
                style={$connectionText}
              />
              {connectionStatus.streaming && (
                <View style={$streamingBadge}>
                  <Text text="STREAMING" style={$streamingText} />
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
                text={
                  connectionStatus.streaming
                    ? "Active"
                    : connectionStatus.connected
                      ? "Ready"
                      : "Offline"
                }
                style={$systemStatValue}
              />
            </View>
          </View>
        </Card>
      </View>

      {/* Quick Actions Card */}
      <View style={$section}>
        <Text preset="subheading" text="Quick Actions" style={$sectionTitle} />
        <Card preset="default" style={$quickActionsCard}>
          <View style={$quickActionsGrid}>
            <Button
              text="📱 Bluetooth"
              preset="default"
              onPress={() => {
                console.log("Navigate to Bluetooth")
              }}
              style={$quickActionButton}
            />
            <Button
              text="📊 Real-time Data"
              preset="default"
              onPress={() => {
                console.log("Navigate to Real-time")
              }}
              style={$quickActionButton}
            />
            <Button
              text="📈 Charts"
              preset="default"
              onPress={() => {
                console.log("Navigate to Charts")
              }}
              style={$quickActionButton}
            />
            <Button
              text="⚙️ Settings"
              preset="default"
              onPress={() => {
                console.log("Navigate to Settings")
              }}
              style={$quickActionButton}
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

const $statusCard: ViewStyle = {
  backgroundColor: colors.palette.neutral100,
}

const $statusHeader: ViewStyle = {
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

const $actionsCard: ViewStyle = {
  backgroundColor: colors.palette.neutral100,
}

const $actionButton: ViewStyle = {
  marginBottom: spacing.sm,
}
