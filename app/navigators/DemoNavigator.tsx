import { BottomTabScreenProps, createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { CompositeScreenProps } from "@react-navigation/native"
import { TextStyle, ViewStyle } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { observer } from "mobx-react-lite"
import { useMemo } from "react"
import { Icon } from "../components"
import { HomeScreen, BluetoothScreen, SEMGRealtimeScreen, IMURealtimeScreen } from "../screens"
import type { ThemedStyle } from "@/theme"
import { AppStackParamList, AppStackScreenProps } from "./AppNavigator"
import { useAppTheme } from "@/utils/useAppTheme"
import { useStores } from "@/models"

export type DemoTabParamList = {
  Home: undefined
  Bluetooth: undefined
  Realtime: undefined
}

/**
 * Helper for automatically generating navigation prop types for each route.
 *
 * More info: https://reactnavigation.org/docs/typescript/#organizing-types
 */
export type DemoTabScreenProps<T extends keyof DemoTabParamList> = CompositeScreenProps<
  BottomTabScreenProps<DemoTabParamList, T>,
  AppStackScreenProps<keyof AppStackParamList>
>

const Tab = createBottomTabNavigator<DemoTabParamList>()

// Stable conditional component that doesn't re-mount during device changes
const RealtimeScreen = observer(function RealtimeScreen(props: DemoTabScreenProps<"Realtime">) {
  const { bluetoothStore } = useStores()
  
  // Get device type, but use useMemo to prevent unnecessary re-evaluations
  const deviceType = useMemo(() => {
    return bluetoothStore?.deviceType
  }, [bluetoothStore?.selectedDevice?.name]) // Only re-evaluate when device name changes, not on every render

  // Show sEMG screen for HC-05 devices, IMU screen for IMU devices
  if (deviceType === "HC-05") {
    return <SEMGRealtimeScreen {...props} />
  } else if (deviceType === "IMU") {
    return <IMURealtimeScreen {...props} />
  } else {
    // Default to sEMG screen when no device is connected or device type is unknown
    return <SEMGRealtimeScreen {...props} />
  }
})

/**
 * Main bottom tab navigator for the application.
 * Provides navigation between Home, Bluetooth, Realtime data, Components showcase, and Debug screens.
 */
export const DemoNavigator = observer(function DemoNavigator() {
  const { bottom } = useSafeAreaInsets()
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const { bluetoothStore } = useStores()
  const deviceType = bluetoothStore?.deviceType

  // Consistent tab label regardless of connection state
  const realtimeLabel = "Data"

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: themed([$tabBar, { height: bottom + 70 }]),
        tabBarActiveTintColor: colors.text,
        tabBarInactiveTintColor: colors.text,
        tabBarLabelStyle: themed($tabBarLabel),
        tabBarItemStyle: themed($tabBarItem),
      }}
      initialRouteName="Home"
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          tabBarLabel: "Home",
          tabBarIcon: ({ focused }) => (
            <Icon icon="heart" color={focused ? colors.tint : colors.tintInactive} size={30} />
          ),
        }}
      />

      <Tab.Screen
        name="Bluetooth"
        component={BluetoothScreen}
        options={{
          tabBarLabel: "Bluetooth",
          tabBarIcon: ({ focused }) => (
            <Icon icon="podcast" color={focused ? colors.tint : colors.tintInactive} size={30} />
          ),
        }}
      />

      <Tab.Screen
        name="Realtime"
        component={RealtimeScreen}
        options={{
          tabBarLabel: realtimeLabel,
          tabBarIcon: ({ focused }) => (
            <Icon icon="view" color={focused ? colors.tint : colors.tintInactive} size={30} />
          ),
        }}
      />
    </Tab.Navigator>
  )
})

const $tabBar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.background,
  borderTopColor: colors.transparent,
})

const $tabBarItem: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingTop: spacing.md,
})

const $tabBarLabel: ThemedStyle<TextStyle> = ({ colors, typography }) => ({
  fontSize: 12,
  fontFamily: typography.primary.medium,
  lineHeight: 16,
  color: colors.text,
})
