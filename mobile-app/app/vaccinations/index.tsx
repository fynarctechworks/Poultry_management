import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, RefreshControl } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth';
import { useFarmStore } from '../../stores/farm';
import { todayISO } from '../../lib/format-date';
import {
  Select,
  Timeline,
  VaccinationCard,
  EmptyState,
} from '../../components/ui';
import { colors, spacing } from '../../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveBatch {
  id: string;
  batch_code: string;
  breed_name: string;
}

interface VaccinationRow {
  id: string;
  vaccine_name: string;
  scheduled_date: string;
  administered_date: string | null;
  dose: string | null;
  route: 'oral' | 'injection' | 'spray' | null;
  status: 'scheduled' | 'done' | 'overdue';
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function VaccinationsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { batchId: paramBatchId } = useLocalSearchParams<{ batchId?: string }>();
  const user = useAuthStore((s) => s.user);
  const currentFarm = useFarmStore((s) => s.currentFarm);

  const [batches, setBatches] = useState<ActiveBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    paramBatchId ?? null,
  );
  const [vaccinations, setVaccinations] = useState<VaccinationRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [markingDoneId, setMarkingDoneId] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadBatches = useCallback(async () => {
    if (!currentFarm) return;
    const { data, error } = await supabase
      .from('batches')
      .select('id, batch_code, breed_name')
      .eq('farm_id', currentFarm.id)
      .eq('status', 'active')
      .order('placement_date', { ascending: false });
    if (!error) {
      const rows = (data ?? []) as ActiveBatch[];
      setBatches(rows);
      setSelectedBatchId((prev) => {
        if (prev && rows.some((b) => b.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    }
  }, [currentFarm]);

  const loadVaccinations = useCallback(async () => {
    if (!selectedBatchId) {
      setVaccinations([]);
      return;
    }
    const { data, error } = await supabase
      .from('vaccinations')
      .select(
        'id, vaccine_name, scheduled_date, administered_date, dose, route, status',
      )
      .eq('batch_id', selectedBatchId)
      .order('scheduled_date', { ascending: true });
    if (!error) {
      setVaccinations((data ?? []) as VaccinationRow[]);
    } else {
      setSnackbar(t('vaccinations.load_failed', { reason: error.message }));
      setVaccinations([]);
    }
  }, [selectedBatchId, t]);

  useFocusEffect(
    useCallback(() => {
      loadBatches();
    }, [loadBatches]),
  );

  useFocusEffect(
    useCallback(() => {
      setVaccinations(null);
      loadVaccinations();
    }, [loadVaccinations]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadBatches(), loadVaccinations()]);
    setRefreshing(false);
  }, [loadBatches, loadVaccinations]);

  // -------------------------------------------------------------------------
  // Mark done
  // -------------------------------------------------------------------------

  async function handleMarkDone(vaccinationId: string) {
    if (!user) return;
    setMarkingDoneId(vaccinationId);
    try {
      const { error } = await supabase
        .from('vaccinations')
        .update({
          status: 'done',
          administered_date: todayISO(),
          administered_by: user.id,
        })
        .eq('id', vaccinationId);
      if (error) {
        setSnackbar(t('vaccinations.update_failed_reason', { reason: error.message }));
        return;
      }
      setSnackbar(t('vaccinations.marked_done'));
      await loadVaccinations();
    } catch (e) {
      setSnackbar(e instanceof Error ? e.message : t('vaccinations.update_failed'));
    } finally {
      setMarkingDoneId(null);
    }
  }

  // -------------------------------------------------------------------------
  // Header right — "+" button
  // -------------------------------------------------------------------------

  function AddButton() {
    return (
      <Pressable
        onPress={() =>
          router.push(
            selectedBatchId
              ? `/vaccinations/new?batchId=${selectedBatchId}`
              : '/vaccinations/new',
          )
        }
        style={styles.headerBtn}
        accessible
        accessibilityRole="button"
        accessibilityLabel={t('vaccinations.schedule_new')}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Plus size={24} color={colors.primary} />
      </Pressable>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  const isLoading = vaccinations === null;
  const isEmpty = !isLoading && vaccinations.length === 0;

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: t('vaccinations.title'),
          headerRight: () => <AddButton />,
        }}
      />

      {/* Batch selector */}
      {batches.length > 0 && (
        <View style={styles.selectorWrap}>
          <Select
            label={t('vaccinations.batch')}
            options={batches.map((b) => ({
              value: b.id,
              label: `${b.batch_code} · ${b.breed_name}`,
            }))}
            value={selectedBatchId}
            onChange={(val) => {
              setSelectedBatchId(val);
              setVaccinations(null);
            }}
            placeholder={t('vaccinations.select_batch')}
          />
        </View>
      )}

      {/* Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, isEmpty && styles.scrollEmpty]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {isEmpty ? (
          <EmptyState
            title={t('vaccinations.empty.title')}
            description={t('vaccinations.empty.description')}
            actionLabel={t('vaccinations.schedule')}
            onAction={() =>
              router.push(
                selectedBatchId
                  ? `/vaccinations/new?batchId=${selectedBatchId}`
                  : '/vaccinations/new',
              )
            }
          />
        ) : (
          !isLoading && (
            <Timeline>
              {vaccinations.map((v) => (
                <VaccinationCard
                  key={v.id}
                  vaccineName={v.vaccine_name}
                  scheduledDate={v.scheduled_date}
                  administeredDate={v.administered_date}
                  status={v.status}
                  route={v.route}
                  dose={v.dose}
                  onMarkDone={
                    v.status !== 'done'
                      ? () => handleMarkDone(v.id)
                      : undefined
                  }
                  testID={`vax-card-${v.id}`}
                />
              ))}
            </Timeline>
          )
        )}
      </ScrollView>

      <Snackbar visible={snackbar !== null} onDismiss={() => setSnackbar(null)} duration={4000}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
  },
  selectorWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: colors.mute,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
  },
  scrollEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  headerBtn: {
    paddingHorizontal: spacing.sm,
  },
});
