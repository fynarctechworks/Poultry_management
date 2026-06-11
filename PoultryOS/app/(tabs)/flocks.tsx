import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { HeartPulse, Syringe } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import { formatDDMMMYYYY } from '../../lib/format-date';
import { Card, EmptyState } from '../../components/ui';
import { colors, spacing, typography, radius } from '../../theme/tokens';
import { formatINR as sharedINR, formatNumber as sharedNum } from '@poultryos/shared';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActiveBatch {
  id: string;
  batch_code: string;
  breed_name: string;
  poultry_type: string;
  current_bird_count: number;
  placement_date: string;
  status: string;
  harvest_date: string | null;
  total_sale_revenue: number | null;
}

type FlockFilter = 'active' | 'closed';

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function FlocksScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const currentFarm = useFarmStore((s) => s.currentFarm);

  const [batches, setBatches] = useState<ActiveBatch[] | null>(null);
  const [filter, setFilter] = useState<FlockFilter>('active');
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentFarm) return;
    const statuses =
      filter === 'active' ? ['active'] : ['harvested', 'closed'];
    const { data, error } = await supabase
      .from('batches')
      .select(
        'id, batch_code, breed_name, poultry_type, current_bird_count, placement_date, status, harvest_date, total_sale_revenue',
      )
      .eq('farm_id', currentFarm.id)
      .in('status', statuses)
      .order('placement_date', { ascending: false });
    if (!error) {
      setBatches((data ?? []) as ActiveBatch[]);
    } else {
      setSnackbar(t('flocks.load_failed', { reason: error.message }));
      setBatches([]);
    }
  }, [currentFarm, filter, t]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  // -------------------------------------------------------------------------
  // Render each batch card
  // -------------------------------------------------------------------------

  function renderBatch({ item }: { item: ActiveBatch }) {
    const isClosed = item.status !== 'active';
    return (
      <Card
        style={styles.batchCard}
        onPress={() => router.push(`/batches/${item.id}`)}
      >
        {/* Batch header */}
        <View style={styles.batchHeader}>
          <View style={styles.batchInfo}>
            <Text style={styles.batchCode}>{item.batch_code}</Text>
            <Text style={styles.batchMeta}>
              {item.breed_name} · {item.poultry_type}
            </Text>
            {isClosed && item.harvest_date ? (
              <Text style={styles.batchDate}>
                {t('flocks.harvested', { date: formatDDMMMYYYY(item.harvest_date) })}
              </Text>
            ) : (
              <Text style={styles.batchDate}>
                {t('flocks.placed', { date: formatDDMMMYYYY(item.placement_date) })}
              </Text>
            )}
            {isClosed && item.total_sale_revenue ? (
              <Text style={styles.revenueTag}>
                {sharedINR(item.total_sale_revenue)}
              </Text>
            ) : null}
          </View>
          <Text style={styles.batchCount}>
            {(item.current_bird_count ?? 0).toLocaleString('en-IN')}
          </Text>
        </View>

        {/* Action links */}
        <View style={styles.actionRow}>
          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push(`/health?batchId=${item.id}`)}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Health incidents for batch ${item.batch_code}`}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <HeartPulse size={16} color={colors.primary} />
            <Text style={styles.actionLabel}>{t('flocks.health')}</Text>
          </Pressable>

          <View style={styles.actionDivider} />

          <Pressable
            style={styles.actionBtn}
            onPress={() => router.push(`/vaccinations?batchId=${item.id}`)}
            accessible
            accessibilityRole="button"
            accessibilityLabel={`Vaccinations for batch ${item.batch_code}`}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
          >
            <Syringe size={16} color={colors.primary} />
            <Text style={styles.actionLabel}>{t('flocks.vaccinations')}</Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  // -------------------------------------------------------------------------
  // Loading skeleton placeholder rows (simple)
  // -------------------------------------------------------------------------

  if (batches === null) {
    return (
      <View style={styles.root}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.skeleton, { opacity: 1 - i * 0.2 }]} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <FlatList
        data={batches}
        keyExtractor={(b) => b.id}
        contentContainerStyle={[
          styles.listContent,
          batches.length === 0 && styles.listEmpty,
        ]}
        renderItem={renderBatch}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View style={styles.segments}>
            {(['active', 'closed'] as FlockFilter[]).map((f) => {
              const selected = filter === f;
              return (
                <Pressable
                  key={f}
                  onPress={() => setFilter(f)}
                  style={[styles.segment, selected && styles.segmentSelected]}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      selected && styles.segmentTextSelected,
                    ]}
                  >
                    {f === 'active' ? t('flocks.active') : t('flocks.closed')}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            title={filter === 'active' ? t('flocks.empty_active.title') : t('flocks.empty_closed.title')}
            description={
              filter === 'active'
                ? t('flocks.empty_active.description')
                : t('flocks.empty_closed.description')
            }
            actionLabel={filter === 'active' ? t('flocks.set_up_flock') : undefined}
            onAction={filter === 'active' ? () => router.push('/setup/sheds') : undefined}
          />
        }
      />

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

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
  },
  listContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  listEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  batchCard: {
    gap: spacing.md,
  },
  batchHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  batchInfo: {
    flex: 1,
    gap: spacing.xxs,
  },
  batchCode: {
    ...typography.bodyMdStrong,
    color: colors.ink,
  },
  batchMeta: {
    ...typography.caption,
    color: colors.body,
  },
  batchDate: {
    ...typography.caption,
    color: colors.body,
  },
  revenueTag: {
    ...typography.captionStrong,
    color: colors.success,
    marginTop: spacing.xxs,
  },
  segments: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  segment: {
    flexGrow: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pillMd,
    backgroundColor: colors.canvasSoft,
    borderColor: colors.mute,
    borderWidth: 1,
    alignItems: 'center',
    minHeight: 44,
    justifyContent: 'center',
  },
  segmentSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  segmentText: {
    ...typography.bodySmStrong,
    color: colors.ink,
  },
  segmentTextSelected: {
    color: colors.onPrimary,
  },
  batchCount: {
    ...typography.displayXs,
    color: colors.primary,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.mute,
    paddingTop: spacing.md,
    gap: spacing.md,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: 44,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.sm,
  },
  actionLabel: {
    ...typography.bodySmStrong,
    color: colors.primary,
  },
  actionDivider: {
    width: 1,
    height: 20,
    backgroundColor: colors.mute,
  },
  // Simple loading skeleton cards
  skeleton: {
    height: 100,
    borderRadius: radius.card,
    backgroundColor: colors.mute,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
});
