import { observer } from "mobx-react-lite"
import { ComponentType, FC, useEffect, useMemo, useRef, useState } from "react"
// eslint-disable-next-line no-restricted-imports
import { TextInput, TextStyle, ViewStyle } from "react-native"
import {
  Button,
  PressableIcon,
  Screen,
  Text,
  TextField,
  TextFieldAccessoryProps,
} from "../components"
import { useStores } from "../models"
import { AppStackScreenProps } from "../navigators"
import type { ThemedStyle } from "@/theme"
import { useAppTheme } from "@/utils/useAppTheme"
import { api, getErrorMessage } from "../services/api"

interface RegistrationScreenProps extends AppStackScreenProps<"Register"> {}

export const RegistrationScreen: FC<RegistrationScreenProps> = observer(
  function RegistrationScreen(_props) {
    const { navigation } = _props
    const authPasswordInput = useRef<TextInput>(null)
    const authEmailInput = useRef<TextInput>(null)

    const [authName, setAuthName] = useState("")
    const [authEmail, setAuthEmail] = useState("")
    const [authPassword, setAuthPassword] = useState("")
    const [isAuthPasswordHidden, setIsAuthPasswordHidden] = useState(true)
    const [isSubmitted, setIsSubmitted] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const [nameError, setNameError] = useState("")
    const [emailError, setEmailError] = useState("")
    const [passwordError, setPasswordError] = useState("")
    const [generalError, setGeneralError] = useState("")

    const {
      authenticationStore: { setAuthToken, setAuthEmail: setStoreAuthEmail },
    } = useStores()

    const {
      themed,
      theme: { colors },
    } = useAppTheme()

    useEffect(() => {
      return () => {
        setAuthPassword("")
        setAuthEmail("")
        setAuthName("")
        setNameError("")
        setEmailError("")
        setPasswordError("")
        setGeneralError("")
      }
    }, [])

    const isValidEmail = (email: string) => {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      return emailRegex.test(email)
    }

    async function register() {
      setIsSubmitted(true)
      setIsLoading(true)

      // Clear all previous errors
      setNameError("")
      setEmailError("")
      setPasswordError("")
      setGeneralError("")

      let hasError = false

      // Validation
      if (!authName.trim()) {
        setNameError("Name is required")
        hasError = true
      } else if (authName.trim().length < 2) {
        setNameError("Name must be at least 2 characters")
        hasError = true
      }

      if (!authEmail.trim()) {
        setEmailError("Email is required")
        hasError = true
      } else if (!isValidEmail(authEmail.trim())) {
        setEmailError("Please enter a valid email address")
        hasError = true
      }

      if (!authPassword.trim()) {
        setPasswordError("Password is required")
        hasError = true
      } else if (authPassword.length < 6) {
        setPasswordError("Password must be at least 6 characters")
        hasError = true
      }

      if (hasError) {
        setIsLoading(false)
        return
      }

      try {
        // Call your Express API for registration
        const result = await api.register({
          name: authName.trim(),
          email: authEmail.trim(),
          password: authPassword,
        })

        if (result.kind === "ok") {
          // Registration successful
          const { token, user } = result.data

          // Set token in API client
          api.setAuthToken(token)

          // Save auth data in MobX store
          setAuthToken(token)
          setStoreAuthEmail(user.email)

          // Clear form
          setAuthPassword("")
          setAuthEmail("")
          setAuthName("")
          setIsSubmitted(false)
          setNameError("")
          setEmailError("")
          setPasswordError("")
          setGeneralError("")

          console.log("Registration successful:", { user: user.email, role: user.role })
        } else {
          // Handle API errors
          const errorMessage = getErrorMessage(result)
          setGeneralError(errorMessage)
          console.error("Registration failed:", result)
        }
      } catch (error: any) {
        console.error("Registration error:", error)
        setGeneralError("An unexpected error occurred. Please try again.")
      } finally {
        setIsLoading(false)
      }
    }

    function goToLogin() {
      navigation.navigate("Login")
    }

    const PasswordRightAccessory: ComponentType<TextFieldAccessoryProps> = useMemo(
      () =>
        function PasswordRightAccessory(props: TextFieldAccessoryProps) {
          return (
            <PressableIcon
              icon={isAuthPasswordHidden ? "view" : "hidden"}
              color={colors.palette.neutral800}
              containerStyle={props.style}
              size={20}
              onPress={() => setIsAuthPasswordHidden(!isAuthPasswordHidden)}
            />
          )
        },
      [isAuthPasswordHidden, colors.palette.neutral800],
    )

    return (
      <Screen
        preset="auto"
        contentContainerStyle={themed($screenContentContainer)}
        safeAreaEdges={["top", "bottom"]}
      >
        <Text testID="register-heading" text="Sign Up" preset="heading" style={themed($register)} />
        <Text
          text="Create your account to get started"
          preset="subheading"
          style={themed($enterDetails)}
        />

        <TextField
          value={authName}
          onChangeText={(text) => {
            setAuthName(text)
            setNameError("")
          }}
          containerStyle={themed($textField)}
          autoCapitalize="words"
          autoComplete="name"
          autoCorrect={false}
          label="Full Name"
          placeholder="Enter your full name"
          helper={nameError}
          status={nameError ? "error" : undefined}
          onSubmitEditing={() => authEmailInput.current?.focus()}
          editable={!isLoading}
        />

        <TextField
          ref={authEmailInput}
          value={authEmail}
          onChangeText={(text) => {
            setAuthEmail(text)
            setEmailError("")
          }}
          containerStyle={themed($textField)}
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          keyboardType="email-address"
          label="Email"
          placeholder="Enter your email address"
          helper={emailError}
          status={emailError ? "error" : undefined}
          onSubmitEditing={() => authPasswordInput.current?.focus()}
          editable={!isLoading}
        />

        <TextField
          ref={authPasswordInput}
          value={authPassword}
          onChangeText={(text) => {
            setAuthPassword(text)
            setPasswordError("")
          }}
          containerStyle={themed($textField)}
          autoCapitalize="none"
          autoComplete="password"
          autoCorrect={false}
          secureTextEntry={isAuthPasswordHidden}
          label="Password"
          placeholder="Create a password (min 6 characters)"
          onSubmitEditing={register}
          RightAccessory={PasswordRightAccessory}
          editable={!isLoading}
          helper={passwordError}
          status={passwordError ? "error" : undefined}
        />

        {generalError && (
          <Text text={generalError} size="sm" weight="light" style={themed($generalError)} />
        )}

        <Button
          testID="register-button"
          text={isLoading ? "Signing up..." : "Sign Up"}
          style={themed($registerButton)}
          preset="reversed"
          onPress={register}
          disabled={isLoading}
        />

        <Button
          testID="go-to-login-button"
          text="Already have an account? Log in"
          style={themed($loginButton)}
          preset="default"
          onPress={goToLogin}
          disabled={isLoading}
        />
      </Screen>
    )
  },
)

const $screenContentContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.xxl,
  paddingHorizontal: spacing.lg,
})

const $register: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.sm,
})

const $enterDetails: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $textField: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $registerButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.xs,
  marginBottom: spacing.md,
})

const $loginButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.xs,
})

const $generalError: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.error,
  marginBottom: spacing.md,
  textAlign: "center",
})
