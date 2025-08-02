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

interface LoginScreenProps extends AppStackScreenProps<"Login"> {}

export const LoginScreen: FC<LoginScreenProps> = observer(function LoginScreen(_props) {
  const authPasswordInput = useRef<TextInput>(null)

  const [authEmail, setAuthEmail] = useState("")
  const [authPassword, setAuthPassword] = useState("")
  const [isAuthPasswordHidden, setIsAuthPasswordHidden] = useState(true)
  const [isSubmitted, setIsSubmitted] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [attemptsCount, setAttemptsCount] = useState(0)
  const [loginError, setLoginError] = useState("")

  const {
    authenticationStore: { setAuthToken, setAuthEmail: setStoreAuthEmail, setUserInfo },
    bluetoothStore,
  } = useStores()

  const {
    themed,
    theme: { colors },
  } = useAppTheme()

  useEffect(() => {
    // Per sviluppo, puoi pre-riempire i campi
    setAuthEmail("john@example.com")
    setAuthPassword("password123")

    return () => {
      setAuthPassword("")
      setAuthEmail("")
      setLoginError("")
    }
  }, [])

  const error = loginError

  const isValidEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  function goToRegister() {
    _props.navigation.navigate("Register")
  }

  async function login() {
    setIsSubmitted(true)
    setIsLoading(true)
    setLoginError("")
    setAttemptsCount(attemptsCount + 1)

    // Validation
    if (!authEmail.trim()) {
      setLoginError("Email is required")
      setIsLoading(false)
      return
    }

    if (!isValidEmail(authEmail.trim())) {
      setLoginError("Please enter a valid email address")
      setIsLoading(false)
      return
    }

    if (!authPassword.trim()) {
      setLoginError("Password is required")
      setIsLoading(false)
      return
    }

    if (authPassword.length < 6) {
      setLoginError("Password must be at least 6 characters")
      setIsLoading(false)
      return
    }

    try {
      // Log API URL for debugging
      console.log("Attempting login to:", api.apisauce.getBaseURL())

      // Chiama la tua API Express
      const result = await api.login({
        email: authEmail.trim(),
        password: authPassword,
      })

      console.log("Login result:", result)

      if (result.kind === "ok") {
        // Login riuscito
        const { token, user } = result.data

        // Imposta il token nell'API client
        api.setAuthToken(token)

        // Salva dati auth nel store MobX
        setAuthToken(token)
        setStoreAuthEmail(user.email)
        setUserInfo({
          id: user.id,
          name: user.name,
          role: user.role,
        })
        
        // Load user's sessions after successful login
        if (bluetoothStore) {
          bluetoothStore.loadPreviousSessions()
        }

        // Reset form state BEFORE clearing fields to avoid validation errors
        setIsSubmitted(false)
        setLoginError("")

        // Pulisci form
        setAuthPassword("")
        setAuthEmail("")

        console.log("Login riuscito:", { user: user.email, role: user.role })
      } else {
        // Errore API
        const errorMessage = getErrorMessage(result)
        setLoginError(errorMessage)
        console.error("Login fallito:", result)
        console.error("Error details:", {
          kind: result.kind,
          baseURL: api.apisauce.getBaseURL(),
          error: result,
        })
      }
    } catch (error: any) {
      console.error("Errore login:", error)
      console.error("Exception details:", {
        message: error.message,
        stack: error.stack,
        baseURL: api.apisauce.getBaseURL(),
      })
      setLoginError("Errore imprevisto. Riprova.")
    } finally {
      setIsLoading(false)
    }
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
      <Text testID="login-heading" text="Log In" preset="heading" style={themed($logIn)} />
      <Text
        text="Enter your credentials to access your account"
        preset="subheading"
        style={themed($enterDetails)}
      />

      {attemptsCount > 2 && (
        <Text
          text="Having trouble? Check your email and password"
          size="sm"
          weight="light"
          style={themed($hint)}
        />
      )}

      <TextField
        value={authEmail}
        onChangeText={(text) => {
          setAuthEmail(text)
          setLoginError("")
        }}
        containerStyle={themed($textField)}
        autoCapitalize="none"
        autoComplete="email"
        autoCorrect={false}
        keyboardType="email-address"
        label="Email"
        placeholder="Enter your email address"
        helper={error}
        status={error ? "error" : undefined}
        onSubmitEditing={() => authPasswordInput.current?.focus()}
        editable={!isLoading}
      />

      <TextField
        ref={authPasswordInput}
        value={authPassword}
        onChangeText={(text) => {
          setAuthPassword(text)
          setLoginError("")
        }}
        containerStyle={themed($textField)}
        autoCapitalize="none"
        autoComplete="password"
        autoCorrect={false}
        secureTextEntry={isAuthPasswordHidden}
        label="Password"
        placeholder="Enter your password"
        onSubmitEditing={login}
        RightAccessory={PasswordRightAccessory}
        editable={!isLoading}
      />

      <Button
        testID="login-button"
        text={isLoading ? "Logging in..." : "Log In"}
        style={themed($tapButton)}
        preset="reversed"
        onPress={login}
        disabled={isLoading}
      />

      <Button
        testID="go-to-register-button"
        text="Don't have an account? Sign up"
        style={themed($registerButton)}
        preset="default"
        onPress={goToRegister}
        disabled={isLoading}
      />
    </Screen>
  )
})

const $screenContentContainer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.xxl,
  paddingHorizontal: spacing.lg,
})

const $logIn: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.sm,
})

const $enterDetails: ThemedStyle<TextStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $hint: ThemedStyle<TextStyle> = ({ colors, spacing }) => ({
  color: colors.tint,
  marginBottom: spacing.md,
})

const $textField: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.lg,
})

const $tapButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginTop: spacing.xs,
  marginBottom: spacing.md,
})

const $registerButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  marginBottom: spacing.xs,
})
