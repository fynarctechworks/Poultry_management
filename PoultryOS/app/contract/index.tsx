import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import { Card, EmptyState, UpgradeBanner } from '../../components/ui';
import { hasContractAccess } from '../../lib/freemium';
import { useIsPaid } from '../../lib/freemium-hooks';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDDMMMYYYY } from '../../lib/format-date';
import { formatINR as sharedINR, formatNumber as sharedNum } from '@poultryos/shared';

interface CycleRow {
  id: string;
  status: 'active' | 'harvest_complete' | 'settled' | 'disputed';
  chicks_supplied: number;
  chicks_supplied_date: string;
  expected_harvest_date: string | null;
  actual_harvest_date: string | null;
  expected_settlement_amount: number | null;
  actual_settlement_amount: number | null;
  batches: { batch_code: string; breed_name: string | null } | null;
  integrators: { name: string } | null;
}

function formatINR(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return sharedINR(n);
}

export default function ContractListScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const { isPaid } = useIsPaid();
  const contractGate = hasContractAccess(isPaid);
  const [cycles, setCycles] = useState<CycleRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentFarm) return;
    const { data, error } = await supabase
      .from('contract_cycles')
      .select(
        'id, status, chicks_supplied, chicks_supplied_date, expected_harvest_date, actual_harvest_date, expected_settlement_amount, actual_settlement_amount, batches!inner(batch_code, breed_name), integrators(name)',
      )
      .eq('farm_id', currentFarm.id)
      .order('chicks_supplied_date', { ascending: false });
    if (error) {
      setSnackbar(error.message);
      return;
    }
    // supabase-js v2 returns the foreign-key joins as arrays for non-unique
    // joins; UNIQUE batch_id makes batches a single object but TS still types
    // it as an array. Normalise here.
    const normalised = (data ?? []).map((row: any) => ({
      ...row,
      batches: Array.isArray(row.batches) ? row.batches[0] ?? null : row.batches,
      integrators: Array.isArray(row.integrators) ? row.integrators[0] ?? null : row.integrators,
    })) as CycleRow[];
    setCycles(normalised);
    setRefreshing(false);
  }, [currentFarm]);

  useFocusEffect(useCallback(() => { setCycles(null); load(); }, [load]));

  if (!contractGate.allowed) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: t('contract.title') }} />
        <View style={styles.emptyWrap}>
          <UpgradeBanner
            reason={contractGate.reason ?? t('contract.gate_reason')}
          />
          <View style={{ height: spacing.lg }} />
          <EmptyState
            title={t('contract.pro.title')}
            description={t('contract.pro.description')}
            actionLabel={t('contract.pro.action')}
            onAction={() => router.push('/billing')}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('contract.title') }} />

      {cycles && cycles.length > 0 ? (
        <FlatList
          data={cycles}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <Card
              style={styles.cycleCard}
              onPress={() => router.push(`/contract/${item.id}`)}
            >
              <View style={styles.cycleHeader}>
                <View style={styles.cycleInfo}>
                  <Text style={styles.cycleCode}>
                    {item.batches?.batch_code ?? '—'}
                  </Text>
                  <Text style={styles.cycleMeta}>
                    {item.integrators?.name ?? t('contract.unknown_integrator')}
                    {item.batches?.breed_name ? ` · ${item.batches.breed_name}` : ''}
                  </Text>
                  <Text style={styles.cycleMeta}>
                    {t('contract.placed_chicks', {
                      date: formatDDMMMYYYY(item.chicks_supplied_date),
                      count: item.chicks_supplied.toLocaleString('en-IN'),
                    })}
                  </Text>
                </View>
                <View style={styles.statusPill}>
                  <Text style={styles.statusText}>{t(`contract.status.${item.status}`)}</Text>
                </View>
              </View>
              {(item.expected_settlement_amount || item.actual_settlement_amount) ? (
                <View style={styles.settlementRow}>
                  <Text style={styles.settlementLabel}>
                    {item.actual_settlement_amount != null ? t('contract.actual') : t('contract.expected')}
                  </Text>
                  <Text style={styles.settlementAmount}>
                    {formatINR(
                      item.actual_settlement_amount ?? item.expected_settlement_amount,
                    )}
                  </Text>
                </View>
              ) : null}
            </Card>
          )}
        />
      ) : cycles && cycles.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title={t('contract.empty.title')}
            description={t('contract.empty.description')}
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
  listContent: { padding: spacing.lg, gap: spacing.md },
  cycleCard: { gap: spacing.sm },
  cycleHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  cycleInfo: { flex: 1, gap: spacing.xxs },
  cycleCode: { ...typography.bodyMdStrong, color: colors.ink },
  cycleMeta: { ...typography.caption, color: colors.body },
  statusPill: {
    backgroundColor: colors.canvasSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  statusText: { ...typography.captionUppercase, color: colors.ink },
  settlementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.canvasSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.sm,
  },
  settlementLabel: { ...typography.captionUppercase, color: colors.body },
  settlementAmount: { ...typography.bodyMdStrong, color: colors.ink },
  emptyWrap: { padding: spacing.lg, flex: 1 },
});
