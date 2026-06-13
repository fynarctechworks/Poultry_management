import React from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';
import { MessageCircle } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export interface WhatsAppShareButtonProps {
  phone: string;
  message: string;
  label?: string;
  disabled?: boolean;
  testID?: string;
}

function normalisePhone(raw: string): string {
  // wa.me wants digits only, no '+', no spaces.
  return raw.replace(/[^\d]/g, '');
}

export function WhatsAppShareButton({
  phone,
  message,
  label = 'Send WhatsApp',
  disabled = false,
  testID,
}: WhatsAppShareButtonProps) {
  const onPress = async () => {
    const digits = normalisePhone(phone);
    const url = `whatsapp://send?phone=${digits}&text=${encodeURIComponent(message)}`;
    const fallback = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
    try {
      const ok = await Linking.canOpenURL(url);
      await Linking.openURL(ok ? url : fallback);
    } catch {
      await Linking.openURL(fallback);
    }
  };

  return (
    <Pressable
      style={[styles.btn, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      testID={testID}
    >
      <MessageCircle size={18} color={colors.onPrimary} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.whatsapp,
    borderRadius: radius.pillLg,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    ...typography.bodyMdStrong,
    color: colors.onPrimary,
  },
});
