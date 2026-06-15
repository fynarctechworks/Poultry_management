import { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions, ViewStyle } from 'react-native';
import Svg, { Line as SvgLine, Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { currentHdep, type HdepWeekPoint } from '@poultryos/shared';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export interface HdepCurveCardProps {
  series: HdepWeekPoint[];
  /** Breed-standard peak HDEP % — drawn as a dashed reference line. */
  peakHdepPct?: number | null;
  style?: ViewStyle;
  testID?: string;
}

export function HdepCurveCard({ series, peakHdepPct, style, testID }: HdepCurveCardProps) {
  const { t } = useTranslation();
  const { width } = useWindowDimensions();

  const chartW = Math.max(260, width - spacing.lg * 4);
  const chartH = 160;
  const chart = useMemo(
    () => buildChart(series, peakHdepPct ?? null, chartW, chartH),
    [series, peakHdepPct, chartW, chartH],
  );

  if (series.length === 0) return null;
  const current = currentHdep(series);

  return (
    <View style={[styles.card, style]} testID={testID}>
      <Text style={styles.heading}>{t('hdep.title')}</Text>
      <View style={styles.statRow}>
        <Text style={styles.current}>
          {current === null ? '—' : `${current.toFixed(0)}%`}
        </Text>
        <Text style={styles.currentLabel}>
          {t('hdep.current')}
          {peakHdepPct ? ` · ${t('hdep.peak', { pct: peakHdepPct })}` : ''}
        </Text>
      </View>

      <View style={styles.chartWrap}>
        <Svg width={chartW} height={chartH}>
          {/* y gridlines at 0/50/100 */}
          {chart.gridY.map((g, i) => (
            <SvgLine
              key={`g${i}`}
              x1={chart.padLeft}
              y1={g.y}
              x2={chartW - chart.padRight}
              y2={g.y}
              stroke={colors.mute}
              strokeWidth={1}
            />
          ))}
          {chart.gridY.map((g, i) => (
            <SvgText key={`t${i}`} x={4} y={g.y + 4} fontSize={10} fill={colors.bodySoft}>
              {g.label}
            </SvgText>
          ))}
          {/* peak reference line */}
          {chart.peakY !== null ? (
            <SvgLine
              x1={chart.padLeft}
              y1={chart.peakY}
              x2={chartW - chart.padRight}
              y2={chart.peakY}
              stroke={colors.success}
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          ) : null}
          {/* HDEP line */}
          {chart.polyline ? (
            <Polyline points={chart.polyline} fill="none" stroke={colors.primary} strokeWidth={2} />
          ) : null}
          {chart.points.map((p, i) => (
            <Circle key={`p${i}`} cx={p.x} cy={p.y} r={3} fill={colors.primary} />
          ))}
        </Svg>
      </View>
      <Text style={styles.axisLabel}>{t('hdep.weeks_axis')}</Text>
    </View>
  );
}

function buildChart(
  series: HdepWeekPoint[],
  peakHdepPct: number | null,
  width: number,
  height: number,
) {
  const padLeft = 28;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 18;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxY = Math.max(100, ...series.map((p) => p.hdep), peakHdepPct ?? 0);
  const n = series.length;

  const toX = (i: number) => padLeft + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const toY = (v: number) => padTop + plotH - (v / maxY) * plotH;

  const points = series.map((p, i) => ({ x: toX(i), y: toY(p.hdep) }));
  const polyline = points.length ? points.map((p) => `${p.x},${p.y}`).join(' ') : null;

  const gridY = [0, 50, 100].map((v) => ({ y: toY(v), label: String(v) }));
  const peakY = peakHdepPct != null ? toY(peakHdepPct) : null;

  return { padLeft, padRight, plotW, plotH, points, polyline, gridY, peakY };
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.mute,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heading: { ...typography.captionUppercase, color: colors.body },
  statRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  current: { ...typography.displaySm, color: colors.ink },
  currentLabel: { ...typography.bodySm, color: colors.body },
  chartWrap: { alignItems: 'center', marginTop: spacing.xs },
  axisLabel: { ...typography.caption, color: colors.bodySoft, textAlign: 'center' },
});
