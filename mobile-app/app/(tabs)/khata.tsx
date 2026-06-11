import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { Plus } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import { BuyerCard, Button, EmptyState, UpgradeBanner } from '../../components/ui';
import { canAddBuyer } from '../../lib/freemium';
import { useIsPaid } from '../../lib/freemium-hooks';
import { colors, spacing, typography } from '../../theme/tokens';
import { formatINR as sharedINR, formatNumber as sharedNum } from '@poultryos/shared';

interface BuyerRow {
  id: string;
  buyer_name: string;
  current_balance: number;
  last_transaction_date: string | null;
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

export default function KhataScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const { isPaid } = useIsPaid();
  const [buyers, setBuyers] = useState<BuyerRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentFarm) {
      setBuyers([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('buyers')
        .select('id, buyer_name, current_balance, last_transaction_date')
        .eq('farm_id', currentFarm.id)
        .order('buyer_name');
      if (error) throw error;
      setBuyers((data ?? []) as BuyerRow[]);
    } catch (err: unknown) {
      setSnackbar(err instanceof Error ? err.message : t('khata.load_failed'));
    } finally {
      setRefreshing(false);
    }
  }, [currentFarm]);

  useFocusEffect(
    useCallback(() => {
      setBuyers(null);
      load();
    }, [load]),
  );

  const totalOutstanding = (buyers ?? [])
    .filter((b) => b.current_balance > 0)
    .reduce((sum, b) => sum + Number(b.current_balance), 0);

  const buyerGate = canAddBuyer(buyers?.length ?? 0, isPaid);

  const handleAddBuyer = () => {
    if (!buyerGate.allowed) {
      setSnackbar(buyerGate.reason ?? t('khata.upgrade_buyers'));
      router.push('/billing');
      return;
    }
    router.push('/buyers/new');
  };

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: t('khata.title'),
          headerRight: () => <AddButton onPress={handleAddBuyer} label={t('khata.add_buyer')} />,
        }}
      />

      {buyers && buyers.length > 0 ? (
        <FlatList
          data={buyers}
          keyExtractor={(b) => b.id}
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
              {!buyerGate.allowed && buyerGate.reason ? (
                <View style={styles.gateBanner}>
                  <UpgradeBanner reason={buyerGate.reason} />
                </View>
              ) : null}
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>{t('khata.total_outstanding')}</Text>
                <Text style={styles.summaryAmount}>
                  {sharedINR(totalOutstanding, { decimals: 2 })}
                </Text>
                <Text style={styles.summaryCount}>
                  {buyers.length} {buyers.length === 1 ? t('khata.buyer_count_one') : t('khata.buyer_count_other')}
                </Text>
              </View>
              <View style={styles.quickActions}>
                <Button
                  variant="primary"
                  label={t('khata.record_income')}
                  onPress={() => router.push('/transactions/new?type=income')}
                  fullWidth
                />
                <Button
                  variant="outlineDark"
                  label={t('khata.record_expense')}
                  onPress={() => router.push('/transactions/new?type=expense')}
                  fullWidth
                />
                <Button
                  variant="outlineDark"
                  label={t('khata.view_all_transactions')}
                  onPress={() => router.push('/transactions')}
                  fullWidth
                />
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <BuyerCard
              buyerName={item.buyer_name}
              currentBalance={Number(item.current_balance)}
              lastTransactionDate={item.last_transaction_date}
              onPress={() => router.push(`/buyers/${item.id}`)}
            />
          )}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      ) : buyers && buyers.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title={t('khata.empty.title')}
            description={t('khata.empty.description')}
            actionLabel={t('khata.add_buyer')}
            onAction={() => router.push('/buyers/new')}
          />
          <View style={styles.quickActions}>
            <Button
              variant="outlineDark"
              label={t('khata.record_income')}
              onPress={() => router.push('/transactions/new?type=income')}
              fullWidth
            />
            <Button
              variant="outlineDark"
              label={t('khata.record_expense')}
              onPress={() => router.push('/transactions/new?type=expense')}
              fullWidth
            />
          </View>
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
  addBtn: { padding: spacing.sm, minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  listContent: { padding: spacing.lg, gap: spacing.md },
  sep: { height: spacing.md },
  summaryCard: {
    backgroundColor: colors.canvas,
    borderRadius: 6,
    borderColor: colors.mute,
    borderWidth: 1,
    padding: spacing.lg,
    marginBottom: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryLabel: {
    ...typography.captionUppercase,
    color: colors.body,
  },
  summaryAmount: {
    ...typography.displayMd,
    color: colors.primary,
  },
  summaryCount: {
    ...typography.captionStrong,
    color: colors.body,
  },
  emptyWrap: { padding: spacing.lg },
  quickActions: { gap: spacing.sm, marginBottom: spacing.md },
  gateBanner: { marginBottom: spacing.md },
});
