import { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Svg, { Line, Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import { Button, Card, EmptyState, TextInput } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { todayISO } from '../../lib/format-date';

interface PriceRow {
  price_date: string;
  broiler_price_per_kg: number | null;
  egg_price_per_100: number | null;
  source: 'agmarknet' | 'nafed' | 'manual';
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function makeSchema(t: TFunction) {
  return z
    .object({
      price_date: z.string().regex(ISO_DATE_RE, t('market_prices.errors.date_format')),
      broiler: z
        .string()
        .optional()
        .refine(
          (v) => !v || (!Number.isNaN(parseFloat(v)) && parseFloat(v) >= 0),
          t('market_prices.errors.non_negative'),
        ),
      eggs: z
        .string()
        .optional()
        .refine(
          (v) => !v || (!Number.isNaN(parseFloat(v)) && parseFloat(v) >= 0),
          t('market_prices.errors.non_negative'),
        ),
    })
    .refine((d) => (d.broiler && d.broiler !== '') || (d.eggs && d.eggs !== ''), {
      message: t('market_prices.errors.either_price'),
      path: ['broiler'],
    });
}

type FormFields = z.infer<ReturnType<typeof makeSchema>>;

export default function MarketPricesScreen() {
  const { t } = useTranslation();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const { width } = useWindowDimensions();
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const schema = useMemo(() => makeSchema(t), [t]);

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      price_date: todayISO(),
      broiler: '',
      eggs: '',
    },
  });

  const state = currentFarm?.state ?? null;

  const load = useCallback(async () => {
    if (!state) return;
    const since = new Date();
    since.setDate(since.getDate() - 14);
    const sinceIso = since.toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('market_prices')
      .select('price_date, broiler_price_per_kg, egg_price_per_100, source')
      .eq('state', state)
      .gte('price_date', sinceIso)
      .order('price_date', { ascending: true });
    if (error) {
      setSnackbar(error.message);
      return;
    }
    setRows((data ?? []) as PriceRow[]);
  }, [state]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onSubmit = async (values: FormFields) => {
    if (!state) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc('upsert_market_price', {
        p_state: state,
        p_price_date: values.price_date,
        p_broiler_price_per_kg: values.broiler ? parseFloat(values.broiler) : null,
        p_egg_price_per_100: values.eggs ? parseFloat(values.eggs) : null,
      });
      if (error) throw error;
      reset({ price_date: todayISO(), broiler: '', eggs: '' });
      setSnackbar(t('market_prices.saved'));
      load();
    } catch (err: unknown) {
      setSnackbar(err instanceof Error ? err.message : t('market_prices.save_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const chartW = Math.max(280, width - spacing.lg * 4);
  const chartH = 180;
  const chart = useMemo(
    () => buildChart(rows, chartW, chartH),
    [rows, chartW, chartH],
  );

  if (!state) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: t('market_prices.title') }} />
        <EmptyState
          title={t('market_prices.no_state.title')}
          description={t('market_prices.no_state.description')}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('market_prices.state_title', { state }) }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.sectionTitle}>{t('market_prices.trend_14d')}</Text>
          {rows.length === 0 ? (
            <Text style={styles.muted}>
              {t('market_prices.no_data', { state })}
            </Text>
          ) : (
            <View style={styles.chartWrap}>
              <Svg width={chartW} height={chartH}>
                {chart.gridY.map((g, i) => (
                  <Line
                    key={`g-${i}`}
                    x1={chart.padLeft}
                    y1={g.y}
                    x2={chartW - chart.padRight}
                    y2={g.y}
                    stroke={colors.mute}
                    strokeWidth={1}
                  />
                ))}
                {chart.broilerPolyline ? (
                  <Polyline
                    points={chart.broilerPolyline}
                    fill="none"
                    stroke={colors.primary}
                    strokeWidth={2}
                  />
                ) : null}
                {chart.eggPolyline ? (
                  <Polyline
                    points={chart.eggPolyline}
                    fill="none"
                    stroke={colors.success}
                    strokeWidth={2}
                  />
                ) : null}
                {chart.broilerPoints.map((p, i) => (
                  <Circle
                    key={`b-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={3}
                    fill={colors.primary}
                  />
                ))}
                {chart.eggPoints.map((p, i) => (
                  <Circle
                    key={`e-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={3}
                    fill={colors.success}
                  />
                ))}
                {chart.gridY.map((g, i) => (
                  <SvgText
                    key={`gt-${i}`}
                    x={chart.padLeft - 4}
                    y={g.y + 4}
                    fontSize={10}
                    fill={colors.body}
                    textAnchor="end"
                  >
                    {g.label}
                  </SvgText>
                ))}
              </Svg>
              <View style={styles.legendRow}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                  <Text style={styles.legendText}>{t('market_prices.legend_broiler')}</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
                  <Text style={styles.legendText}>{t('market_prices.legend_eggs')}</Text>
                </View>
              </View>
            </View>
          )}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>{t('market_prices.set_today')}</Text>
          <View style={styles.form}>
            <Controller
              control={control}
              name="price_date"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={`${t('market_prices.date_label')} *`}
                  value={value}
                  onChangeText={onChange}
                  placeholder={t('market_prices.date_placeholder')}
                  autoCapitalize="none"
                  error={errors.price_date?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="broiler"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={t('market_prices.broiler_label')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  keyboardType="decimal-pad"
                  error={errors.broiler?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="eggs"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={t('market_prices.egg_label')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  keyboardType="decimal-pad"
                  error={errors.eggs?.message}
                />
              )}
            />
            <Button
              variant="primary"
              label={submitting ? t('market_prices.saving') : t('market_prices.save')}
              onPress={handleSubmit(onSubmit)}
              disabled={submitting}
              fullWidth
            />
          </View>
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>{t('market_prices.recent_entries')}</Text>
          {rows.length === 0 ? (
            <Text style={styles.muted}>—</Text>
          ) : (
            <View style={styles.table}>
              {[...rows].reverse().map((r) => (
                <View key={r.price_date} style={styles.tableRow}>
                  <Text style={styles.tableDate}>{r.price_date}</Text>
                  <Text style={styles.tablePrice}>
                    {r.broiler_price_per_kg !== null
                      ? `₹${r.broiler_price_per_kg}/kg`
                      : '—'}
                  </Text>
                  <Text style={styles.tablePrice}>
                    {r.egg_price_per_100 !== null
                      ? `₹${r.egg_price_per_100}/100`
                      : '—'}
                  </Text>
                  <Text style={styles.tableSource}>{r.source.toUpperCase()}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Pure chart helper — separated for clarity, no external chart lib needed.
// ---------------------------------------------------------------------------

function buildChart(rows: PriceRow[], width: number, height: number) {
  const padLeft = 36;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 18;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const xs = rows.map((r) => new Date(r.price_date).getTime());
  const minX = xs.length ? Math.min(...xs) : 0;
  const maxX = xs.length ? Math.max(...xs) : 1;

  const allY: number[] = [];
  for (const r of rows) {
    if (r.broiler_price_per_kg !== null) allY.push(Number(r.broiler_price_per_kg));
    if (r.egg_price_per_100 !== null) allY.push(Number(r.egg_price_per_100));
  }
  const minY = allY.length ? Math.min(...allY) : 0;
  const maxY = allY.length ? Math.max(...allY) : 1;
  const ySpan = maxY - minY || 1;

  const toXY = (date: string, y: number) => {
    const t = new Date(date).getTime();
    const px =
      padLeft + (maxX === minX ? plotW / 2 : ((t - minX) / (maxX - minX)) * plotW);
    const py = padTop + plotH - ((y - minY) / ySpan) * plotH;
    return { x: px, y: py };
  };

  const broilerPoints = rows
    .filter((r) => r.broiler_price_per_kg !== null)
    .map((r) => toXY(r.price_date, Number(r.broiler_price_per_kg)));
  const eggPoints = rows
    .filter((r) => r.egg_price_per_100 !== null)
    .map((r) => toXY(r.price_date, Number(r.egg_price_per_100)));

  const polylineStr = (pts: { x: number; y: number }[]) =>
    pts.length >= 2 ? pts.map((p) => `${p.x},${p.y}`).join(' ') : null;

  const ticks = 4;
  const gridY = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = minY + (ySpan * i) / ticks;
    const y = padTop + plotH - (i / ticks) * plotH;
    return { y, label: Math.round(v).toString() };
  });

  return {
    padLeft,
    padRight,
    padTop,
    padBottom,
    broilerPoints,
    eggPoints,
    broilerPolyline: polylineStr(broilerPoints),
    eggPolyline: polylineStr(eggPoints),
    gridY,
  };
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  sectionTitle: { ...typography.bodyMdStrong, color: colors.ink, marginBottom: spacing.sm },
  muted: { ...typography.bodySm, color: colors.body },
  chartWrap: { alignItems: 'center', gap: spacing.sm },
  legendRow: { flexDirection: 'row', gap: spacing.lg },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  legendDot: { width: 10, height: 10, borderRadius: radius.full },
  legendText: { ...typography.captionStrong, color: colors.body },
  form: { gap: spacing.md },
  table: { gap: spacing.xs },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
    borderBottomColor: colors.mute,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  tableDate: { ...typography.bodySmStrong, color: colors.ink, width: 90 },
  tablePrice: { ...typography.bodySm, color: colors.ink, flex: 1, textAlign: 'right' },
  tableSource: { ...typography.captionStrong, color: colors.body, width: 70, textAlign: 'right' },
});
