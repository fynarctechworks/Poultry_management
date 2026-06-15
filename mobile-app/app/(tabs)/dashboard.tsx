import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth';
import { useFarmStore } from '../../stores/farm';
import { useOfflineQueue } from '../../hooks/useOfflineQueue';
import {
  KpiTile,
  MarketPriceStrip,
  WeatherWidget,
  OfflineBanner,
  DailyLogFab,
  EmptyState,
  HeatStressBanner,
  InsightsCard,
  SetupProgressCard,
  ShedMap,
  Snackbar,
  type KpiTone,
  type SetupStep,
  type ShedCell,
} from '../../components/ui';
import { colors, spacing, typography, radius } from '../../theme/tokens';
import {
  aggregateFcr,
  aggregateLivability,
  fcrTone,
  livabilityTone,
  type BatchSnapshot,
  type DailyLogRow,
} from '../../lib/kpis';
import {
  computeInsights,
  type Insight,
  type InsightBatchInput,
  type InsightLogRow,
} from '@poultryos/shared';

const DEFAULT_HEAT_THRESHOLD = 35;

interface ActiveBatch {
  id: string;
  batch_code: string;
  breed_name: string;
  poultry_type: string;
  current_bird_count: number;
  opening_bird_count: number;
  placement_date: string;
  shed_id: string;
}

interface WeatherRow {
  current_temp_c: number | null;
  current_humidity: number | null;
  max_temp_today: number | null;
  fetched_at: string | null;
}

interface AlertRow {
  id: string;
  severity: 'warning' | 'critical';
  max_temp_forecast: number | null;
  mitigation_actions_json: string[] | null;
}

interface MarketPriceRow {
  price_date: string;
  broiler_price_per_kg: number | null;
  egg_price_per_100: number | null;
  source: 'agmarknet' | 'nafed' | 'manual';
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function DashboardScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const { pendingCount, isOnline } = useOfflineQueue();

  const [firstName, setFirstName] = useState('');
  const [batches, setBatches] = useState<ActiveBatch[]>([]);
  const [shedCells, setShedCells] = useState<ShedCell[]>([]);
  const [weather, setWeather] = useState<WeatherRow | null>(null);
  const [alert, setAlert] = useState<AlertRow | null>(null);
  const [mortality7d, setMortality7d] = useState<number | null>(null);
  const [fcr, setFcr] = useState<number | null>(null);
  const [livability, setLivability] = useState<number | null>(null);
  const [eggsToday, setEggsToday] = useState<number>(0);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [marketPrice, setMarketPrice] = useState<MarketPriceRow | null>(null);
  const [shedCount, setShedCount] = useState<number | null>(null);
  const [hasDailyLog, setHasDailyLog] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentFarm || !user) return;
    const farmId = currentFarm.id;
    try {
      const [
        profileRes,
        batchRes,
        weatherRes,
        alertRes,
        mortalityRes,
        eggsRes,
        marketRes,
        shedRes,
        anyLogRes,
      ] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle(),
        supabase
          .from('batches')
          .select('id, batch_code, breed_name, poultry_type, current_bird_count, opening_bird_count, placement_date, shed_id')
          .eq('farm_id', farmId)
          .eq('status', 'active')
          .order('placement_date', { ascending: false }),
        supabase.from('weather_data').select('current_temp_c, current_humidity, max_temp_today, fetched_at').eq('farm_id', farmId).maybeSingle(),
        supabase
          .from('weather_alerts')
          .select('id, severity, max_temp_forecast, mitigation_actions_json')
          .eq('farm_id', farmId)
          .eq('alert_date', todayISO())
          .is('acknowledged_at', null)
          .maybeSingle(),
        supabase.from('daily_logs').select('birds_dead').eq('farm_id', farmId).gte('log_date', daysAgoISO(7)),
        supabase.from('daily_logs').select('eggs_collected').eq('farm_id', farmId).eq('log_date', todayISO()),
        currentFarm.state
          ? supabase
              .from('market_prices')
              .select('price_date, broiler_price_per_kg, egg_price_per_100, source')
              .eq('state', currentFarm.state)
              .order('price_date', { ascending: false })
              .limit(1)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase.from('sheds').select('id, shed_name, capacity, status').eq('farm_id', farmId).order('shed_name'),
        supabase.from('daily_logs').select('id', { count: 'exact', head: true }).eq('farm_id', farmId).limit(1),
      ]);

      const shedRows = (shedRes.data ?? []) as {
        id: string;
        shed_name: string;
        capacity: number | null;
        status: string;
      }[];
      setShedCount(shedRows.length);
      setHasDailyLog((anyLogRes.count ?? 0) > 0);

      const fullName = profileRes.data?.full_name ?? '';
      setFirstName(fullName.split(' ')[0] ?? '');

      const batchRows = (batchRes.data ?? []) as ActiveBatch[];
      setBatches(batchRows);

      // Build the farm-map cells: each active shed + its live occupancy.
      const cells: ShedCell[] = shedRows
        .filter((s) => s.status === 'active')
        .map((s) => {
          const inShed = batchRows.filter((b) => b.shed_id === s.id);
          return {
            id: s.id,
            shedName: s.shed_name,
            capacity: s.capacity,
            birdCount: inShed.reduce((sum, b) => sum + (b.current_bird_count ?? 0), 0),
            batchCode: inShed[0]?.batch_code ?? null,
            extraBatches: Math.max(0, inShed.length - 1),
          };
        });
      setShedCells(cells);

      setWeather((weatherRes.data as WeatherRow) ?? null);
      setAlert((alertRes.data as AlertRow) ?? null);

      const deadSum = (mortalityRes.data ?? []).reduce(
        (s: number, r: { birds_dead: number | null }) => s + (r.birds_dead ?? 0),
        0,
      );
      const openingSum = batchRows.reduce((s, b) => s + (b.opening_bird_count ?? 0), 0);
      setMortality7d(openingSum > 0 ? (deadSum / openingSum) * 100 : null);

      const eggSum = (eggsRes.data ?? []).reduce(
        (s: number, r: { eggs_collected: number | null }) => s + (r.eggs_collected ?? 0),
        0,
      );
      setEggsToday(eggSum);

      setMarketPrice((marketRes.data as MarketPriceRow) ?? null);

      // FCR + Livability + Smart Insights — only meaningful with active batches.
      if (batchRows.length > 0) {
        const activeBatchIds = batchRows.map((b) => b.id);
        const snapshots: BatchSnapshot[] = batchRows.map((b) => ({
          batchId: b.id,
          currentBirdCount: b.current_bird_count ?? 0,
          openingBirdCount: b.opening_bird_count ?? 0,
        }));
        // One query feeds both cumulative FCR (whole batch life) and the
        // insights engine (which self-windows to the last 2 weeks internally).
        const { data: logRows } = await supabase
          .from('daily_logs')
          .select(
            'batch_id, log_date, birds_dead, feed_consumed_kg, feed_cost_per_kg, eggs_collected, avg_bird_weight_g',
          )
          .in('batch_id', activeBatchIds);
        const allLogs = logRows ?? [];
        setFcr(aggregateFcr(snapshots, allLogs as DailyLogRow[]));
        setLivability(aggregateLivability(snapshots));

        const insightInputs: InsightBatchInput[] = batchRows.map((b) => ({
          batchId: b.id,
          batchCode: b.batch_code,
          breedName: b.breed_name ?? null,
          poultryType: (b.poultry_type as InsightBatchInput['poultryType']) ?? 'broiler',
          openingBirdCount: b.opening_bird_count ?? 0,
          currentBirdCount: b.current_bird_count ?? 0,
          placementDate: b.placement_date,
          logs: allLogs.filter((l) => l.batch_id === b.id) as InsightLogRow[],
        }));
        setInsights(computeInsights(insightInputs));
      } else {
        setFcr(null);
        setLivability(null);
        setInsights([]);
      }
    } catch {
      // best-effort dashboard; leave whatever loaded
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentFarm, user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function acknowledgeAlert() {
    if (!alert) return;
    try {
      await supabase
        .from('weather_alerts')
        .update({ acknowledged_at: new Date().toISOString() })
        .eq('id', alert.id);
      setAlert(null);
      setSnackbar(t('dashboard.heat_ack'));
    } catch {
      setSnackbar(t('dashboard.heat_ack_failed'));
    }
  }

  const activeBirds = batches.reduce((s, b) => s + (b.current_bird_count ?? 0), 0);
  const heatThreshold = currentFarm?.heat_stress_threshold_celsius ?? DEFAULT_HEAT_THRESHOLD;

  // First-run setup progress — shown until shed + batch + first daily log exist.
  const setupSteps: SetupStep[] = [
    {
      key: 'shed',
      label: t('dashboard.setup.shed_label'),
      description: t('dashboard.setup.shed_desc'),
      done: (shedCount ?? 0) > 0,
      ctaLabel: t('dashboard.setup.shed_cta'),
      onPress: () => router.push('/setup/sheds'),
    },
    {
      key: 'batch',
      label: t('dashboard.setup.batch_label'),
      description: t('dashboard.setup.batch_desc'),
      done: batches.length > 0,
      ctaLabel: t('dashboard.setup.batch_cta'),
      onPress: () => router.push('/setup/sheds'),
    },
    {
      key: 'log',
      label: t('dashboard.setup.log_label'),
      description: t('dashboard.setup.log_desc'),
      done: hasDailyLog === true,
      ctaLabel: t('dashboard.setup.log_cta'),
      onPress: () => router.push('/(tabs)/log'),
    },
  ];
  const setupDoneCount = setupSteps.filter((s) => s.done).length;
  // Only decide once the underlying counts have loaded (avoid a flash).
  const showSetup = shedCount !== null && hasDailyLog !== null && setupDoneCount < setupSteps.length;

  const mortalityTone: KpiTone =
    mortality7d === null
      ? 'neutral'
      : mortality7d < 1
        ? 'positive'
        : mortality7d <= 3
          ? 'warning'
          : 'negative';
  const fcrToneValue: KpiTone = fcrTone(fcr);
  const livabilityToneValue: KpiTone = livabilityTone(livability);
  const hasLayers = batches.some(
    (b) => b.poultry_type === 'layer' || b.poultry_type === 'breeder',
  );

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.content}
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
      >
        <OfflineBanner visible={!isOnline} pendingCount={pendingCount} />

        {/* Greeting */}
        <View style={styles.greetingWrap}>
          <Text style={styles.greeting}>
            {t('dashboard.hello')}{firstName ? `, ${firstName}` : ''}
          </Text>
          <Text style={styles.farmName}>{currentFarm?.farm_name ?? 'PoultryOS'}</Text>
        </View>

        {/* First-run setup progress (hero for freshly-onboarded farms) */}
        {showSetup && (
          <View style={styles.setupWrap}>
            <SetupProgressCard
              title={t('dashboard.setup.title')}
              progressLabel={t('dashboard.setup.progress', { done: setupDoneCount, total: setupSteps.length })}
              steps={setupSteps}
            />
          </View>
        )}

        {/* Heat-stress sticky banner */}
        {alert && (
          <HeatStressBanner
            severity={alert.severity === 'critical' ? 'critical' : 'warning'}
            maxTempForecast={alert.max_temp_forecast ?? null}
            mitigationActions={alert.mitigation_actions_json ?? []}
            onAcknowledge={acknowledgeAlert}
          />
        )}

        {/* Market price strip */}
        <View style={styles.stripWrap}>
          <MarketPriceStrip
            state={currentFarm?.state ?? null}
            priceDate={marketPrice?.price_date ?? null}
            broilerPricePerKg={marketPrice?.broiler_price_per_kg ?? null}
            eggPricePer100={marketPrice?.egg_price_per_100 ?? null}
            source={marketPrice?.source ?? null}
            loading={loading && !marketPrice}
            onPress={() => router.push('/market-prices')}
          />
        </View>

        {/* Weather */}
        <WeatherWidget
          currentTempC={weather?.current_temp_c ?? null}
          currentHumidity={weather?.current_humidity ?? null}
          maxTempToday={weather?.max_temp_today ?? null}
          heatStressThreshold={heatThreshold}
          alertSeverity={alert?.severity ?? null}
          lastFetchedAt={weather?.fetched_at ? new Date(weather.fetched_at) : null}
          loading={loading && !weather}
          onPress={() => setSnackbar(t('dashboard.weather_detail_coming'))}
          style={styles.weatherWidget}
        />

        {/* KPI grid */}
        <View style={styles.kpiGrid}>
          <KpiTile
            label={t('dashboard.kpi.active_birds')}
            value={activeBirds.toLocaleString('en-IN')}
            tone="neutral"
            style={styles.kpiTile}
          />
          <KpiTile
            label={t('dashboard.kpi.mortality_7d')}
            value={mortality7d === null ? '—' : mortality7d.toFixed(1)}
            unit={mortality7d === null ? undefined : '%'}
            tone={mortalityTone}
            style={styles.kpiTile}
          />
          <KpiTile
            label={t('dashboard.kpi.cumulative_fcr')}
            value={fcr === null ? '—' : fcr.toFixed(2)}
            tone={fcrToneValue}
            style={styles.kpiTile}
          />
          {hasLayers ? (
            <KpiTile
              label={t('dashboard.kpi.eggs_today')}
              value={eggsToday.toLocaleString('en-IN')}
              tone="neutral"
              style={styles.kpiTile}
            />
          ) : (
            <KpiTile
              label={t('dashboard.kpi.livability')}
              value={livability === null ? '—' : livability.toFixed(1)}
              unit={livability === null ? undefined : '%'}
              tone={livabilityToneValue}
              style={styles.kpiTile}
            />
          )}
        </View>

        {/* Smart Insights — rule-based week-over-week deltas with ₹ impact */}
        {insights.length > 0 && (
          <InsightsCard
            insights={insights}
            onPressInsight={(i) => router.push(`/batches/${i.batchId}`)}
            style={styles.insightsCard}
          />
        )}

        {/* Farm map — shed-occupancy grid (incl. empty sheds) */}
        <Text style={styles.sectionLabel}>{t('dashboard.farm_map_section')}</Text>
        {shedCells.length === 0 ? (
          <EmptyState
            title={t('dashboard.empty_batches.title')}
            description={t('dashboard.empty_batches.description')}
            actionLabel={t('dashboard.empty_batches.action')}
            onAction={() => router.push('/setup/sheds')}
          />
        ) : (
          <View style={styles.shedMapWrap}>
            <ShedMap
              sheds={shedCells}
              emptyLabel={t('dashboard.shed_empty')}
              birdsLabel={t('dashboard.shed_birds')}
              moreLabel={(n) => t('dashboard.shed_more', { count: n })}
              onPressShed={(shed) => {
                const b = batches.find((x) => x.shed_id === shed.id);
                if (b) router.push(`/batches/${b.id}`);
                else router.push('/setup/sheds');
              }}
            />
          </View>
        )}
      </ScrollView>

      <DailyLogFab onPress={() => router.push('/(tabs)/log')} />

      <Snackbar
        visible={snackbar !== null}
        onDismiss={() => setSnackbar(null)}
        duration={3500}
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
  content: {
    paddingBottom: spacing['3xl'] * 3,
    gap: spacing.lg,
  },
  greetingWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  greeting: {
    ...typography.displaySm,
    color: colors.ink,
  },
  farmName: {
    ...typography.captionUppercase,
    color: colors.body,
    marginTop: spacing.xxs,
  },
  weatherWidget: {
    marginHorizontal: spacing.lg,
  },
  setupWrap: {
    marginHorizontal: spacing.lg,
  },
  stripWrap: {
    marginHorizontal: spacing.lg,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  kpiTile: {
    flexGrow: 1,
    flexBasis: '46%',
  },
  sectionLabel: {
    ...typography.captionUppercase,
    color: colors.body,
    paddingHorizontal: spacing.lg,
  },
  shedMapWrap: {
    marginHorizontal: spacing.lg,
  },
  insightsCard: {
    marginHorizontal: spacing.lg,
  },
  batchCard: {
    marginHorizontal: spacing.lg,
  },
  batchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  batchInfo: {
    flex: 1,
  },
  batchCode: {
    ...typography.bodyMdStrong,
    color: colors.ink,
  },
  batchMeta: {
    ...typography.caption,
    color: colors.body,
    marginTop: spacing.xxs,
  },
  batchCount: {
    ...typography.displayXs,
    color: colors.primary,
  },
});
