import { observer } from "mobx-react-lite"
import { FC, useState } from "react"
import { ViewStyle } from "react-native"
import { Button, Screen, Text, TextField } from "@/components"
import { DemoTabScreenProps } from "../navigators/DemoNavigator"
import { useStores } from "../models"
import { spacing } from "@/theme"
import { useHeader } from "../utils/useHeader"
import { api, getErrorMessage } from "../services/api"

interface ProfileScreenProps extends DemoTabScreenProps<"Profile"> {}

export const ProfileScreen: FC<ProfileScreenProps> = observer(function ProfileScreen(_props) {
  const {
    authenticationStore: { logout, authEmail, authUser },
  } = useStores()

  const [isLoading, setIsLoading] = useState(false)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [message, setMessage] = useState("")

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
      title: "Profile",
      rightText: isLoggingOut ? "Logging out..." : "Logout",
      onRightPress: handleLogout,
    },
    [handleLogout, isLoggingOut],
  )

  async function refreshProfile() {
    setIsLoading(true)
    setMessage("")

    try {
      const result = await api.getProfile()
      if (result.kind === "ok") {
        setMessage("Profile refreshed successfully!")
      } else {
        setMessage(getErrorMessage(result))
      }
    } catch (error) {
      setMessage("Failed to refresh profile")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Screen style={$container} preset="scroll" safeAreaEdges={["bottom"]}>
      <Text preset="heading" text="Your Profile" style={$title} />

      <TextField label="Email" value={authEmail || ""} editable={false} containerStyle={$field} />

      <TextField
        label="Name"
        value={authUser?.name || "Not available"}
        editable={false}
        containerStyle={$field}
      />

      <TextField
        label="Role"
        value={authUser?.role || "user"}
        editable={false}
        containerStyle={$field}
      />

      <TextField
        label="Verified"
        value={authUser?.isVerified ? "Yes" : "No"}
        editable={false}
        containerStyle={$field}
      />

      {message && <Text text={message} style={$message} />}

      <Button
        text={isLoading ? "Refreshing..." : "Refresh Profile"}
        onPress={refreshProfile}
        disabled={isLoading}
        style={$button}
      />

      <Text preset="subheading" text="Account Actions" style={$sectionTitle} />

      <Button
        text="Change Password"
        preset="default"
        onPress={() => setMessage("Change password feature coming soon!")}
        style={$button}
      />

      <Button
        text="Update Profile"
        preset="default"
        onPress={() => setMessage("Update profile feature coming soon!")}
        style={$button}
      />
    </Screen>
  )
})

const $container: ViewStyle = {
  flex: 1,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.lg,
}

const $title: ViewStyle = {
  marginBottom: spacing.xl,
}

const $field: ViewStyle = {
  marginBottom: spacing.md,
}

const $sectionTitle: ViewStyle = {
  marginTop: spacing.xl,
  marginBottom: spacing.md,
}

const $button: ViewStyle = {
  marginBottom: spacing.md,
}

const $message: ViewStyle = {
  marginBottom: spacing.md,
  textAlign: "center",
}
