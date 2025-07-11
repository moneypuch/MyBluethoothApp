import { observer } from "mobx-react-lite"
import { FC, useEffect, useState } from "react"
import { ViewStyle, TextStyle, ScrollView, RefreshControl, View, Dimensions } from "react-native"
import { Screen, Text, Card, Button, Icon } from "@/components"
import { DemoTabScreenProps } from "@/navigators/DemoNavigator"
import { spacing, colors } from "@/theme"
import { LineChart, BarChart, PieChart } from "react-native-gifted-charts"

const { width: screenWidth } = Dimensions.get("window")
const chartWidth = screenWidth - spacing.lg * 2 - spacing.md * 2

// Mock data generators for demonstration
const generateVitalSigns = () => {
  const heartRateData = []
  const bloodPressureData = []
  const temperatureData = []
  const currentTime = new Date()

  for (let i = 0; i < 50; i++) {
    const time = new Date(currentTime.getTime() - (49 - i) * 1000)
    const timeLabel = time.toLocaleTimeString().slice(0, 5)

    heartRateData.push({
      value: 70 + Math.random() * 30 + Math.sin(i * 0.1) * 10,
      label: timeLabel,
      labelTextStyle: { color: colors.palette.neutral400, fontSize: 10 },
      dataPointColor: colors.palette.primary500,
    })

    bloodPressureData.push({
      value: 120 + Math.random() * 20 + Math.sin(i * 0.15) * 8,
      label: timeLabel,
      labelTextStyle: { color: colors.palette.neutral400, fontSize: 10 },
      dataPointColor: colors.palette.secondary500,
    })

    temperatureData.push({
      value: 36.5 + Math.random() * 1.5 + Math.sin(i * 0.08) * 0.3,
      label: timeLabel,
      labelTextStyle: { color: colors.palette.neutral400, fontSize: 10 },
      dataPointColor: colors.palette.accent500,
    })
  }

  return { heartRateData, bloodPressureData, temperatureData }
}

const generateSensorData = () => {
  const oxygenData = []
  const currentTime = new Date()

  for (let i = 0; i < 30; i++) {
    const time = new Date(currentTime.getTime() - (29 - i) * 2000)
    oxygenData.push({
      value: 95 + Math.random() * 5 + Math.sin(i * 0.2) * 2,
      label: time.toLocaleTimeString().slice(0, 5),
      labelTextStyle: { color: colors.palette.neutral400, fontSize: 10 },
      dataPointColor: colors.palette.success500,
    })
  }

  return oxygenData
}

const generateMultiSeriesData = () => {
  const data1 = []
  const data2 = []
  const data3 = []

  for (let i = 0; i < 20; i++) {
    const time = new Date(Date.now() - (19 - i) * 5000)
    const timeLabel = time.toLocaleTimeString().slice(0, 5)

    data1.push({
      value: 50 + Math.random() * 40 + Math.sin(i * 0.3) * 15,
      label: timeLabel,
      labelTextStyle: { color: colors.palette.neutral400, fontSize: 9 },
    })

    data2.push({
      value: 60 + Math.random() * 30 + Math.cos(i * 0.25) * 12,
      label: timeLabel,
      labelTextStyle: { color: colors.palette.neutral400, fontSize: 9 },
    })

    data3.push({
      value: 40 + Math.random() * 35 + Math.sin(i * 0.2) * 10,
      label: timeLabel,
      labelTextStyle: { color: colors.palette.neutral400, fontSize: 9 },
    })
  }

  return { data1, data2, data3 }
}

const generatePieData = () => [
  { value: 45, color: colors.palette.primary500, text: "45%" },
  { value: 30, color: colors.palette.secondary500, text: "30%" },
  { value: 15, color: colors.palette.accent500, text: "15%" },
  { value: 10, color: colors.palette.success500, text: "10%" },
]

const generateBarData = () => {
  const data = []
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

  days.forEach((day, index) => {
    data.push({
      value: 60 + Math.random() * 40,
      label: day,
      labelTextStyle: { color: colors.palette.neutral400, fontSize: 12 },
      frontColor: colors.palette.primary500,
      gradientColor: colors.palette.primary300,
    })
  })

  return data
}

export const MedicalChartsScreen: FC<DemoTabScreenProps<"MedicalCharts">> = observer(
  function MedicalChartsScreen() {
    const [isRefreshing, setIsRefreshing] = useState(false)
    const [isStreaming, setIsStreaming] = useState(false)
    const [vitalSigns, setVitalSigns] = useState(generateVitalSigns())
    const [sensorData, setSensorData] = useState(generateSensorData())
    const [multiSeriesData, setMultiSeriesData] = useState(generateMultiSeriesData())
    const [pieData, setPieData] = useState(generatePieData())
    const [barData, setBarData] = useState(generateBarData())

    useEffect(() => {
      let interval: NodeJS.Timeout

      if (isStreaming) {
        interval = setInterval(() => {
          setVitalSigns(generateVitalSigns())
          setSensorData(generateSensorData())
          setMultiSeriesData(generateMultiSeriesData())
          setPieData(generatePieData())
          setBarData(generateBarData())
        }, 1000)
      }

      return () => {
        if (interval) clearInterval(interval)
      }
    }, [isStreaming])

    const onRefresh = async () => {
      setIsRefreshing(true)
      // Simulate data refresh
      await new Promise((resolve) => setTimeout(resolve, 1000))
      setVitalSigns(generateVitalSigns())
      setSensorData(generateSensorData())
      setMultiSeriesData(generateMultiSeriesData())
      setPieData(generatePieData())
      setBarData(generateBarData())
      setIsRefreshing(false)
    }

    const toggleStreaming = () => {
      setIsStreaming(!isStreaming)
    }

    return (
      <Screen preset="fixed" safeAreaEdges={["top"]} contentContainerStyle={$screenContainer}>
        <ScrollView
          style={$scrollView}
          contentContainerStyle={$contentContainer}
          refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} />}
          showsVerticalScrollIndicator={false}
        >
          <Text preset="heading" text="Medical Data Charts" style={$title} />

          {/* Control Panel */}
          <Card
            preset="default"
            headingTx=""
            HeadingComponent={
              <View style={$controlHeader}>
                <Icon icon="heart" color={colors.palette.primary500} size={24} />
                <Text preset="subheading" text="Real-time Control" style={$controlTitle} />
                <View style={$statusIndicator}>
                  <View
                    style={[
                      $statusDot,
                      {
                        backgroundColor: isStreaming
                          ? colors.palette.success500
                          : colors.palette.neutral400,
                      },
                    ]}
                  />
                  <Text text={isStreaming ? "LIVE" : "PAUSED"} style={$statusText} />
                </View>
              </View>
            }
            ContentComponent={
              <View style={$controlContent}>
                <Button
                  text={isStreaming ? "⏸️ Pause Stream" : "▶️ Start Stream"}
                  preset={isStreaming ? "reversed" : "filled"}
                  onPress={toggleStreaming}
                  style={$controlButton}
                />
                <Text
                  text="Simulating real-time data from Bluetooth Classic connection"
                  style={$controlDescription}
                />
              </View>
            }
          />

          {/* Heart Rate Chart */}
          <Card
            preset="default"
            headingTx=""
            HeadingComponent={
              <View style={$chartHeader}>
                <Icon icon="heart" color={colors.palette.primary500} size={20} />
                <Text preset="subheading" text="Heart Rate (BPM)" style={$chartTitle} />
                <Text
                  text={`${vitalSigns.heartRateData[vitalSigns.heartRateData.length - 1]?.value.toFixed(0)} BPM`}
                  style={$currentValue}
                />
              </View>
            }
            ContentComponent={
              <View style={$chartContainer}>
                <LineChart
                  data={vitalSigns.heartRateData}
                  width={chartWidth}
                  height={200}
                  spacing={chartWidth / vitalSigns.heartRateData.length}
                  color={colors.palette.primary500}
                  thickness={3}
                  startFillColor={colors.palette.primary200}
                  endFillColor={colors.palette.primary100}
                  startOpacity={0.8}
                  endOpacity={0.2}
                  initialSpacing={0}
                  noOfSections={5}
                  yAxisColor={colors.palette.neutral400}
                  xAxisColor={colors.palette.neutral400}
                  yAxisTextStyle={{ color: colors.palette.neutral400, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: colors.palette.neutral400, fontSize: 10 }}
                  hideDataPoints={false}
                  dataPointsColor={colors.palette.primary500}
                  dataPointsRadius={3}
                  curved={true}
                  isAnimated={true}
                  animationDuration={500}
                  scrollToEnd={true}
                  hideRules={false}
                  rulesColor={colors.palette.neutral200}
                  rulesType="solid"
                  yAxisOffset={50}
                  maxValue={130}
                  minValue={50}
                />
              </View>
            }
          />

          {/* Blood Pressure Chart */}
          <Card
            preset="default"
            headingTx=""
            HeadingComponent={
              <View style={$chartHeader}>
                <Icon icon="components" color={colors.palette.secondary500} size={20} />
                <Text preset="subheading" text="Blood Pressure (mmHg)" style={$chartTitle} />
                <Text
                  text={`${vitalSigns.bloodPressureData[vitalSigns.bloodPressureData.length - 1]?.value.toFixed(0)} mmHg`}
                  style={$currentValue}
                />
              </View>
            }
            ContentComponent={
              <View style={$chartContainer}>
                <LineChart
                  data={vitalSigns.bloodPressureData}
                  width={chartWidth}
                  height={200}
                  spacing={chartWidth / vitalSigns.bloodPressureData.length}
                  color={colors.palette.secondary500}
                  thickness={3}
                  startFillColor={colors.palette.secondary200}
                  endFillColor={colors.palette.secondary100}
                  startOpacity={0.8}
                  endOpacity={0.2}
                  initialSpacing={0}
                  noOfSections={5}
                  yAxisColor={colors.palette.neutral400}
                  xAxisColor={colors.palette.neutral400}
                  yAxisTextStyle={{ color: colors.palette.neutral400, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: colors.palette.neutral400, fontSize: 10 }}
                  hideDataPoints={false}
                  dataPointsColor={colors.palette.secondary500}
                  dataPointsRadius={3}
                  curved={true}
                  isAnimated={true}
                  animationDuration={500}
                  scrollToEnd={true}
                  hideRules={false}
                  rulesColor={colors.palette.neutral200}
                  rulesType="solid"
                  yAxisOffset={100}
                  maxValue={160}
                  minValue={100}
                />
              </View>
            }
          />

          {/* Temperature Chart */}
          <Card
            preset="default"
            headingTx=""
            HeadingComponent={
              <View style={$chartHeader}>
                <Icon icon="settings" color={colors.palette.accent500} size={20} />
                <Text preset="subheading" text="Body Temperature (°C)" style={$chartTitle} />
                <Text
                  text={`${vitalSigns.temperatureData[vitalSigns.temperatureData.length - 1]?.value.toFixed(1)}°C`}
                  style={$currentValue}
                />
              </View>
            }
            ContentComponent={
              <View style={$chartContainer}>
                <LineChart
                  data={vitalSigns.temperatureData}
                  width={chartWidth}
                  height={200}
                  spacing={chartWidth / vitalSigns.temperatureData.length}
                  color={colors.palette.accent500}
                  thickness={3}
                  startFillColor={colors.palette.accent200}
                  endFillColor={colors.palette.accent100}
                  startOpacity={0.8}
                  endOpacity={0.2}
                  initialSpacing={0}
                  noOfSections={4}
                  yAxisColor={colors.palette.neutral400}
                  xAxisColor={colors.palette.neutral400}
                  yAxisTextStyle={{ color: colors.palette.neutral400, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: colors.palette.neutral400, fontSize: 10 }}
                  hideDataPoints={false}
                  dataPointsColor={colors.palette.accent500}
                  dataPointsRadius={3}
                  curved={true}
                  isAnimated={true}
                  animationDuration={500}
                  scrollToEnd={true}
                  hideRules={false}
                  rulesColor={colors.palette.neutral200}
                  rulesType="solid"
                  yAxisOffset={35}
                  maxValue={39}
                  minValue={35}
                />
              </View>
            }
          />

          {/* Multi-Series Chart */}
          <Card
            preset="default"
            headingTx=""
            HeadingComponent={
              <View style={$chartHeader}>
                <Icon icon="debug" color={colors.palette.primary500} size={20} />
                <Text preset="subheading" text="Multi-Sensor Data" style={$chartTitle} />
                <View style={$legendContainer}>
                  <View style={$legendItem}>
                    <View style={[$legendDot, { backgroundColor: colors.palette.primary500 }]} />
                    <Text text="Sensor 1" style={$legendText} />
                  </View>
                  <View style={$legendItem}>
                    <View style={[$legendDot, { backgroundColor: colors.palette.secondary500 }]} />
                    <Text text="Sensor 2" style={$legendText} />
                  </View>
                  <View style={$legendItem}>
                    <View style={[$legendDot, { backgroundColor: colors.palette.accent500 }]} />
                    <Text text="Sensor 3" style={$legendText} />
                  </View>
                </View>
              </View>
            }
            ContentComponent={
              <View style={$chartContainer}>
                <LineChart
                  data={multiSeriesData.data1}
                  data2={multiSeriesData.data2}
                  data3={multiSeriesData.data3}
                  width={chartWidth}
                  height={250}
                  spacing={chartWidth / multiSeriesData.data1.length}
                  color1={colors.palette.primary500}
                  color2={colors.palette.secondary500}
                  color3={colors.palette.accent500}
                  thickness1={3}
                  thickness2={3}
                  thickness3={3}
                  initialSpacing={0}
                  noOfSections={5}
                  yAxisColor={colors.palette.neutral400}
                  xAxisColor={colors.palette.neutral400}
                  yAxisTextStyle={{ color: colors.palette.neutral400, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: colors.palette.neutral400, fontSize: 10 }}
                  hideDataPoints1={false}
                  hideDataPoints2={false}
                  hideDataPoints3={false}
                  dataPointsColor1={colors.palette.primary500}
                  dataPointsColor2={colors.palette.secondary500}
                  dataPointsColor3={colors.palette.accent500}
                  dataPointsRadius={3}
                  curved={true}
                  isAnimated={true}
                  animationDuration={500}
                  scrollToEnd={true}
                  hideRules={false}
                  rulesColor={colors.palette.neutral200}
                  rulesType="solid"
                  yAxisOffset={0}
                  maxValue={120}
                  minValue={0}
                />
              </View>
            }
          />

          {/* Oxygen Saturation Area Chart */}
          <Card
            preset="default"
            headingTx=""
            HeadingComponent={
              <View style={$chartHeader}>
                <Icon icon="podcast" color={colors.palette.success500} size={20} />
                <Text preset="subheading" text="Oxygen Saturation (%)" style={$chartTitle} />
                <Text
                  text={`${sensorData[sensorData.length - 1]?.value.toFixed(1)}%`}
                  style={$currentValue}
                />
              </View>
            }
            ContentComponent={
              <View style={$chartContainer}>
                <LineChart
                  data={sensorData}
                  width={chartWidth}
                  height={200}
                  spacing={chartWidth / sensorData.length}
                  color={colors.palette.success500}
                  thickness={4}
                  startFillColor={colors.palette.success300}
                  endFillColor={colors.palette.success100}
                  startOpacity={0.9}
                  endOpacity={0.3}
                  initialSpacing={0}
                  noOfSections={4}
                  yAxisColor={colors.palette.neutral400}
                  xAxisColor={colors.palette.neutral400}
                  yAxisTextStyle={{ color: colors.palette.neutral400, fontSize: 10 }}
                  xAxisLabelTextStyle={{ color: colors.palette.neutral400, fontSize: 10 }}
                  hideDataPoints={false}
                  dataPointsColor={colors.palette.success500}
                  dataPointsRadius={4}
                  curved={true}
                  isAnimated={true}
                  animationDuration={500}
                  scrollToEnd={true}
                  hideRules={false}
                  rulesColor={colors.palette.neutral200}
                  rulesType="solid"
                  yAxisOffset={92}
                  maxValue={100}
                  minValue={92}
                />
              </View>
            }
          />

          {/* Statistics Charts Row */}
          <View style={$statisticsRow}>
            {/* Pie Chart */}
            <Card
              preset="default"
              style={$halfCard}
              headingTx=""
              HeadingComponent={
                <View style={$chartHeader}>
                  <Icon icon="heart" color={colors.palette.primary500} size={18} />
                  <Text preset="subheading" text="Activity Distribution" style={$smallChartTitle} />
                </View>
              }
              ContentComponent={
                <View style={$pieChartContainer}>
                  <PieChart
                    data={pieData}
                    radius={60}
                    innerRadius={25}
                    strokeColor={colors.background}
                    strokeWidth={2}
                    showGradient={true}
                    labelsPosition="outward"
                    textColor={colors.palette.neutral400}
                    textSize={12}
                    showValuesAsLabels={true}
                    centerLabelComponent={() => (
                      <View style={$centerLabel}>
                        <Text text="Total" style={$centerLabelText} />
                        <Text text="100%" style={$centerLabelValue} />
                      </View>
                    )}
                  />
                </View>
              }
            />

            {/* Bar Chart */}
            <Card
              preset="default"
              style={$halfCard}
              headingTx=""
              HeadingComponent={
                <View style={$chartHeader}>
                  <Icon icon="components" color={colors.palette.secondary500} size={18} />
                  <Text preset="subheading" text="Weekly Average" style={$smallChartTitle} />
                </View>
              }
              ContentComponent={
                <View style={$barChartContainer}>
                  <BarChart
                    data={barData}
                    width={chartWidth / 2 - spacing.sm}
                    height={150}
                    spacing={8}
                    barWidth={16}
                    roundedTop={true}
                    roundedBottom={false}
                    yAxisThickness={1}
                    xAxisThickness={1}
                    yAxisColor={colors.palette.neutral400}
                    xAxisColor={colors.palette.neutral400}
                    yAxisTextStyle={{ color: colors.palette.neutral400, fontSize: 9 }}
                    xAxisLabelTextStyle={{ color: colors.palette.neutral400, fontSize: 9 }}
                    noOfSections={4}
                    maxValue={120}
                    isAnimated={true}
                    animationDuration={800}
                    showGradient={true}
                    hideRules={false}
                    rulesColor={colors.palette.neutral200}
                    rulesType="solid"
                  />
                </View>
              }
            />
          </View>

          {/* Connection Status */}
          <Card
            preset="default"
            headingTx=""
            HeadingComponent={
              <View style={$statusHeader}>
                <Icon icon="settings" color={colors.palette.accent500} size={20} />
                <Text preset="subheading" text="Bluetooth Connection" style={$chartTitle} />
              </View>
            }
            ContentComponent={
              <View style={$statusContent}>
                <View style={$statusItem}>
                  <Text text="Status:" style={$statusLabel} />
                  <Text text="Ready for Connection" style={$statusValue} />
                </View>
                <View style={$statusItem}>
                  <Text text="Data Rate:" style={$statusLabel} />
                  <Text text={isStreaming ? "1 Hz (Live)" : "Paused"} style={$statusValue} />
                </View>
                <View style={$statusItem}>
                  <Text text="Buffer:" style={$statusLabel} />
                  <Text text="50 samples" style={$statusValue} />
                </View>
              </View>
            }
          />
        </ScrollView>
      </Screen>
    )
  },
)

const $screenContainer: ViewStyle = {
  flex: 1,
}

const $scrollView: ViewStyle = {
  flex: 1,
}

const $contentContainer: ViewStyle = {
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
}

const $title: TextStyle = {
  marginBottom: spacing.lg,
  textAlign: "center",
  color: colors.palette.primary500,
}

const $controlHeader: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: spacing.md,
}

const $controlTitle: TextStyle = {
  marginLeft: spacing.sm,
  flex: 1,
}

const $statusIndicator: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
}

const $statusDot: ViewStyle = {
  width: 8,
  height: 8,
  borderRadius: 4,
  marginRight: spacing.xs,
}

const $statusText: TextStyle = {
  fontSize: 10,
  fontWeight: "bold",
  color: colors.palette.neutral400,
}

const $controlContent: ViewStyle = {
  gap: spacing.sm,
}

const $controlButton: ViewStyle = {
  marginBottom: spacing.xs,
}

const $controlDescription: TextStyle = {
  fontSize: 12,
  fontStyle: "italic",
  color: colors.palette.neutral400,
  textAlign: "center",
}

const $chartHeader: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: spacing.md,
  flexWrap: "wrap",
}

const $chartTitle: TextStyle = {
  marginLeft: spacing.sm,
  flex: 1,
}

const $smallChartTitle: TextStyle = {
  marginLeft: spacing.sm,
  fontSize: 14,
}

const $currentValue: TextStyle = {
  fontSize: 16,
  fontWeight: "bold",
  color: colors.palette.primary500,
}

const $chartContainer: ViewStyle = {
  alignItems: "center",
  backgroundColor: colors.palette.neutral100,
  borderRadius: 8,
  paddingVertical: spacing.md,
  paddingHorizontal: spacing.sm,
}

const $legendContainer: ViewStyle = {
  flexDirection: "row",
  flexWrap: "wrap",
  marginLeft: spacing.sm,
  gap: spacing.sm,
}

const $legendItem: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
}

const $legendDot: ViewStyle = {
  width: 8,
  height: 8,
  borderRadius: 4,
  marginRight: spacing.xs,
}

const $legendText: TextStyle = {
  fontSize: 10,
  color: colors.palette.neutral400,
}

const $statisticsRow: ViewStyle = {
  flexDirection: "row",
  gap: spacing.md,
  marginBottom: spacing.md,
}

const $halfCard: ViewStyle = {
  flex: 1,
}

const $pieChartContainer: ViewStyle = {
  alignItems: "center",
  paddingVertical: spacing.md,
}

const $centerLabel: ViewStyle = {
  alignItems: "center",
}

const $centerLabelText: TextStyle = {
  fontSize: 10,
  color: colors.palette.neutral400,
}

const $centerLabelValue: TextStyle = {
  fontSize: 12,
  fontWeight: "bold",
  color: colors.palette.primary500,
}

const $barChartContainer: ViewStyle = {
  alignItems: "center",
  paddingVertical: spacing.md,
}

const $statusHeader: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  marginBottom: spacing.md,
}

const $statusContent: ViewStyle = {
  gap: spacing.sm,
}

const $statusItem: ViewStyle = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
}

const $statusLabel: TextStyle = {
  fontSize: 14,
  color: colors.palette.neutral400,
}

const $statusValue: TextStyle = {
  fontSize: 14,
  fontWeight: "500",
  color: colors.palette.primary500,
}
