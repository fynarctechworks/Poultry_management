import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Check, ChevronDown } from 'lucide-react-native';
import { colors, spacing, radius, typography, state, elevation } from '../../theme/tokens';
import { InlineError } from './InlineError';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps {
  label: string;
  options: SelectOption[];
  value: string | null;
  onChange: (v: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  testID?: string;
}

export function Select({
  label,
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  error,
  disabled = false,
  testID,
}: SelectProps) {
  const [open, setOpen] = useState(false);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? null;

  const handleSelect = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  return (
    <View style={styles.wrapper} testID={testID}>
      {/* Label above field — CLAUDE.md mandate */}
      <Text style={styles.label}>{label}</Text>

      <Pressable
        onPress={() => {
          if (!disabled) setOpen(true);
        }}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled, expanded: open }}
        style={[
          styles.anchor,
          !!error && styles.anchorError,
          disabled && styles.anchorDisabled,
        ]}
      >
        <Text
          style={[styles.anchorText, !selectedLabel && styles.placeholderText]}
          numberOfLines={1}
        >
          {selectedLabel ?? placeholder}
        </Text>
        <ChevronDown size={16} color={colors.body} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close">
          <View style={styles.sheet} onStartShouldSetResponder={() => true}>
            <Text style={styles.sheetTitle}>{label}</Text>
            <FlatList
              data={options}
              keyExtractor={(o) => o.value}
              style={styles.list}
              renderItem={({ item }) => {
                const selected = item.value === value;
                return (
                  <Pressable
                    onPress={() => handleSelect(item.value)}
                    style={[styles.menuItem, selected && styles.menuItemSelected]}
                    accessibilityRole="menuitem"
                    accessibilityLabel={item.label}
                    accessibilityState={{ selected }}
                  >
                    <Text style={styles.menuItemText} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {selected && <Check size={16} color={colors.primary} />}
                  </Pressable>
                );
              }}
            />
          </View>
        </Pressable>
      </Modal>

      {!!error && <InlineError>{error}</InlineError>}
    </View>
  );
}

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
  anchor: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: radius.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.canvas,
  },
  anchorError: {
    borderColor: colors.danger,
  },
  anchorDisabled: {
    opacity: state.disabledOpacity,
  },
  anchorText: {
    flex: 1,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: typography.bodyMd.lineHeight,
    fontWeight: typography.bodyMd.fontWeight,
    fontFamily: typography.bodyMd.fontFamily,
    color: colors.ink,
    marginRight: spacing.xs,
  },
  placeholderText: {
    color: colors.body,
  },
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderRadius: radius.card,
    paddingVertical: spacing.sm,
    maxHeight: '70%',
    ...elevation.subtle,
  },
  sheetTitle: {
    fontSize: typography.bodySmStrong.fontSize,
    lineHeight: typography.bodySmStrong.lineHeight,
    fontWeight: typography.bodySmStrong.fontWeight,
    fontFamily: typography.bodySmStrong.fontFamily,
    color: colors.body,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  list: {
    flexGrow: 0,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  menuItemSelected: {
    backgroundColor: colors.primarySubtle,
  },
  menuItemText: {
    flex: 1,
    fontSize: typography.bodyMd.fontSize,
    lineHeight: typography.bodyMd.lineHeight,
    fontWeight: typography.bodyMd.fontWeight,
    fontFamily: typography.bodyMd.fontFamily,
    color: colors.ink,
  },
});
