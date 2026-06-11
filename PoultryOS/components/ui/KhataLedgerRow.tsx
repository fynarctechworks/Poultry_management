import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatINR as sharedINR, formatNumber as sharedNum } from '@poultryos/shared';

export interface KhataLedgerRowProps {
  amount: number;
  transactionType: 'income' | 'expense';
  paymentStatus: 'paid' | 'pending' | 'partial';
  transactionDate: string;
  dueDate?: string | null;
  notes?: string | null;
  testID?: string;
}

function formatINR(n: number): string {
  return sharedINR(Math.abs(n), { decimals: 2 });
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  return `${String(d.getDate()).padStart(2, '0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

const STATUS_LABEL: Record<KhataLedgerRowProps['paymentStatus'], string> = {
  paid: 'Paid',
  pending: 'Pending',
  partial: 'Partial',
};

export function KhataLedgerRow({
  amount,
  transactionType,
  paymentStatus,
  transactionDate,
  dueDate,
  notes,
  testID,
}: KhataLedgerRowProps) {
  const isIncome = transactionType === 'income';
  const sign = isIncome ? '+' : '-';
  const amountColor =
    paymentStatus === 'paid' && isIncome
      ? styles.amountSettled
      : paymentStatus === 'pending'
        ? styles.amountPending
        : styles.amountDefault;

  return (
    <View style={styles.row} testID={testID}>
      <View style={styles.leftCol}>
        <Text style={styles.date}>{formatDate(transactionDate)}</Text>
        {notes ? (
          <Text style={styles.notes} numberOfLines={1}>{notes}</Text>
        ) : null}
        {dueDate && paymentStatus !== 'paid' ? (
          <Text style={styles.due}>{`Due ${formatDate(dueDate)}`}</Text>
        ) : null}
      </View>
      <View style={styles.rightCol}>
        <Text style={[styles.amount, amountColor]}>
          {sign}{formatINR(amount)}
        </Text>
        <Text
          style={[
            styles.status,
            paymentStatus === 'paid' ? styles.statusPaid : styles.statusPending,
          ]}
        >
          {STATUS_LABEL[paymentStatus]}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomColor: colors.mute,
    borderBottomWidth: 1,
    gap: spacing.lg,
  },
  leftCol: {
    flex: 1,
    gap: spacing.xxs,
  },
  rightCol: {
    alignItems: 'flex-end',
    gap: spacing.xxs,
  },
  date: {
    ...typography.bodyMdStrong,
    color: colors.ink,
  },
  notes: {
    ...typography.bodySm,
    color: colors.body,
  },
  due: {
    ...typography.captionStrong,
    color: colors.primary,
  },
  amount: {
    ...typography.bodyMdStrong,
  },
  amountSettled: {
    color: colors.ink,
  },
  amountPending: {
    color: colors.primary,
  },
  amountDefault: {
    color: colors.ink,
  },
  status: {
    ...typography.captionStrong,
  },
  statusPaid: {
    color: colors.body,
  },
  statusPending: {
    color: colors.primary,
  },
});
