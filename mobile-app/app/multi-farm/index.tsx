import { useCallback, useState } from 'react';
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Monitor } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { Card, EmptyState, UpgradeBanner } from '../../components/ui';
import { hasMultiFarmDashboard } from '../../lib/freemium';
import { useIsPaid } from '../../lib/freemium-hooks';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatDDMMMYYYY } from '../../lib/format-date';
import { formatINR as sharedINR, formatNumber as sharedNum } from '@poultryos/shared';

interface FarmSummaryRow {
  farm_id: string;
  farm_name: string;
  state: string;
  district: string;
  farm_type: 'independent' | 'contract';
  active_batches: number;
  total_birds: number;
  mortality_count_month: number;
  mortality_pct_month: number | null;
  feed_used_kg_month: number;
  eggs_collected_month: number;
  income_month: number;
  expense_month: number;
  net_pnl_month: number;
  pending_receivables: number;
  last_log_date: string | null;
}

function formatINR(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  return sharedINR(n);
}

function formatNum(n: number | null, suffix = ''): string {
  if (n === null || n === undefined) return '—';
  return `${sharedNum(n, 2)}${suffix}`;
}

export default function MultiFarmDashboard() {
  const router = useRouter();
  const { t } = useTranslation();
  const { isPaid } = useIsPaid();
  const gate = hasMultiFarmDashboard(isPaid);
  const [rows, setRows] = useState<FarmSummaryRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!gate.allowed) return;
    const { data, error } = await supabase.rpc('get_multi_farm_summary');
    if (error) {
      setSnackbar(error.message);
      setRefreshing(false);
      return;
    }
    setRows((data ?? []) as FarmSummaryRow[]);
    setRefreshing(false);
  }, [gate.allowed]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Aggregate header KPIs across all farms.
  const agg = (rows ?? []).reduce(
    (acc, r) => ({
      farms: acc.farms + 1,
      activeBatches: acc.activeBatches + Number(r.active_batches),
      totalBirds: acc.totalBirds + Number(r.total_birds),
      deathsMonth: acc.deathsMonth + Number(r.mortality_count_month),
      incomeMonth: acc.incomeMonth + Number(r.income_month),
      expenseMonth: acc.expenseMonth + Number(r.expense_month),
      receivables: acc.receivables + Number(r.pending_receivables),
    }),
    {
      farms: 0,
      activeBatches: 0,
      totalBirds: 0,
      deathsMonth: 0,
      incomeMonth: 0,
      expenseMonth: 0,
      receivables: 0,
    },
  );
  const netPnlMonth = agg.incomeMonth - agg.expenseMonth;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('multi_farm.title') }} />

      {!gate.allowed ? (
        <View style={styles.padded}>
          <UpgradeBanner reason={gate.reason ?? t('multi_farm.gate_reason')} />
          <View style={{ height: spacing.lg }} />
          <EmptyState
            title={t('multi_farm.pro.title')}
            description={t('multi_farm.pro.description')}
            actionLabel={t('multi_farm.pro.action')}
            onAction={() => router.push('/billing')}
          />
        </View>
      ) : Platform.OS !== 'web' ? (
        <View style={styles.padded}>
          <Card>
            <View style={styles.webOnlyHeader}>
              <Monitor size={28} color={colors.ink} />
              <Text style={styles.webOnlyTitle}>{t('multi_farm.web_only_title')}</Text>
            </View>
            <Text style={styles.webOnlyBody}>
              {t('multi_farm.web_only_p1')}
            </Text>
            <Text style={styles.webOnlyBody}>
              {t('multi_farm.web_only_p2')}
            </Text>
          </Card>
          <View style={{ height: spacing.md }} />
          <SummaryContent
            rows={rows}
            agg={agg}
            netPnlMonth={netPnlMonth}
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        </View>
      ) : (
        <SummaryContent
          rows={rows}
          agg={agg}
          netPnlMonth={netPnlMonth}
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      )}

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

interface SummaryContentProps {
  rows: FarmSummaryRow[] | null;
  agg: {
    farms: number;
    activeBatches: number;
    totalBirds: number;
    deathsMonth: number;
    incomeMonth: number;
    expenseMonth: number;
    receivables: number;
  };
  netPnlMonth: number;
  refreshing: boolean;
  onRefresh: () => void;
}

function SummaryContent({
  rows,
  agg,
  netPnlMonth,
  refreshing,
  onRefresh,
}: SummaryContentProps) {
  const { t } = useTranslation();
  if (rows === null) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.muted}>{t('multi_farm.loading_farms')}</Text>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.padded}>
        <EmptyState
          title={t('multi_farm.empty.title')}
          description={t('multi_farm.empty.description')}
        />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <View style={styles.aggGrid}>
        <AggTile label={t('multi_farm.kpi.farms')} value={agg.farms.toString()} />
        <AggTile label={t('multi_farm.kpi.active_batches')} value={agg.activeBatches.toString()} />
        <AggTile label={t('multi_farm.kpi.total_birds')} value={agg.totalBirds.toLocaleString('en-IN')} />
        <AggTile
          label={t('multi_farm.kpi.net_pnl_month')}
          value={formatINR(netPnlMonth)}
          tone={netPnlMonth >= 0 ? 'success' : 'danger'}
        />
        <AggTile
          label={t('multi_farm.kpi.deaths_month')}
          value={agg.deathsMonth.toLocaleString('en-IN')}
        />
        <AggTile
          label={t('multi_farm.kpi.receivables')}
          value={formatINR(agg.receivables)}
          tone={agg.receivables > 0 ? 'warning' : 'default'}
        />
      </View>

      <Text style={styles.sectionHeader}>{t('multi_farm.per_farm')}</Text>

      {rows.map((row) => (
        <Card key={row.farm_id} style={styles.farmCard}>
          <View style={styles.farmHeader}>
            <View style={{ flex: 1 }}>
              <Text style={styles.farmName}>{row.farm_name}</Text>
              <Text style={styles.farmMeta}>
                {row.district}, {row.state} ·{' '}
                {row.farm_type === 'contract' ? t('multi_farm.farm_type.contract') : t('multi_farm.farm_type.independent')}
              </Text>
            </View>
            {row.last_log_date ? (
              <View style={styles.pill}>
                <Text style={styles.pillLabel}>
                  {t('multi_farm.last_log', { date: formatDDMMMYYYY(row.last_log_date) })}
                </Text>
              </View>
            ) : null}
          </View>

          <View style={styles.kpiRow}>
            <FarmKpi label={t('multi_farm.kpi.active_batches')} value={row.active_batches.toString()} />
            <FarmKpi label={t('multi_farm.kpi.birds')} value={row.total_birds.toLocaleString('en-IN')} />
            <FarmKpi
              label={t('multi_farm.kpi.mortality_pct')}
              value={
                row.mortality_pct_month !== null
                  ? formatNum(row.mortality_pct_month, '%')
                  : '—'
              }
              tone={
                row.mortality_pct_month !== null && row.mortality_pct_month > 3
                  ? 'danger'
                  : 'default'
              }
            />
            <FarmKpi
              label={t('multi_farm.kpi.feed_kg')}
              value={formatNum(row.feed_used_kg_month)}
            />
            {row.eggs_collected_month > 0 ? (
              <FarmKpi
                label={t('multi_farm.kpi.eggs')}
                value={row.eggs_collected_month.toLocaleString('en-IN')}
              />
            ) : null}
            <FarmKpi
              label={t('multi_farm.kpi.net_month')}
              value={formatINR(row.net_pnl_month)}
              tone={row.net_pnl_month >= 0 ? 'success' : 'danger'}
            />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

interface AggTileProps {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'warning' | 'danger';
}

function AggTile({ label, value, tone = 'default' }: AggTileProps) {
  const valueColor =
    tone === 'success'
      ? colors.success
      : tone === 'danger'
        ? colors.primary
        : tone === 'warning'
          ? colors.warning
          : colors.ink;
  return (
    <View style={styles.aggTile}>
      <Text style={styles.aggLabel}>{label}</Text>
      <Text style={[styles.aggValue, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

interface FarmKpiProps {
  label: string;
  value: string;
  tone?: 'default' | 'success' | 'danger';
}

function FarmKpi({ label, value, tone = 'default' }: FarmKpiProps) {
  const color =
    tone === 'success'
      ? colors.success
      : tone === 'danger'
        ? colors.primary
        : colors.ink;
  return (
    <View style={styles.farmKpi}>
      <Text style={styles.farmKpiLabel}>{label}</Text>
      <Text style={[styles.farmKpiValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  padded: { padding: spacing.lg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  loadingWrap: { padding: spacing.lg, alignItems: 'center' },
  muted: { ...typography.bodySm, color: colors.body },
  sectionHeader: {
    ...typography.bodyMdStrong,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  aggGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  aggTile: {
    flexGrow: 1,
    flexBasis: '30%',
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.mute,
    borderRadius: radius.card,
    padding: spacing.md,
    minWidth: 140,
  },
  aggLabel: {
    ...typography.captionUppercase,
    color: colors.body,
  },
  aggValue: {
    ...typography.displayXs,
    color: colors.ink,
    marginTop: spacing.xxs,
  },
  farmCard: { gap: spacing.md },
  farmHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  farmName: { ...typography.bodyMdStrong, color: colors.ink },
  farmMeta: { ...typography.caption, color: colors.body, marginTop: spacing.xxs },
  pill: {
    backgroundColor: colors.canvasSoft,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  pillLabel: { ...typography.captionUppercase, color: colors.body },
  kpiRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  farmKpi: {
    minWidth: 100,
  },
  farmKpiLabel: { ...typography.captionUppercase, color: colors.body },
  farmKpiValue: { ...typography.bodyMdStrong, marginTop: spacing.xxs },
  webOnlyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  webOnlyTitle: { ...typography.bodyMdStrong, color: colors.ink },
  webOnlyBody: {
    ...typography.bodySm,
    color: colors.body,
    marginBottom: spacing.sm,
  },
});
