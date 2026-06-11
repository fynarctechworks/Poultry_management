import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, spacing, radius, typography } from '../../theme/tokens';

export interface SegmentOption {
  value: string;
  label: string;
}

export interface SegmentedControlProps {
  options: SegmentOption[];
  value: string;
  onChange: (v: string) => void;
  style?: ViewStyle;
  testID?: string;
}

/**
 * View toggle (blueprint §4.3) — e.g. Khata: All/Aging; Health:
 * Incidents/Vaccinations. Replaces react-native-paper's SegmentedButtons.
 */
export function SegmentedControl({ options, value, onChange, style, testID }: SegmentedControlProps) {
  return (
    <View style={[styles.track, style]} testID={testID} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            style={[styles.segment, selected && styles.segmentSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.muteSoft,
    borderRadius: radius.lg,
    padding: spacing.xxs,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg - 2,
    paddingHorizontal: spacing.md,
  },
  segmentSelected: {
    backgroundColor: colors.primary,
  },
  label: {
    fontSize: typography.bodySmStrong.fontSize,
    lineHeight: typography.bodySmStrong.lineHeight,
    fontWeight: typography.bodySmStrong.fontWeight,
    fontFamily: typography.bodySmStrong.fontFamily,
    color: colors.body,
  },
  labelSelected: {
    color: colors.onPrimary,
  },
});
