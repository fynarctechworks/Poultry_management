import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme/tokens';
import { InlineError } from './InlineError';

export interface RadioOption {
  value: string;
  label: string;
  description?: string;
}

export interface RadioGroupProps {
  label: string;
  options: RadioOption[];
  value: string | null;
  onChange: (v: string) => void;
  error?: string;
  style?: ViewStyle;
  testID?: string;
}

export function RadioGroup({
  label,
  options,
  value,
  onChange,
  error,
  style,
  testID,
}: RadioGroupProps) {
  return (
    <View style={[styles.wrapper, style]} testID={testID} accessibilityRole="radiogroup">
      <Text style={styles.groupLabel}>{label}</Text>

      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <View
            key={option.value}
            style={index < options.length - 1 ? styles.optionGap : undefined}
          >
            <Pressable
              onPress={() => onChange(option.value)}
              accessibilityRole="radio"
              accessibilityLabel={option.label}
              accessibilityState={{ selected }}
              style={styles.radioItem}
            >
              <View style={[styles.circle, selected && styles.circleSelected]}>
                {selected && <View style={styles.dot} />}
              </View>
              <Text style={styles.optionLabel}>{option.label}</Text>
            </Pressable>
            {!!option.description && (
              <Text style={styles.optionDescription}>{option.description}</Text>
            )}
          </View>
        );
      })}

      {!!error && <InlineError>{error}</InlineError>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'column',
  },
  groupLabel: {
    fontSize: typography.bodySmStrong.fontSize,
    lineHeight: typography.bodySmStrong.lineHeight,
    fontWeight: typography.bodySmStrong.fontWeight,
    fontFamily: typography.bodySmStrong.fontFamily,
    color: colors.ink,
    marginBottom: spacing.xs,
  },
  optionGap: {
    marginBottom: spacing.sm,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.bodySoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  circleSelected: {
    borderColor: colors.primary,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
  },
  optionLabel: {
    fontSize: typography.bodyMd.fontSize,
    lineHeight: typography.bodyMd.lineHeight,
    fontWeight: typography.bodyMd.fontWeight,
    fontFamily: typography.bodyMd.fontFamily,
    color: colors.ink,
    flex: 1,
  },
  optionDescription: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    fontWeight: typography.caption.fontWeight,
    fontFamily: typography.caption.fontFamily,
    color: colors.body,
    marginLeft: 32, // circle (20) + its right margin (12), aligns with label
    marginTop: -spacing.xs,
  },
});
