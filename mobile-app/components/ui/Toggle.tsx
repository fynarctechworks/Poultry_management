import { StyleSheet, Switch, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, typography, state } from '../../theme/tokens';

export interface ToggleProps {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  description?: string;
  disabled?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export function Toggle({
  label,
  value,
  onValueChange,
  description,
  disabled = false,
  style,
  testID,
}: ToggleProps) {
  return (
    <View
      style={[styles.row, disabled && styles.disabled, style]}
      testID={testID}
      accessible
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
    >
      <View style={styles.textBlock}>
        <Text style={styles.label}>{label}</Text>
        {!!description && (
          <Text style={styles.description}>{description}</Text>
        )}
      </View>
      <Switch
        value={value}
        onValueChange={disabled ? undefined : onValueChange}
        disabled={disabled}
        trackColor={{ false: colors.mute, true: colors.primary }}
        thumbColor={colors.canvas}
        // Min touch area satisfied by the containing row's paddingVertical
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  disabled: {
    opacity: state.disabledOpacity,
  },
  textBlock: {
    flex: 1,
    marginRight: spacing.lg,
  },
  label: {
    fontSize: typography.bodyMdStrong.fontSize,
    lineHeight: typography.bodyMdStrong.lineHeight,
    fontWeight: typography.bodyMdStrong.fontWeight,
    fontFamily: typography.bodyMdStrong.fontFamily,
    color: colors.ink,
  },
  description: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    fontWeight: typography.caption.fontWeight,
    fontFamily: typography.caption.fontFamily,
    color: colors.body,
    marginTop: spacing.xs,
  },
});
