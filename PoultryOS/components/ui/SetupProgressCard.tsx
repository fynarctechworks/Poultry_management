import { StyleSheet, Text, View, Pressable } from 'react-native';
import { Check, ChevronRight } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { Button } from './Button';

export interface SetupStep {
  key: string;
  label: string;
  description?: string;
  done: boolean;
  ctaLabel: string;
  onPress: () => void;
}

export interface SetupProgressCardProps {
  title: string;
  /** "{{done}} of {{total}} done" — caller pre-formats. */
  progressLabel: string;
  steps: SetupStep[];
  testID?: string;
}

export function SetupProgressCard({ title, progressLabel, steps, testID }: SetupProgressCardProps) {
  const doneCount = steps.filter((s) => s.done).length;
  const pct = steps.length > 0 ? doneCount / steps.length : 0;
  // First not-done step is the "active" one we push with a primary CTA.
  const activeIndex = steps.findIndex((s) => !s.done);

  return (
    <View style={styles.card} testID={testID}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.progressLabel}>{progressLabel}</Text>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
      </View>

      <View style={styles.steps}>
        {steps.map((step, idx) => {
          const isActive = idx === activeIndex;
          if (step.done) {
            return (
              <View key={step.key} style={styles.row}>
                <View style={[styles.tick, styles.tickDone]}>
                  <Check size={14} color={colors.onPrimary} />
                </View>
                <Text style={[styles.rowLabel, styles.rowLabelDone]}>{step.label}</Text>
              </View>
            );
          }
          return (
            <Pressable
              key={step.key}
              onPress={step.onPress}
              style={styles.row}
              accessibilityRole="button"
              accessibilityLabel={step.label}
            >
              <View style={[styles.tick, isActive && styles.tickActive]} />
              <View style={styles.rowTextCol}>
                <Text style={styles.rowLabel}>{step.label}</Text>
                {isActive && !!step.description && (
                  <Text style={styles.rowDescription}>{step.description}</Text>
                )}
              </View>
              {!isActive && <ChevronRight size={18} color={colors.bodySoft} />}
            </Pressable>
          );
        })}
      </View>

      {activeIndex >= 0 && (
        <Button
          variant="primary"
          label={steps[activeIndex].ctaLabel}
          onPress={steps[activeIndex].onPress}
          fullWidth
          style={styles.cta}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: { ...typography.bodyMdStrong, color: colors.ink },
  progressLabel: { ...typography.bodySm, color: colors.body },
  track: {
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.muteSoft,
    overflow: 'hidden',
    marginTop: spacing.xxs,
    marginBottom: spacing.sm,
  },
  fill: { height: 6, borderRadius: radius.full, backgroundColor: colors.primary },
  steps: { gap: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 40 },
  rowTextCol: { flex: 1, gap: spacing.xxs },
  tick: {
    width: 22, height: 22, borderRadius: radius.full,
    borderWidth: 2, borderColor: colors.mute,
    alignItems: 'center', justifyContent: 'center',
  },
  tickActive: { borderColor: colors.primary },
  tickDone: { backgroundColor: colors.success, borderColor: colors.success },
  rowLabel: { ...typography.bodyMd, color: colors.ink, flex: 1 },
  rowLabelDone: { ...typography.bodyMd, color: colors.bodySoft, textDecorationLine: 'line-through' },
  rowDescription: { ...typography.caption, color: colors.body },
  cta: { marginTop: spacing.sm },
});
