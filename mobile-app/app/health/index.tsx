import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  RefreshControl,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import { formatDDMMMYYYY } from '../../lib/format-date';
import {
  Card,
  Select,
  EmptyState,
  WithdrawalBadge,
} from '../../components/ui';
import { colors, spacing, typography, radius } from '../../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveBatch {
  id: string;
  batch_code: string;
  breed_name: string;
}

interface HealthIncident {
  id: string;
  incident_date: string;
  symptom_description: string;
  affected_bird_count: number | null;
  diagnosis: string | null;
  treatment_given: string | null;
  medicine_name: string | null;
  withdrawal_clearance_date: string | null;
  vet_note: string | null;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function HealthIndexScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { batchId: paramBatchId } = useLocalSearchParams<{ batchId?: string }>();
  const currentFarm = useFarmStore((s) => s.currentFarm);

  const [batches, setBatches] = useState<ActiveBatch[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(
    paramBatchId ?? null,
  );
  const [incidents, setIncidents] = useState<HealthIncident[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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
      // Pre-select: use param if valid, else fallback to first batch
      setSelectedBatchId((prev) => {
        if (prev && rows.some((b) => b.id === prev)) return prev;
        return rows[0]?.id ?? null;
      });
    }
  }, [currentFarm]);

  const loadIncidents = useCallback(async () => {
    if (!selectedBatchId) {
      setIncidents([]);
      return;
    }
    const { data, error } = await supabase
      .from('health_incidents')
      .select(
        'id, incident_date, symptom_description, affected_bird_count, diagnosis, treatment_given, medicine_name, withdrawal_clearance_date, vet_note',
      )
      .eq('batch_id', selectedBatchId)
      .order('incident_date', { ascending: false });
    if (!error) {
      setIncidents((data ?? []) as HealthIncident[]);
    } else {
      setSnackbar(t('health.load_failed', { reason: error.message }));
      setIncidents([]);
    }
  }, [selectedBatchId, t]);

  useFocusEffect(
    useCallback(() => {
      loadBatches();
    }, [loadBatches]),
  );

  useFocusEffect(
    useCallback(() => {
      setIncidents(null); // trigger loading state on batch change
      loadIncidents();
    }, [loadIncidents]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadBatches(), loadIncidents()]);
    setRefreshing(false);
  }, [loadBatches, loadIncidents]);

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function renderIncident({ item }: { item: HealthIncident }) {
    const hasAffected = item.affected_bird_count != null && item.affected_bird_count > 0;
    const hasTreatment = item.treatment_given || item.medicine_name;

    return (
      <Card style={styles.incidentCard}>
        {/* Primary symptom line */}
        <Text style={styles.symptomText}>{item.symptom_description}</Text>

        {/* Date + affected count */}
        <Text style={styles.metaLine}>
          {formatDDMMMYYYY(item.incident_date)}
          {hasAffected ? ` · ${t('health.birds_affected', { count: item.affected_bird_count })}` : ''}
        </Text>

        {/* Diagnosis */}
        {!!item.diagnosis && (
          <Text style={styles.detailLine}>
            <Text style={styles.detailLabel}>{t('health.diagnosis')}</Text>
            {item.diagnosis}
          </Text>
        )}

        {/* Treatment */}
        {hasTreatment && (
          <Text style={styles.detailLine}>
            <Text style={styles.detailLabel}>{t('health.treatment')}</Text>
            {[item.medicine_name, item.treatment_given].filter(Boolean).join(' — ')}
          </Text>
        )}

        {/* Withdrawal badge */}
        {item.withdrawal_clearance_date && (
          <WithdrawalBadge
            clearanceDate={item.withdrawal_clearance_date}
            testID={`withdrawal-${item.id}`}
          />
        )}

        {/* Vet note inset */}
        {!!item.vet_note && (
          <View style={styles.vetNoteBlock}>
            <Text style={styles.vetNoteText}>
              <Text style={styles.vetNoteLabel}>{t('health.vet_note')}</Text>
              {item.vet_note}
            </Text>
          </View>
        )}
      </Card>
    );
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
              ? `/health/new?batchId=${selectedBatchId}`
              : '/health/new',
          )
        }
        style={styles.headerBtn}
        accessible
        accessibilityRole="button"
        accessibilityLabel={t('health.report_new_incident')}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Plus size={24} color={colors.primary} />
      </Pressable>
    );
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  const isLoading = incidents === null;

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: t('health.title'),
          headerRight: () => <AddButton />,
        }}
      />

      {/* Batch selector */}
      {batches.length > 0 && (
        <View style={styles.selectorWrap}>
          <Select
            label={t('health.batch')}
            options={batches.map((b) => ({
              value: b.id,
              label: `${b.batch_code} · ${b.breed_name}`,
            }))}
            value={selectedBatchId}
            onChange={(val) => {
              setSelectedBatchId(val);
              setIncidents(null);
            }}
            placeholder={t('health.select_batch')}
          />
        </View>
      )}

      {/* Content */}
      {!isLoading && incidents.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyScrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
        >
          <EmptyState
            title={t('health.empty.title')}
            description={t('health.empty.description')}
            actionLabel={t('health.report_incident')}
            onAction={() =>
              router.push(
                selectedBatchId
                  ? `/health/new?batchId=${selectedBatchId}`
                  : '/health/new',
              )
            }
          />
        </ScrollView>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={isLoading ? [] : incidents}
          keyExtractor={(item) => item.id}
          renderItem={renderIncident}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            isLoading ? null : (
              <EmptyState
                title={t('health.empty.title')}
                description={t('health.empty.description')}
                actionLabel={t('health.report_incident')}
                onAction={() =>
                  router.push(
                    selectedBatchId
                      ? `/health/new?batchId=${selectedBatchId}`
                      : '/health/new',
                  )
                }
              />
            )
          }
        />
      )}

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
  list: {
    flex: 1,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
    flexGrow: 1,
  },
  emptyScrollContent: {
    flexGrow: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  incidentCard: {
    gap: spacing.sm,
  },
  symptomText: {
    ...typography.bodyMdStrong,
    color: colors.ink,
  },
  metaLine: {
    ...typography.caption,
    color: colors.body,
  },
  detailLine: {
    ...typography.bodySm,
    color: colors.ink,
  },
  detailLabel: {
    ...typography.bodySmStrong,
    color: colors.ink,
  },
  vetNoteBlock: {
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  vetNoteText: {
    ...typography.caption,
    color: colors.body,
  },
  vetNoteLabel: {
    ...typography.captionStrong,
    color: colors.body,
  },
  headerBtn: {
    paddingHorizontal: spacing.sm,
  },
});
