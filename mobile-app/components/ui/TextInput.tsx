import { forwardRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ViewStyle,
  KeyboardTypeOptions,
  TextInput as RNTextInput,
} from 'react-native';
import { colors, spacing, radius, typography, state } from '../../theme/tokens';
import { InlineError } from './InlineError';

export interface TextInputProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  error?: string;
  keyboardType?: KeyboardTypeOptions;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoComplete?: string;
  placeholder?: string;
  multiline?: boolean;
  numberOfLines?: number;
  style?: ViewStyle;
  testID?: string;
}

export const TextInput = forwardRef<RNTextInput, TextInputProps>(
  (
    {
      label,
      value,
      onChangeText,
      error,
      keyboardType,
      secureTextEntry = false,
      autoCapitalize = 'sentences',
      autoComplete,
      placeholder,
      multiline = false,
      numberOfLines = 1,
      style,
      testID,
    },
    ref,
  ) => {
    const [focused, setFocused] = useState(false);

    return (
      <View style={[styles.wrapper, style]}>
        {/* Label rendered ABOVE the field — CLAUDE.md mandate: never placeholder-only */}
        <Text style={styles.label}>{label}</Text>
        <RNTextInput
          ref={ref}
          value={value}
          onChangeText={onChangeText}
          keyboardType={keyboardType}
          secureTextEntry={secureTextEntry}
          autoCapitalize={autoCapitalize}
          autoComplete={autoComplete as any}
          placeholder={placeholder}
          placeholderTextColor={colors.bodySoft}
          multiline={multiline}
          numberOfLines={multiline ? numberOfLines : 1}
          testID={testID}
          accessibilityLabel={label}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[
            styles.input,
            multiline && { minHeight: 36 + (numberOfLines - 1) * 20, textAlignVertical: 'top' as const },
            focused && styles.inputFocused,
            !!error && styles.inputError,
          ]}
        />
        {!!error && <InlineError testID={testID ? `${testID}-error` : undefined}>{error}</InlineError>}
      </View>
    );
  },
);

TextInput.displayName = 'TextInput';

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'column',
  },
  label: {
    fontSize: typography.bodySmStrong.fontSize,
    lineHeight: typography.bodySmStrong.lineHeight,
    fontWeight: typography.bodySmStrong.fontWeight,
    fontFamily: typography.bodySmStrong.fontFamily,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  input: {
    minHeight: 36,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: typography.bodyMd.fontSize,
    fontFamily: typography.bodyMd.fontFamily,
    color: colors.ink,
  },
  inputFocused: {
    borderColor: colors.primary,
    borderWidth: state.focusRingWidth,
  },
  inputError: {
    borderColor: colors.danger,
  },
});
