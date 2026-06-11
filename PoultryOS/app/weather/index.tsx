import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import {
  Cloud,
  CloudRain,
  Droplets,
  Flame,
  Sun,
  Thermometer,
  Wind,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import { Card, EmptyState } from '../../components/ui';
import { colors, radius, spacing, typography, fonts } from '../../theme/tokens';
import { formatDDMMMYYYY } from '../../lib/format-date';

interface ForecastSlot {
  dt: number;           // unix seconds (OpenWeatherMap convention)
  temp: number;
  humidity?: number;
  weather?: Array<{ main?: string; description?: string }>;
}

interface WeatherDataRow {
  current_temp_c: number | null;
  current_humidity: number | null;
  forecast_json: { hourly?: ForecastSlot[]; daily?: ForecastSlot[] } | null;
  max_temp_today: number | null;
  heat_stress_alert_triggered: boolean | null;
  fetched_at: string | null;
}

interface AlertRow {
  id: string;
  alert_type: 'heat_stress' | 'cold_stress' | 'heavy_rain';
  alert_date: string;
  severity: 'warning' | 'critical';
  max_temp_forecast: number | null;
  humidity_forecast: number | null;
  mitigation_actions_json: { actions?: string[] } | string[] | null;
  acknowledged_at: string | null;
  created_at: string;
}

function weatherIcon(main: string | undefined) {
  const m = (main ?? '').toLowerCase();
  if (m.includes('rain')) return <CloudRain size={28} color={colors.ink} />;
  if (m.includes('cloud')) return <Cloud size={28} color={colors.ink} />;
  if (m.includes('wind')) return <Wind size={28} color={colors.ink} />;
  return <Sun size={28} color={colors.heat} />;
}

function unixToHour(dt: number): string {
  const d = new Date(dt * 1000);
  const hh = String(d.getHours()).padStart(2, '0');
  return `${hh}:00`;
}

function unixToDay(dt: number): string {
  const d = new Date(dt * 1000);
  return d.toLocaleDateString('en-IN', { weekday: 'short' });
}

export default function WeatherScreen() {
  const { t } = useTranslation();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const heatThreshold = currentFarm?.heat_stress_threshold_celsius ?? 35;
  const [weather, setWeather] = useState<WeatherDataRow | null>(null);
  const [alerts, setAlerts] = useState<AlertRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentFarm) {
      setWeather(null);
      setAlerts([]);
      return;
    }
    const [{ data: wd, error: wErr }, { data: al, error: aErr }] = await Promise.all([
      supabase
        .from('weather_data')
        .select(
          'current_temp_c, current_humidity, forecast_json, max_temp_today, heat_stress_alert_triggered, fetched_at',
        )
        .eq('farm_id', currentFarm.id)
        .maybeSingle(),
      supabase
        .from('weather_alerts')
        .select(
          'id, alert_type, alert_date, severity, max_temp_forecast, humidity_forecast, mitigation_actions_json, acknowledged_at, created_at',
        )
        .eq('farm_id', currentFarm.id)
        .order('alert_date', { ascending: false })
        .limit(20),
    ]);
    if (wErr) setSnackbar(wErr.message);
    if (aErr) setSnackbar(aErr.message);
    setWeather((wd as WeatherDataRow) ?? null);
    setAlerts((al ?? []) as AlertRow[]);
    setRefreshing(false);
  }, [currentFarm]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function acknowledgeAlert(alertId: string) {
    const { error } = await supabase
      .from('weather_alerts')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', alertId);
    if (error) {
      setSnackbar(error.message);
      return;
    }
    load();
  }

  const hourly = (weather?.forecast_json?.hourly ?? []).slice(0, 24);
  const daily = (weather?.forecast_json?.daily ?? []).slice(0, 4);
  const activeAlert = (alerts ?? []).find(
    (a) => !a.acknowledged_at && new Date(a.alert_date) >= startOfToday(),
  );

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('weather_screen.title') }} />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); load(); }}
            tintColor={colors.primary}
          />
        }
      >
        {/* Active heat-stress banner */}
        {activeAlert ? (
          <View style={styles.heatBanner}>
            <View style={styles.heatBannerHead}>
              <Flame size={24} color={colors.onPrimary} />
              <Text style={styles.heatTitle}>
                {activeAlert.severity === 'critical' ? t('weather_screen.critical') : t('weather_screen.heat_stress_alert')}
              </Text>
            </View>
            <Text style={styles.heatBody}>
              {t('weather_screen.alert_body', {
                temp: activeAlert.max_temp_forecast ?? '—',
                hum: activeAlert.humidity_forecast !== null ? ` · ${activeAlert.humidity_forecast}% RH` : '',
                date: formatDDMMMYYYY(activeAlert.alert_date),
              })}
            </Text>
            {renderActions(activeAlert).length > 0 ? (
              <View style={styles.actionList}>
                {renderActions(activeAlert).map((a, idx) => (
                  <Text key={idx} style={styles.actionItem}>• {a}</Text>
                ))}
              </View>
            ) : null}
            <View style={styles.ackBtnWrap}>
              <Text
                style={styles.ackBtn}
                onPress={() => acknowledgeAlert(activeAlert.id)}
                accessibilityRole="button"
              >
                {t('weather_screen.acknowledge')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Current conditions */}
        <Card>
          <Text style={styles.cardTitle}>{t('weather_screen.current_conditions')}</Text>
          {weather ? (
            <View style={styles.currentGrid}>
              <View style={styles.currentTile}>
                <Thermometer size={24} color={colors.heat} />
                <Text style={styles.currentLabel}>{t('weather_screen.temperature')}</Text>
                <Text style={styles.currentValue}>
                  {weather.current_temp_c !== null ? `${weather.current_temp_c}°C` : '—'}
                </Text>
              </View>
              <View style={styles.currentTile}>
                <Droplets size={24} color={colors.ink} />
                <Text style={styles.currentLabel}>{t('weather_screen.humidity')}</Text>
                <Text style={styles.currentValue}>
                  {weather.current_humidity !== null ? `${weather.current_humidity}%` : '—'}
                </Text>
              </View>
              <View style={styles.currentTile}>
                <Sun size={24} color={colors.heat} />
                <Text style={styles.currentLabel}>{t('weather_screen.max_today')}</Text>
                <Text style={styles.currentValue}>
                  {weather.max_temp_today !== null ? `${weather.max_temp_today}°C` : '—'}
                </Text>
              </View>
              <View style={styles.currentTile}>
                <Flame size={24} color={colors.body} />
                <Text style={styles.currentLabel}>{t('weather_screen.your_threshold')}</Text>
                <Text style={styles.currentValue}>{heatThreshold}°C</Text>
              </View>
            </View>
          ) : (
            <Text style={styles.muted}>{t('weather_screen.no_data_inline')}</Text>
          )}
          {weather?.fetched_at ? (
            <Text style={styles.timestamp}>
              {t('weather_screen.updated_at', { ts: new Date(weather.fetched_at).toLocaleString('en-IN') })}
            </Text>
          ) : null}
        </Card>

        {/* Hourly forecast */}
        {hourly.length > 0 ? (
          <Card>
            <Text style={styles.cardTitle}>{t('weather_screen.next_24h')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hourlyRow}
            >
              {hourly.map((h, idx) => (
                <View key={idx} style={styles.hourlyCell}>
                  <Text style={styles.hourlyLabel}>{unixToHour(h.dt)}</Text>
                  {weatherIcon(h.weather?.[0]?.main)}
                  <Text style={styles.hourlyTemp}>{Math.round(h.temp)}°</Text>
                  {h.humidity !== undefined ? (
                    <Text style={styles.hourlyHumidity}>{h.humidity}%</Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          </Card>
        ) : null}

        {/* Daily forecast */}
        {daily.length > 0 ? (
          <Card>
            <Text style={styles.cardTitle}>{t('weather_screen.three_day')}</Text>
            {daily.map((d, idx) => (
              <View key={idx} style={[styles.dailyRow, idx === daily.length - 1 && styles.dailyLast]}>
                <View style={styles.dailyLeft}>
                  {weatherIcon(d.weather?.[0]?.main)}
                  <Text style={styles.dailyDay}>{unixToDay(d.dt)}</Text>
                </View>
                <View style={styles.dailyRight}>
                  <Text style={styles.dailyTemp}>{Math.round(d.temp)}°C</Text>
                  {d.humidity !== undefined ? (
                    <Text style={styles.dailyHumidity}>{d.humidity}%</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Alert history */}
        {alerts && alerts.length > 0 ? (
          <Card>
            <Text style={styles.cardTitle}>{t('weather_screen.alert_history')}</Text>
            {alerts.map((a) => (
              <View key={a.id} style={styles.alertRow}>
                <View style={styles.alertHead}>
                  <Text style={styles.alertDate}>{formatDDMMMYYYY(a.alert_date)}</Text>
                  <View
                    style={[
                      styles.alertSeverity,
                      {
                        backgroundColor:
                          a.severity === 'critical' ? colors.primary : colors.canvasSoft,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.alertSeverityText,
                        { color: a.severity === 'critical' ? colors.onPrimary : colors.ink },
                      ]}
                    >
                      {t(`weather_screen.severity.${a.severity}`)}
                    </Text>
                  </View>
                </View>
                <Text style={styles.alertMeta}>
                  {t(`weather_screen.alert_type.${a.alert_type}`)} · {a.max_temp_forecast ?? '—'}°C
                  {a.humidity_forecast !== null ? ` · ${a.humidity_forecast}% RH` : ''}
                </Text>
                {a.acknowledged_at ? (
                  <Text style={styles.alertAck}>
                    {t('weather_screen.alert_acknowledged', { date: new Date(a.acknowledged_at).toLocaleDateString('en-IN') })}
                  </Text>
                ) : null}
              </View>
            ))}
          </Card>
        ) : null}

        {!weather && (!alerts || alerts.length === 0) ? (
          <EmptyState
            title={t('weather_screen.empty.title')}
            description={t('weather_screen.empty.description')}
          />
        ) : null}
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

function renderActions(alert: AlertRow): string[] {
  const raw = alert.mitigation_actions_json;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.filter((s): s is string => typeof s === 'string');
  if (Array.isArray((raw as { actions?: string[] }).actions)) {
    return ((raw as { actions: string[] }).actions ?? []).filter(
      (s): s is string => typeof s === 'string',
    );
  }
  return [];
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  heatBanner: {
    backgroundColor: colors.heat,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heatBannerHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  heatTitle: {
    ...typography.bodyMdStrong,
    color: colors.onPrimary,
  },
  heatBody: {
    ...typography.bodySm,
    color: colors.onPrimary,
  },
  actionList: { marginTop: spacing.xs, gap: spacing.xxs },
  actionItem: {
    ...typography.bodySm,
    color: colors.onPrimary,
  },
  ackBtnWrap: {
    marginTop: spacing.sm,
    alignSelf: 'flex-start',
  },
  ackBtn: {
    ...typography.captionUppercase,
    color: colors.onPrimary,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  cardTitle: {
    ...typography.bodyMdStrong,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  muted: { ...typography.bodySm, color: colors.body },
  timestamp: {
    ...typography.caption,
    color: colors.body,
    marginTop: spacing.md,
  },
  currentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  currentTile: {
    flexGrow: 1,
    flexBasis: '40%',
    minWidth: 130,
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.xxs,
  },
  currentLabel: {
    ...typography.captionUppercase,
    color: colors.body,
    marginTop: spacing.xs,
  },
  currentValue: {
    ...typography.displayXs,
    color: colors.ink,
  },
  hourlyRow: { gap: spacing.md, paddingVertical: spacing.sm },
  hourlyCell: {
    alignItems: 'center',
    gap: spacing.xs,
    minWidth: 56,
  },
  hourlyLabel: { ...typography.caption, color: colors.body },
  hourlyTemp: { ...typography.bodyMdStrong, color: colors.ink },
  hourlyHumidity: { ...typography.caption, color: colors.body },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.mute,
  },
  dailyLast: { borderBottomWidth: 0 },
  dailyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dailyDay: { ...typography.bodyMd, color: colors.ink },
  dailyRight: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
  },
  dailyTemp: { ...typography.bodyMdStrong, color: colors.ink },
  dailyHumidity: { ...typography.caption, color: colors.body },
  alertRow: {
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.mute,
    gap: spacing.xxs,
  },
  alertHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  alertDate: { ...typography.bodyMdStrong, color: colors.ink },
  alertSeverity: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  alertSeverityText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700', fontFamily: fonts.bold,
    letterSpacing: 0.4,
  },
  alertMeta: { ...typography.caption, color: colors.body },
  alertAck: { ...typography.caption, color: colors.success, marginTop: spacing.xxs },
});
