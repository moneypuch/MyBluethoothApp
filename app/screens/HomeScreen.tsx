import { observer } from "mobx-react-lite"
import { FC, useState } from "react"
import { ViewStyle } from "react-native"
import { Button, Screen, Text } from "@/components"
import { DemoTabScreenProps } from "../navigators/DemoNavigator"
import { useStores } from "../models"
import { spacing } from "@/theme"
import { useHeader } from "../utils/useHeader"

interface HomeScreenProps extends DemoTabScreenProps<"Home"> {}

export const HomeScreen: FC<HomeScreenProps> = observer(function HomeScreen(_props) {
  const {
    authenticationStore: { logout, authEmail },
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

  return (
    <Screen style={$container} preset="scroll" safeAreaEdges={["bottom"]}>
      <Text preset="heading" text="Welcome back!" style={$title} />
      <Text text={`Logged in as: ${authEmail}`} style={$subtitle} />

      <Text preset="subheading" text="Dashboard" style={$sectionTitle} />
      <Text text="Your main app content will go here." style={$content} />

      <Text preset="subheading" text="Quick Actions" style={$sectionTitle} />
      <Text text="• View your profile" style={$content} />
      <Text text="• Update settings" style={$content} />
      <Text text="• Access debug tools" style={$content} />
    </Screen>
  )
})

const $container: ViewStyle = {
  flex: 1,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
}

const $title: ViewStyle = {
  marginBottom: spacing.sm,
}

const $subtitle: ViewStyle = {
  marginBottom: spacing.xl,
}

const $sectionTitle: ViewStyle = {
  marginTop: spacing.lg,
  marginBottom: spacing.md,
}

const $content: ViewStyle = {
  marginBottom: spacing.sm,
}
