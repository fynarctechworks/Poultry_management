import { useCallback, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import {
  EmptyState,
  KhataLedgerRow,
  Select,
} from '../../components/ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatINR as sharedINR, formatNumber as sharedNum } from '@poultryos/shared';

interface TxnRow {
  id: string;
  transaction_type: 'income' | 'expense';
  amount: number;
  category: string;
  payment_status: 'paid' | 'pending' | 'partial';
  transaction_date: string;
  due_date: string | null;
  notes: string | null;
  buyer_or_supplier: string | null;
}

type Filter = 'all' | 'income' | 'expense' | 'pending';

const FILTER_KEYS: Filter[] = ['all', 'income', 'expense', 'pending'];

function formatINR(n: number): string {
  return sharedINR(n, { decimals: 2 });
}

function AddButton({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      style={styles.addBtn}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Plus size={24} color={colors.ink} />
    </Pressable>
  );
}

export default function TransactionsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const [txns, setTxns] = useState<TxnRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentFarm) {
      setTxns([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('financial_transactions')
        .select(
          'id, transaction_type, amount, category, payment_status, transaction_date, due_date, notes, buyer_or_supplier',
        )
        .eq('farm_id', currentFarm.id)
        .order('transaction_date', { ascending: false })
        .limit(100);
      if (error) throw error;
      setTxns((data ?? []) as TxnRow[]);
    } catch (err: unknown) {
      setSnackbar(err instanceof Error ? err.message : t('transactions.load_failed'));
    } finally {
      setRefreshing(false);
    }
  }, [currentFarm]);

  useFocusEffect(
    useCallback(() => {
      setTxns(null);
      load();
    }, [load]),
  );

  const filtered = useMemo(() => {
    if (!txns) return [];
    switch (filter) {
      case 'income':
        return txns.filter((t) => t.transaction_type === 'income');
      case 'expense':
        return txns.filter((t) => t.transaction_type === 'expense');
      case 'pending':
        return txns.filter((t) => t.payment_status !== 'paid');
      default:
        return txns;
    }
  }, [txns, filter]);

  const totals = useMemo(() => {
    if (!txns) return { income: 0, expense: 0, pending: 0 };
    return txns.reduce(
      (acc, t) => {
        const amt = Number(t.amount);
        if (t.transaction_type === 'income') acc.income += amt;
        else acc.expense += amt;
        if (t.payment_status !== 'paid') acc.pending += amt;
        return acc;
      },
      { income: 0, expense: 0, pending: 0 },
    );
  }, [txns]);

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: t('transactions.title'),
          headerRight: () => (
            <AddButton onPress={() => router.push('/transactions/new')} label={t('transactions.add')} />
          ),
        }}
      />

      {txns && txns.length > 0 ? (
        <FlatList
          data={filtered}
          keyExtractor={(t) => t.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View>
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{t('transactions.income')}</Text>
                  <Text style={[styles.summaryValue, styles.income]}>
                    {formatINR(totals.income)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{t('transactions.expense')}</Text>
                  <Text style={[styles.summaryValue, styles.expense]}>
                    {formatINR(totals.expense)}
                  </Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{t('transactions.pending')}</Text>
                  <Text style={[styles.summaryValue, styles.pending]}>
                    {formatINR(totals.pending)}
                  </Text>
                </View>
              </View>
              <View style={styles.filterWrap}>
                <Select
                  label={t('transactions.filter')}
                  options={FILTER_KEYS.map((k) => ({ value: k, label: t(`transactions.filter_options.${k}`) }))}
                  value={filter}
                  onChange={(v) => setFilter(v as Filter)}
                />
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <KhataLedgerRow
              amount={Number(item.amount)}
              transactionType={item.transaction_type}
              paymentStatus={item.payment_status}
              transactionDate={item.transaction_date}
              dueDate={item.due_date}
              notes={
                item.notes ||
                [item.category, item.buyer_or_supplier]
                  .filter(Boolean)
                  .join(' · ')
              }
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <EmptyState
                title={t('transactions.filtered_empty.title')}
                description={t('transactions.filtered_empty.description')}
              />
            </View>
          }
        />
      ) : txns && txns.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title={t('transactions.empty.title')}
            description={t('transactions.empty.description')}
            actionLabel={t('transactions.add')}
            onAction={() => router.push('/transactions/new')}
          />
        </View>
      ) : null}

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  addBtn: {
    padding: spacing.sm,
    minHeight: 44,
    minWidth: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: { padding: spacing.lg, gap: spacing.xs },
  summaryCard: {
    backgroundColor: colors.canvas,
    borderColor: colors.mute,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: { ...typography.bodySm, color: colors.body },
  summaryValue: { ...typography.bodyMdStrong },
  income: { color: colors.ink },
  expense: { color: colors.ink },
  pending: { color: colors.primary },
  filterWrap: { marginBottom: spacing.md },
  emptyWrap: { padding: spacing.lg, flex: 1 },
});
