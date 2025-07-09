import { observer } from "mobx-react-lite"
import { FC, useState } from "react"
import { ImageStyle, TextStyle, View, ViewStyle } from "react-native"
import { Button, Screen, Text } from "@/components"
import { DemoTabScreenProps } from "@/navigators/DemoNavigator"
import { useStores } from "../models"
import { spacing } from "@/theme"
import { useHeader } from "../utils/useHeader"

export const DemoCommunityScreen: FC<DemoTabScreenProps<"DemoCommunity">> = observer(
  function DemoCommunityScreen() {
    const {
      authenticationStore: { logout, authEmail, authUser },
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

    return (
      <Screen preset="scroll" contentContainerStyle={$container} safeAreaEdges={["top"]}>
        <View style={$header}>
          <Text preset="heading" text={`Welcome back, ${userName}!`} style={$welcomeTitle} />
          <Text text="You're successfully logged in to your account." style={$welcomeSubtitle} />
        </View>

        <View style={$content}>
          <Text preset="subheading" text="Quick Actions" style={$sectionTitle} />

          <View style={$actionCard}>
            <Text preset="bold" text="Account Information" />
            <Text text={`Email: ${authEmail}`} style={$infoText} />
            <Text text={`Role: ${authUser?.role || "user"}`} style={$infoText} />
            <Text text={`Verified: ${authUser?.isVerified ? "Yes" : "No"}`} style={$infoText} />
          </View>

          <View style={$actionCard}>
            <Text preset="bold" text="App Features" />
            <Text text="• Browse components in the Showroom tab" style={$featureText} />
            <Text text="• Check out the Podcast list" style={$featureText} />
            <Text text="• Use Debug tools for development" style={$featureText} />
          </View>

          <View style={$actionCard}>
            <Text preset="bold" text="Account Actions" />
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
          </View>
        </View>
      </Screen>
    )
  },
)

const $container: ViewStyle = {
  paddingHorizontal: spacing.lg,
}

const $header: ViewStyle = {
  alignItems: "center",
  paddingVertical: spacing.xl,
}

const $logo: ImageStyle = {
  width: 80,
  height: 80,
  marginBottom: spacing.lg,
}

const $welcomeTitle: TextStyle = {
  marginBottom: spacing.sm,
  textAlign: "center",
}

const $welcomeSubtitle: TextStyle = {
  textAlign: "center",
  opacity: 0.8,
}

const $content: ViewStyle = {
  flex: 1,
}

const $sectionTitle: TextStyle = {
  marginTop: spacing.lg,
  marginBottom: spacing.md,
}

const $actionCard: ViewStyle = {
  backgroundColor: "rgba(0,0,0,0.05)",
  padding: spacing.md,
  borderRadius: 8,
  marginBottom: spacing.md,
}

const $infoText: TextStyle = {
  marginTop: spacing.xs,
  opacity: 0.8,
}

const $featureText: TextStyle = {
  marginTop: spacing.xs,
  marginLeft: spacing.sm,
  opacity: 0.8,
}

const $actionButton: ViewStyle = {
  marginTop: spacing.sm,
}
