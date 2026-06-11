import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { CircleAlert } from 'lucide-react-native';
import { colors, spacing, radius, typography } from '../../theme/tokens';
import { Button } from './Button';

export interface ErrorStateProps {
  title?: string;
  message?: string;
  /** Retry CTA wired to the failed loader — error recovery, not error display (blueprint §9.5). */
  onRetry?: () => void;
  retryLabel?: string;
  style?: ViewStyle;
  testID?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  message = 'We could not load this. Check your connection and try again.',
  onRetry,
  retryLabel = 'Retry',
  style,
  testID,
}: ErrorStateProps) {
  return (
    <View style={[styles.frame, style]} testID={testID ?? 'error-state'}>
      <CircleAlert size={32} color={colors.danger} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {onRetry && (
        <Button variant="outlineDark" label={retryLabel} onPress={onRetry} style={styles.retry} />
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
  title: {
    fontSize: typography.displayXs.fontSize,
    lineHeight: typography.displayXs.lineHeight,
    fontWeight: typography.displayXs.fontWeight,
    fontFamily: typography.displayXs.fontFamily,
    color: colors.ink,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  message: {
    fontSize: typography.bodyMd.fontSize,
    lineHeight: typography.bodyMd.lineHeight,
    fontWeight: typography.bodyMd.fontWeight,
    fontFamily: typography.bodyMd.fontFamily,
    color: colors.body,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  retry: {
    marginTop: spacing.xl,
    alignSelf: 'center',
  },
});
