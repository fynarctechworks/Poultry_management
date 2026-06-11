import { ReactNode } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { colors, spacing } from '../../theme/tokens';

export interface TimelineProps {
  /** Typically VaccinationCard[] or any vertical sequence of nodes. */
  children: ReactNode;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Generic vertical timeline wrapper.
 *
 * Renders children in a column with a 2 px muted line running down the
 * left gutter.  Each child manages its own status indicator dot (the line
 * is intentionally separate so any node type can be slotted in).
 */
export function Timeline({ children, style, testID }: TimelineProps) {
  return (
    <View style={[styles.container, style]} testID={testID}>
      {/* Vertical connector line — left gutter */}
      <View style={styles.line} />
      {/* Children stacked with gap */}
      <View style={styles.items}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
  },
  line: {
    width: 2,
    backgroundColor: colors.mute,
    marginTop: spacing.xl,      // starts below the first dot
    marginBottom: spacing.xl,   // ends above the last dot
    marginLeft: spacing.md,     // aligns with the dot centre in VaccinationCard
    borderRadius: 1,
  },
  items: {
    flex: 1,
    marginLeft: spacing.md,
    gap: spacing.md,
  },
});
