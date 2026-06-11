import { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme/tokens';
import { Button } from './Button';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
  testID?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  style,
  testID,
}: EmptyStateProps) {
  const hasAction = !!actionLabel && !!onAction;

  return (
    <View style={[styles.frame, style]} testID={testID}>
      {!!icon && <View style={styles.iconWrapper}>{icon}</View>}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {hasAction && (
        <Button
          variant="primary"
          label={actionLabel}
          onPress={onAction}
          style={styles.action}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.card,
    padding: spacing['3xl'],
    alignItems: 'center',
  },
  iconWrapper: {
    marginBottom: spacing.lg,
  },
  title: {
    fontSize: typography.displayXs.fontSize,
    lineHeight: typography.displayXs.lineHeight,
    fontWeight: typography.displayXs.fontWeight,
    fontFamily: typography.displayXs.fontFamily,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  description: {
    fontSize: typography.bodyMd.fontSize,
    lineHeight: typography.bodyMd.lineHeight,
    fontWeight: typography.bodyMd.fontWeight,
    fontFamily: typography.bodyMd.fontFamily,
    color: colors.body,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  action: {
    marginTop: spacing.xl,
    alignSelf: 'center',
  },
});
