import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography, radius } from '../../theme/tokens';
import { Card } from './Card';

// A single shed cell for the farm-map grid. Occupancy is the summed live bird
// count of the shed's active batches; capacity drives the fill bar.
export interface ShedCell {
  id: string;
  shedName: string;
  capacity: number | null;
  birdCount: number;
  batchCode: string | null;
  extraBatches: number; // active batches beyond the first
}

export interface ShedMapProps {
  sheds: ShedCell[];
  onPressShed?: (shed: ShedCell) => void;
  emptyLabel: string;
  birdsLabel: string;
  moreLabel: (n: number) => string;
  style?: ViewStyle;
}

export function ShedMap({
  sheds,
  onPressShed,
  emptyLabel,
  birdsLabel,
  moreLabel,
  style,
}: ShedMapProps) {
  return (
    <View style={[styles.grid, style]}>
      {sheds.map((shed) => {
        const occupied = shed.batchCode != null && shed.birdCount > 0;
        const pct =
          shed.capacity && shed.capacity > 0
            ? Math.min(100, Math.round((shed.birdCount / shed.capacity) * 100))
            : null;
        return (
          <Card
            key={shed.id}
            style={styles.cell}
            onPress={onPressShed ? () => onPressShed(shed) : undefined}
          >
            <Text style={styles.shedName} numberOfLines={1}>
              {shed.shedName}
            </Text>

            {occupied ? (
              <>
                <Text style={styles.birds}>
                  {shed.birdCount.toLocaleString('en-IN')}
                </Text>
                <Text style={styles.birdsLabel}>{birdsLabel}</Text>
                <Text style={styles.batchCode} numberOfLines={1}>
                  {shed.batchCode}
                  {shed.extraBatches > 0 ? ` · ${moreLabel(shed.extraBatches)}` : ''}
                </Text>
                {pct != null && (
                  <View style={styles.barTrack}>
                    <View style={[styles.barFill, { width: `${pct}%` }]} />
                  </View>
                )}
              </>
            ) : (
              <Text style={styles.empty}>{emptyLabel}</Text>
            )}
          </Card>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  cell: {
    flexGrow: 1,
    flexBasis: '46%',
    minHeight: 96,
    gap: spacing.xxs,
  },
  shedName: {
    ...typography.captionUppercase,
    color: colors.body,
  },
  birds: {
    ...typography.displayXs,
    color: colors.primary,
  },
  birdsLabel: {
    ...typography.caption,
    color: colors.bodySoft,
    marginTop: -spacing.xxs,
  },
  batchCode: {
    ...typography.captionStrong,
    color: colors.ink,
    marginTop: spacing.xxs,
  },
  barTrack: {
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.mute,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  empty: {
    ...typography.bodyMd,
    color: colors.bodySoft,
    marginTop: spacing.sm,
  },
});
