import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatINR as sharedINR, formatNumber as sharedNum } from '@poultryos/shared';

export interface BuyerCardProps {
  buyerName: string;
  currentBalance: number;
  lastTransactionDate?: string | null;
  onPress?: () => void;
  testID?: string;
}

function formatINR(amount: number): string {
  return sharedINR(Math.abs(amount), { decimals: 2 });
}

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

export function BuyerCard({
  buyerName,
  currentBalance,
  lastTransactionDate,
  onPress,
  testID,
}: BuyerCardProps) {
  const lastDate = formatDate(lastTransactionDate);
  const owes = currentBalance > 0;

  const content = (
    <>
      <View style={styles.headerRow}>
        <Text style={styles.name} numberOfLines={1}>{buyerName}</Text>
        <Text
          style={[
            styles.amount,
            owes ? styles.amountOwed : styles.amountClear,
          ]}
        >
          {formatINR(currentBalance)}
        </Text>
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.metaLabel}>
          {owes ? 'Buyer owes you' : currentBalance < 0 ? 'You owe buyer' : 'Settled'}
        </Text>
        {lastDate && <Text style={styles.metaDate}>{lastDate}</Text>}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={styles.card}
        onPress={onPress}
        accessibilityRole="button"
        testID={testID}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View style={styles.card} testID={testID}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas,
    borderColor: colors.mute,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.xs,
    minHeight: 44,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  name: {
    ...typography.bodyMdStrong,
    color: colors.ink,
    flex: 1,
  },
  amount: {
    ...typography.bodyMdStrong,
  },
  amountOwed: {
    color: colors.primary,
  },
  amountClear: {
    color: colors.ink,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaLabel: {
    ...typography.captionStrong,
    color: colors.body,
  },
  metaDate: {
    ...typography.captionStrong,
    color: colors.body,
  },
});
