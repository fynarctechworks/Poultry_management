import { useCallback, useState } from 'react';
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { MessageCircle, Download } from 'lucide-react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import { Button, Card, RadioGroup, TextInput } from '../../components/ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import {
  buildOperationalReport,
  buildFinancialReport,
  buildCsv,
} from '../../lib/reports';


type ReportType = 'operational' | 'financial';

function startOfMonth(): string {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}
function endOfMonth(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d.toISOString().slice(0, 10);
}

export default function ReportsScreen() {
  const { t } = useTranslation();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const [reportType, setReportType] = useState<ReportType>('operational');
  const [fromDate, setFromDate] = useState<string>(startOfMonth());
  const [toDate, setToDate] = useState<string>(endOfMonth());
  const [generating, setGenerating] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [csvData, setCsvData] = useState<string | null>(null);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!currentFarm) {
      setSnackbar(t('reports.errors.pick_farm'));
      return;
    }
    setGenerating(true);
    setPreview(null);
    setCsvData(null);
    try {
      if (reportType === 'operational') {
        await generateOperational();
      } else {
        await generateFinancial();
      }
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : t('reports.errors.generate_failed'));
    } finally {
      setGenerating(false);
    }
  }, [currentFarm, reportType, fromDate, toDate]);

  async function generateOperational() {
    if (!currentFarm) return;
    const [batches, logs, vacc, health] = await Promise.all([
      supabase
        .from('batches')
        .select('id, opening_bird_count, current_bird_count, status')
        .eq('farm_id', currentFarm.id),
      supabase
        .from('daily_logs')
        .select('birds_dead, feed_consumed_kg, eggs_collected')
        .eq('farm_id', currentFarm.id)
        .gte('log_date', fromDate)
        .lte('log_date', toDate),
      supabase
        .from('vaccinations')
        .select('id')
        .eq('farm_id', currentFarm.id)
        .eq('status', 'done')
        .gte('administered_date', fromDate)
        .lte('administered_date', toDate),
      supabase
        .from('health_incidents')
        .select('id')
        .eq('farm_id', currentFarm.id)
        .gte('incident_date', fromDate)
        .lte('incident_date', toDate),
    ]);

    const activeBatches =
      (batches.data ?? []).filter((b) => b.status === 'active').length;
    const totalBirds = (batches.data ?? [])
      .filter((b) => b.status === 'active')
      .reduce((s, b) => s + Number(b.current_bird_count ?? 0), 0);
    const opening = (batches.data ?? [])
      .filter((b) => b.status === 'active')
      .reduce((s, b) => s + Number(b.opening_bird_count ?? 0), 0);

    const deaths = (logs.data ?? []).reduce(
      (s, l) => s + Number(l.birds_dead ?? 0),
      0,
    );
    const feedKg = (logs.data ?? []).reduce(
      (s, l) => s + Number(l.feed_consumed_kg ?? 0),
      0,
    );
    const eggs = (logs.data ?? []).reduce(
      (s, l) => s + Number(l.eggs_collected ?? 0),
      0,
    );
    const mortalityPct =
      opening > 0 ? Number(((deaths / opening) * 100).toFixed(2)) : null;

    const text = buildOperationalReport({
      farmName: currentFarm.farm_name,
      fromDate,
      toDate,
      activeBatches,
      totalBirds,
      deaths,
      mortalityPct,
      feedConsumedKg: Number(feedKg.toFixed(2)),
      eggsCollected: eggs,
      vaccinationsDone: (vacc.data ?? []).length,
      healthIncidents: (health.data ?? []).length,
    });

    setPreview(text);
    setCsvData(
      buildCsv(
        (logs.data ?? []).map((l, idx) => ({
          row: idx + 1,
          birds_dead: l.birds_dead ?? 0,
          feed_consumed_kg: l.feed_consumed_kg ?? 0,
          eggs_collected: l.eggs_collected ?? 0,
        })),
        ['row', 'birds_dead', 'feed_consumed_kg', 'eggs_collected'],
      ),
    );
  }

  async function generateFinancial() {
    if (!currentFarm) return;
    const { data, error } = await supabase
      .from('financial_transactions')
      .select(
        'id, transaction_type, category, amount, payment_status, transaction_date',
      )
      .eq('farm_id', currentFarm.id)
      .gte('transaction_date', fromDate)
      .lte('transaction_date', toDate);
    if (error) throw error;

    const rows = data ?? [];
    const totalIncome = rows
      .filter((r) => r.transaction_type === 'income')
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const totalExpense = rows
      .filter((r) => r.transaction_type === 'expense')
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const paidIncome = rows
      .filter((r) => r.transaction_type === 'income' && r.payment_status === 'paid')
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const pendingReceivables = rows
      .filter(
        (r) =>
          r.transaction_type === 'income' &&
          (r.payment_status === 'pending' || r.payment_status === 'partial'),
      )
      .reduce((s, r) => s + Number(r.amount ?? 0), 0);

    // Top expense category
    const expenseByCat = new Map<string, number>();
    for (const r of rows) {
      if (r.transaction_type === 'expense' && r.category) {
        expenseByCat.set(
          r.category,
          (expenseByCat.get(r.category) ?? 0) + Number(r.amount ?? 0),
        );
      }
    }
    let topExpenseCategory: string | null = null;
    let topExpenseAmount = 0;
    for (const [cat, amt] of expenseByCat.entries()) {
      if (amt > topExpenseAmount) {
        topExpenseCategory = cat;
        topExpenseAmount = amt;
      }
    }

    const text = buildFinancialReport({
      farmName: currentFarm.farm_name,
      fromDate,
      toDate,
      totalIncome,
      totalExpense,
      netPnl: totalIncome - totalExpense,
      paidIncome,
      pendingReceivables,
      topExpenseCategory,
      topExpenseAmount,
    });

    setPreview(text);
    setCsvData(
      buildCsv(
        rows.map((r) => ({
          date: r.transaction_date,
          type: r.transaction_type,
          category: r.category ?? '',
          amount: r.amount,
          payment_status: r.payment_status,
        })),
        ['date', 'type', 'category', 'amount', 'payment_status'],
      ),
    );
  }

  async function shareWhatsApp() {
    if (!preview) return;
    const encoded = encodeURIComponent(preview);
    const native = `whatsapp://send?text=${encoded}`;
    const fallback = `https://wa.me/?text=${encoded}`;
    try {
      const ok = await Linking.canOpenURL(native);
      await Linking.openURL(ok ? native : fallback);
    } catch {
      try { await Linking.openURL(fallback); }
      catch (err) {
        setSnackbar(err instanceof Error ? err.message : t('reports.errors.whatsapp_failed'));
      }
    }
  }

  async function downloadCsv() {
    if (!csvData) return;
    const filename = `poultryos-${reportType}-${fromDate}-to-${toDate}.csv`;
    if (Platform.OS === 'web') {
      // Web: trigger a blob download.
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const w = typeof window !== 'undefined' ? (window as any) : null;
        if (!w) {
          setSnackbar(t('reports.errors.download_unavailable'));
          return;
        }
        const blob = new w.Blob([csvData], { type: 'text/csv' });
        const url = w.URL.createObjectURL(blob);
        const a = w.document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        w.URL.revokeObjectURL(url);
      } catch (err) {
        setSnackbar(err instanceof Error ? err.message : t('reports.errors.download_failed'));
      }
      return;
    }
    try {
      const uri = `${FileSystem.cacheDirectory}${filename}`;
      await FileSystem.writeAsStringAsync(uri, csvData);
      const sharingAvailable = await Sharing.isAvailableAsync();
      if (sharingAvailable) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: t('reports.export_csv') });
      } else {
        setSnackbar(t('reports.csv_saved', { uri }));
      }
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : t('reports.errors.export_failed'));
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('reports.title') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.sectionTitle}>{t('reports.report_type')}</Text>
          <RadioGroup
            label=""
            options={[
              { value: 'operational', label: t('reports.type.operational') },
              { value: 'financial', label: t('reports.type.financial') },
            ]}
            value={reportType}
            onChange={(v) => setReportType(v as ReportType)}
          />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>{t('reports.date_range')}</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateCol}>
              <TextInput
                label={t('reports.from')}
                value={fromDate}
                onChangeText={setFromDate}
                placeholder={t('reports.date_placeholder')}
                autoCapitalize="none"
              />
            </View>
            <View style={styles.dateCol}>
              <TextInput
                label={t('reports.to')}
                value={toDate}
                onChangeText={setToDate}
                placeholder={t('reports.date_placeholder')}
                autoCapitalize="none"
              />
            </View>
          </View>
          <Button
            variant="primary"
            label={generating ? t('reports.generating') : t('reports.generate')}
            onPress={generate}
            disabled={generating}
            fullWidth
          />
        </Card>

        {preview ? (
          <Card>
            <Text style={styles.sectionTitle}>{t('reports.preview')}</Text>
            <View style={styles.previewBox}>
              <Text style={styles.previewText}>{preview}</Text>
            </View>
            <View style={styles.actionRow}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Share report on WhatsApp"
                onPress={shareWhatsApp}
                style={({ pressed }) => [
                  styles.shareBtn,
                  pressed && styles.btnPressed,
                ]}
              >
                <MessageCircle size={18} color={colors.onPrimary} />
                <Text style={styles.shareBtnLabel}>{t('reports.whatsapp')}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Download CSV"
                onPress={downloadCsv}
                disabled={!csvData}
                style={({ pressed }) => [
                  styles.csvBtn,
                  !csvData && styles.btnDisabled,
                  pressed && csvData && styles.btnPressed,
                ]}
              >
                <Download size={18} color={colors.ink} />
                <Text style={styles.csvBtnLabel}>{t('reports.csv')}</Text>
              </Pressable>
            </View>
          </Card>
        ) : null}
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  sectionTitle: {
    ...typography.bodyMdStrong,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  dateRow: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md },
  dateCol: { flex: 1 },
  previewBox: {
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  previewText: {
    ...typography.bodySm,
    color: colors.ink,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  actionRow: { flexDirection: 'row', gap: spacing.md },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.whatsapp,
    borderRadius: radius.pillLg,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    flex: 1,
  },
  shareBtnLabel: { ...typography.bodyMdStrong, color: colors.onPrimary },
  csvBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.canvas,
    borderColor: colors.ink,
    borderWidth: 1,
    borderRadius: radius.pillLg,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    flex: 1,
  },
  csvBtnLabel: { ...typography.bodyMdStrong, color: colors.ink },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.5 },
});
