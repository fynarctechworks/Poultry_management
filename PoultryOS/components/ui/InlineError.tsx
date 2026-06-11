import { StyleSheet, Text, TextStyle } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';

export interface InlineErrorProps {
  children: React.ReactNode;
  style?: TextStyle;
  testID?: string;
}

/** Field-level error line — replaces react-native-paper's HelperText. */
export function InlineError({ children, style, testID }: InlineErrorProps) {
  if (!children) return null;
  return (
    <Text style={[styles.text, style]} accessibilityLiveRegion="polite" testID={testID}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: typography.bodySm.fontSize,
    lineHeight: typography.bodySm.lineHeight,
    fontWeight: typography.bodySm.fontWeight,
    fontFamily: typography.bodySm.fontFamily,
    color: colors.danger,
    marginTop: spacing.xs,
  },
});
