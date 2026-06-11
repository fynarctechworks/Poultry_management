import { AlertTriangle, Thermometer } from 'lucide-react-native';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';
import { Card } from './Card';

export interface WeatherWidgetProps {
  currentTempC: number | null;
  currentHumidity: number | null;
  maxTempToday: number | null;
  heatStressThreshold: number;
  alertSeverity?: 'warning' | 'critical' | null;
  lastFetchedAt?: Date | null;
  onPress?: () => void;
  loading?: boolean;
  testID?: string;
  style?: ViewStyle;
}

export function WeatherWidget({
  currentTempC,
  currentHumidity,
  maxTempToday,
  heatStressThreshold,
  alertSeverity,
  onPress,
  loading = false,
  testID,
  style,
}: WeatherWidgetProps) {
  const hasAlert = alertSeverity === 'warning' || alertSeverity === 'critical';

  if (loading) {
    return (
      <Card style={StyleSheet.flatten([styles.card, style])} testID={testID}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </Card>
    );
  }

  if (hasAlert) {
    return (
      <Card
        onPress={onPress}
        style={StyleSheet.flatten([styles.card, styles.alertCard, style])}
        testID={testID}
      >
        {/* Alert header row */}
        <View style={styles.headerRow}>
          <AlertTriangle size={20} color={colors.onPrimary} />
          <Text style={[styles.alertLabel]}>
            {alertSeverity === 'critical' ? 'Critical heat alert' : 'Heat alert'}
          </Text>
        </View>

        {/* Temp + humidity row */}
        <View style={styles.tempRow}>
          <Text style={styles.tempAlertText}>
            {currentTempC !== null ? `${currentTempC}°C` : '--'}
          </Text>
          {currentHumidity !== null && (
            <Text style={styles.humidityAlertText}>{currentHumidity}% RH</Text>
          )}
        </View>

        {/* Sub-line */}
        <Text style={styles.subLineAlert}>
          {`Today max: ${maxTempToday !== null ? `${maxTempToday}°C` : '--'} · Threshold: ${heatStressThreshold}°C`}
        </Text>
      </Card>
    );
  }

  return (
    <Card
      onPress={onPress}
      style={StyleSheet.flatten([styles.card, style])}
      testID={testID}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <Thermometer size={20} color={colors.body} />
        <Text style={styles.headerLabel}>Weather</Text>
      </View>

      {/* Temp + humidity row */}
      <View style={styles.tempRow}>
        <Text style={styles.tempText}>
          {currentTempC !== null ? `${currentTempC}°C` : '--'}
        </Text>
        {currentHumidity !== null && (
          <Text style={styles.humidityText}>{currentHumidity}% RH</Text>
        )}
      </View>

      {/* Sub-line */}
      <Text style={styles.subLine}>
        {`Today max: ${maxTempToday !== null ? `${maxTempToday}°C` : '--'} · Threshold: ${heatStressThreshold}°C`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    minHeight: 44,
  },
  alertCard: {
    backgroundColor: colors.heat,
    borderColor: colors.heat,
  },
  loadingContainer: {
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.xs,
  },
  headerLabel: {
    fontSize: typography.captionUppercase.fontSize,
    lineHeight: typography.captionUppercase.lineHeight,
    fontWeight: typography.captionUppercase.fontWeight,
    fontFamily: typography.captionUppercase.fontFamily,
    letterSpacing: typography.captionUppercase.letterSpacing,
    textTransform: typography.captionUppercase.textTransform,
    color: colors.body,
  },
  alertLabel: {
    fontSize: typography.captionUppercase.fontSize,
    lineHeight: typography.captionUppercase.lineHeight,
    fontWeight: typography.captionUppercase.fontWeight,
    fontFamily: typography.captionUppercase.fontFamily,
    letterSpacing: typography.captionUppercase.letterSpacing,
    textTransform: typography.captionUppercase.textTransform,
    color: colors.onPrimary,
  },
  tempRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: spacing.xs,
  },
  tempText: {
    fontSize: typography.displayLg.fontSize,
    lineHeight: typography.displayLg.lineHeight,
    fontWeight: typography.displayLg.fontWeight,
    fontFamily: typography.displayLg.fontFamily,
    color: colors.ink,
  },
  humidityText: {
    fontSize: typography.bodySm.fontSize,
    lineHeight: typography.bodySm.lineHeight,
    fontWeight: typography.bodySm.fontWeight,
    fontFamily: typography.bodySm.fontFamily,
    color: colors.body,
    marginBottom: spacing.xs,
  },
  tempAlertText: {
    fontSize: typography.displayLg.fontSize,
    lineHeight: typography.displayLg.lineHeight,
    fontWeight: typography.displayLg.fontWeight,
    fontFamily: typography.displayLg.fontFamily,
    color: colors.onPrimary,
  },
  humidityAlertText: {
    fontSize: typography.bodySm.fontSize,
    lineHeight: typography.bodySm.lineHeight,
    fontWeight: typography.bodySm.fontWeight,
    fontFamily: typography.bodySm.fontFamily,
    color: colors.onPrimary,
    marginBottom: spacing.xs,
  },
  subLine: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    fontWeight: typography.caption.fontWeight,
    fontFamily: typography.caption.fontFamily,
    color: colors.body,
  },
  subLineAlert: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    fontWeight: typography.caption.fontWeight,
    fontFamily: typography.caption.fontFamily,
    color: colors.onPrimary,
  },
});
