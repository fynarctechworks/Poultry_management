import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, spacing, radius, typography } from '../../theme/tokens';

export type ButtonVariant = 'primary' | 'outlineRed' | 'outlineDark';

export interface ButtonProps {
  variant?: ButtonVariant;
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}

export const Button = forwardRef<View, ButtonProps>(
  (
    {
      variant = 'primary',
      label,
      onPress,
      loading = false,
      disabled = false,
      style,
      fullWidth = false,
      accessibilityLabel,
      testID,
    },
    ref,
  ) => {
    const v = VARIANTS[variant];
    const isDisabled = disabled || loading;

    return (
      <Pressable
        ref={ref}
        onPress={isDisabled ? undefined : onPress}
        accessible
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityState={{ disabled: isDisabled, busy: loading }}
        testID={testID}
        style={({ pressed }) => [
          styles.base,
          v.container,
          fullWidth && styles.fullWidth,
          pressed && !isDisabled && styles.pressed,
          isDisabled && styles.disabled,
          style,
        ]}
      >
        {loading ? (
          <ActivityIndicator
            size="small"
            color={variant === 'primary' ? colors.onPrimary : colors.primary}
          />
        ) : (
          <Text style={[styles.label, { color: v.textColor }]}>{label}</Text>
        )}
      </Pressable>
    );
  },
);

Button.displayName = 'Button';

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing['2xl'],
    borderRadius: radius.pillLg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  label: {
    fontSize: typography.buttonMd.fontSize,
    lineHeight: typography.buttonMd.lineHeight,
    fontWeight: typography.buttonMd.fontWeight,
    fontFamily: typography.buttonMd.fontFamily,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.85,
  },
  disabled: {
    opacity: 0.5,
  },
});

type VariantStyle = {
  container: ViewStyle;
  textColor: string;
};

const VARIANTS: Record<ButtonVariant, VariantStyle> = {
  primary: {
    container: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    textColor: colors.onPrimary,
  },
  outlineRed: {
    container: {
      backgroundColor: colors.canvas,
      borderColor: colors.primary,
    },
    textColor: colors.primary,
  },
  outlineDark: {
    container: {
      backgroundColor: colors.canvas,
      borderColor: colors.ink,
    },
    textColor: colors.ink,
  },
};
