import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Thermometer } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { Button } from './Button';

export interface HeatStressBannerProps {
  severity: 'warning' | 'critical';
  maxTempForecast: number | null;
  mitigationActions: string[];
  onAcknowledge: () => void;
  acknowledging?: boolean;
  testID?: string;
}

const FALLBACK_ACTION = 'Increase water, run foggers, reduce feed by 20%.';

export function HeatStressBanner({
  severity,
  maxTempForecast,
  mitigationActions,
  onAcknowledge,
  acknowledging = false,
  testID,
}: HeatStressBannerProps) {
  const title =
    severity === 'critical' ? 'Critical heat alert' : 'Heat alert';
  const tempLabel =
    maxTempForecast === null || Number.isNaN(maxTempForecast)
      ? 'Forecast max --°C'
      : `Forecast max ${maxTempForecast.toFixed(1)}°C`;
  const actions =
    mitigationActions.length > 0 ? mitigationActions : [FALLBACK_ACTION];

  return (
    <View
      style={styles.container}
      accessibilityRole="alert"
      testID={testID}
    >
      <View style={styles.titleRow}>
        <Thermometer size={22} color={colors.onDark} />
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.forecast}>{tempLabel}</Text>

      <View style={styles.actions}>
        {actions.map((action, i) => (
          <View key={i} style={styles.actionRow}>
            <Text style={styles.bullet}>•</Text>
            <Text style={styles.actionText}>{action}</Text>
          </View>
        ))}
      </View>

      <Button
        variant="outlineDark"
        label={acknowledging ? 'Acknowledging…' : 'Acknowledge'}
        onPress={onAcknowledge}
        disabled={acknowledging}
        style={styles.ackButton}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.heat,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    ...typography.bodyMdStrong,
    color: colors.onDark,
  },
  forecast: {
    ...typography.bodyMd,
    color: colors.onDark,
  },
  actions: {
    marginTop: spacing.xs,
    gap: spacing.xs,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bullet: {
    ...typography.bodyMd,
    color: colors.onDark,
    width: spacing.md,
    textAlign: 'center',
  },
  actionText: {
    ...typography.bodyMd,
    color: colors.onDark,
    flex: 1,
  },
  ackButton: {
    marginTop: spacing.sm,
    minHeight: 44,
  },
});
