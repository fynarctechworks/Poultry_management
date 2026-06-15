import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth';
import { useFarmStore } from '../../stores/farm';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import { enqueue } from '../../lib/offline-queue';
import { track, FUNNEL } from '../../lib/analytics';
import {
  Select,
  DailyLogForm,
  OfflineBanner,
  EmptyState,
  type DailyLogValues,
} from '../../components/ui';
import { colors, spacing, typography } from '../../theme/tokens';

interface ActiveBatch {
  id: string;
  batch_code: string;
  breed_name: string;
  poultry_type: string;
}

export default function DailyLogScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const { pendingCount, isOnline } = useOfflineQueue();

  const [batches, setBatches] = useState<ActiveBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  // Bumping this key remounts DailyLogForm to reset all fields after a save
  const [formKey, setFormKey] = useState(0);

  const loadBatches = useCallback(async () => {
    if (!currentFarm) return;
    setLoadingBatches(true);
    try {
      const { data } = await supabase
        .from('batches')
        .select('id, batch_code, breed_name, poultry_type')
        .eq('farm_id', currentFarm.id)
        .eq('status', 'active')
        .order('placement_date', { ascending: false });
      const rows = (data ?? []) as ActiveBatch[];
      setBatches(rows);
      setSelectedBatchId((prev) => prev ?? rows[0]?.id ?? null);
    } catch {
      setBatches([]);
    } finally {
      setLoadingBatches(false);
    }
  }, [currentFarm]);

  useFocusEffect(
    useCallback(() => {
      loadBatches();
    }, [loadBatches]),
  );

  async function handleSubmit(values: DailyLogValues) {
    if (!currentFarm || !user || !selectedBatchId) {
      setSnackbar(t('daily_log.select_batch_first'));
      return;
    }
    setSubmitting(true);
    const payload = {
      batch_id: selectedBatchId,
      farm_id: currentFarm.id,
      logged_by: user.id,
      log_date: values.log_date,
      birds_dead: values.birds_dead,
      death_cause: values.birds_dead > 0 ? values.death_cause : null,
      feed_consumed_kg: values.feed_consumed_kg,
      feed_type: values.feed_type,
      feed_cost_per_kg: values.feed_cost_per_kg ?? null,
      eggs_collected: values.eggs_collected ?? null,
      broken_eggs: values.broken_eggs ?? null,
      avg_bird_weight_g: values.avg_bird_weight_g ?? null,
      notes: values.notes ?? null,
      is_synced: isOnline,
    };

    try {
      if (isOnline) {
        const { error } = await supabase.from('daily_logs').insert(payload);
        if (error) {
          if (error.code === '23505') {
            setSnackbar(t('daily_log.duplicate_error', { date: values.log_date }));
          } else {
            setSnackbar(`${t('daily_log.save_failed')}: ${error.message}`);
          }
          return;
        }
        // If feed was logged, confirm a matching feed item exists so the user
        // knows whether stock was deducted (never fail silently).
        let successMsg = t('daily_log.save_success');
        if (values.feed_consumed_kg > 0 && values.feed_type) {
          const { data: feedItem } = await supabase
            .from('inventory_items')
            .select('id')
            .eq('farm_id', currentFarm.id)
            .eq('category', 'feed')
            .ilike('item_name', `${values.feed_type}%`)
            .limit(1)
            .maybeSingle();
          if (!feedItem) successMsg = t('daily_log.feed_stock_not_updated');
        }
        setSnackbar(successMsg);
        void track(FUNNEL.FIRST_DAILY_ENTRY, { batch_id: selectedBatchId });
        setFormKey((k) => k + 1);
      } else {
        await enqueue({ table: 'daily_logs', payload });
        setSnackbar(t('daily_log.offline_queued'));
        setFormKey((k) => k + 1);
      }
    } catch (e) {
      setSnackbar(e instanceof Error ? `${t('daily_log.save_failed')}: ${e.message}` : t('daily_log.save_failed'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <OfflineBanner visible={!isOnline} pendingCount={pendingCount} />

      {!loadingBatches && batches.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title={t('daily_log.no_active_batches.title')}
            description={t('daily_log.no_active_batches.description')}
          />
        </View>
      ) : (
        <>
          {batches.length > 1 && (
            <View style={styles.selectorWrap}>
              <Select
                label={t('daily_log.batch')}
                options={batches.map((b) => ({
                  value: b.id,
                  label: `${b.batch_code} · ${b.breed_name}`,
                }))}
                value={selectedBatchId}
                onChange={setSelectedBatchId}
                placeholder={t('daily_log.select_batch')}
              />
            </View>
          )}

          {selectedBatchId && (
            <DailyLogForm
              key={formKey}
              batchId={selectedBatchId}
              farmId={currentFarm?.id ?? ''}
              loggedByUserId={user?.id ?? ''}
              poultryType={batches.find((b) => b.id === selectedBatchId)?.poultry_type as 'broiler' | 'layer' | 'breeder' | undefined}
              onSubmit={handleSubmit}
              submitting={submitting}
            />
          )}

          {!selectedBatchId && !loadingBatches && (
            <Text style={styles.hint}>{t('daily_log.select_batch_hint')}</Text>
          )}
        </>
      )}

      <Snackbar
        visible={snackbar !== null}
        onDismiss={() => setSnackbar(null)}
        duration={4000}
      >
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
  },
  selectorWrap: {
    padding: spacing.lg,
    paddingBottom: 0,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  hint: {
    ...typography.bodyMd,
    color: colors.body,
    padding: spacing.lg,
  },
});
