import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDDMMMYYYY } from '../../lib/format-date';
import { Button } from './Button';
import { Card } from './Card';

export interface VaccinationCardProps {
  vaccineName: string;
  scheduledDate: string;         // ISO date
  administeredDate?: string | null;
  status: 'scheduled' | 'done' | 'overdue';
  route?: 'oral' | 'injection' | 'spray' | null;
  dose?: string | null;
  onMarkDone?: () => void;       // shown only when status !== 'done'
  style?: ViewStyle;
  testID?: string;
}

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

type StatusConfig = {
  dotColor: string;
  chipBg: string;
  chipText: string;
};

const STATUS_CONFIG: Record<VaccinationCardProps['status'], StatusConfig> = {
  done: {
    dotColor: colors.success,
    chipBg: colors.successSoft,
    chipText: colors.success,
  },
  overdue: {
    dotColor: colors.warning,
    chipBg: colors.warningSoft,
    chipText: colors.warning,
  },
  scheduled: {
    dotColor: colors.mute,
    chipBg: colors.canvasSoft,
    chipText: colors.body,
  },
};

function buildSubLine(
  t: TFunction,
  status: VaccinationCardProps['status'],
  scheduledDate: string,
  administeredDate?: string | null,
  route?: string | null,
  dose?: string | null,
): string {
  const parts: string[] = [];

  // Date part
  if (status === 'done' && administeredDate) {
    parts.push(t('vaccinations.given', { date: formatDDMMMYYYY(administeredDate) }));
  } else {
    parts.push(t('vaccinations.due', { date: formatDDMMMYYYY(scheduledDate) }));
  }

  // Route + dose
  if (route) parts.push(t(`vaccinations.route.${route}`));
  if (dose) parts.push(dose);

  return parts.join(' · ');
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VaccinationCard({
  vaccineName,
  scheduledDate,
  administeredDate,
  status,
  route,
  dose,
  onMarkDone,
  style,
  testID,
}: VaccinationCardProps) {
  const { t } = useTranslation();
  const cfg = STATUS_CONFIG[status];
  const subLine = buildSubLine(t, status, scheduledDate, administeredDate, route, dose);
  const showMarkDone = status !== 'done' && !!onMarkDone;

  return (
    <Card
      style={StyleSheet.flatten([styles.card, style])}
      testID={testID}
    >
      <View style={styles.row}>
        {/* Left status indicator dot */}
        <View style={[styles.dot, { backgroundColor: cfg.dotColor }]} />

        {/* Main content */}
        <View style={styles.content}>
          <View style={styles.topRow}>
            <Text style={styles.name} numberOfLines={2}>
              {vaccineName}
            </Text>
            {/* Status chip — right-aligned */}
            <View style={[styles.chip, { backgroundColor: cfg.chipBg }]}>
              <Text style={[styles.chipLabel, { color: cfg.chipText }]}>
                {t(`vaccinations.status.${status}`)}
              </Text>
            </View>
          </View>

          <Text style={styles.subLine} numberOfLines={1}>
            {subLine}
          </Text>

          {showMarkDone && (
            <Button
              variant="outlineRed"
              label={t('vaccinations.mark_done')}
              onPress={onMarkDone!}
              style={styles.markDoneButton}
              testID={testID ? `${testID}-mark-done` : undefined}
            />
          )}
        </View>
      </View>
    </Card>
  );
}

const DOT_SIZE = 12;

const styles = StyleSheet.create({
  card: {
    // Card already sets canvas bg, mute border, card radius, lg padding
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  dot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    marginTop: spacing.sm,       // nudge into visual centre of first text line
    flexShrink: 0,
  },
  content: {
    flex: 1,
    gap: spacing.xs,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    fontSize: typography.bodyMdStrong.fontSize,
    lineHeight: typography.bodyMdStrong.lineHeight,
    fontWeight: typography.bodyMdStrong.fontWeight,
    fontFamily: typography.bodyMdStrong.fontFamily,
    color: colors.ink,
  },
  chip: {
    alignSelf: 'flex-start',
    borderRadius: radius.pillMd,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    flexShrink: 0,
  },
  chipLabel: {
    fontSize: typography.captionStrong.fontSize,
    lineHeight: typography.captionStrong.lineHeight,
    fontWeight: typography.captionStrong.fontWeight,
    fontFamily: typography.captionStrong.fontFamily,
  },
  subLine: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    fontWeight: typography.caption.fontWeight,
    fontFamily: typography.caption.fontFamily,
    color: colors.body,
  },
  markDoneButton: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
});
