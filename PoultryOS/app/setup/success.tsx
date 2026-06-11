import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PartyPopper, Warehouse, Egg, ListChecks } from 'lucide-react-native';
import { useFarmStore } from '../../stores/farm';
import { supabase } from '../../lib/supabase';
import { Button, Card } from '../../components/ui';
import { colors, spacing, typography, radius } from '../../theme/tokens';

export default function SetupSuccess() {
  const { t } = useTranslation();
  const router = useRouter();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const [shedCount, setShedCount] = useState<number | null>(null);
  const [batchCount, setBatchCount] = useState<number | null>(null);

  useEffect(() => {
    if (!currentFarm?.id) return;
    (async () => {
      const [{ count: sheds }, { count: batches }] = await Promise.all([
        supabase.from('sheds').select('id', { count: 'exact', head: true }).eq('farm_id', currentFarm.id),
        supabase.from('batches').select('id', { count: 'exact', head: true }).eq('farm_id', currentFarm.id),
      ]);
      setShedCount(sheds ?? 0);
      setBatchCount(batches ?? 0);
    })();
  }, [currentFarm?.id]);

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.iconCircle}>
          <PartyPopper size={40} color={colors.onPrimary} />
        </View>
        <Text style={styles.heading}>{t('setup.success.title')}</Text>
        <Text style={styles.sub}>
          {t('setup.success.sub', { farm: currentFarm?.farm_name ?? t('setup.success.your_farm') })}
        </Text>

        <Card style={styles.summary}>
          <SummaryRow icon={<Warehouse size={18} color={colors.ink} />}
            label={t('setup.success.sheds')} value={shedCount} />
          <View style={styles.divider} />
          <SummaryRow icon={<Egg size={18} color={colors.ink} />}
            label={t('setup.success.batches')} value={batchCount} />
        </Card>

        <Card style={styles.nextCard}>
          <View style={styles.nextHeader}>
            <ListChecks size={18} color={colors.primary} />
            <Text style={styles.nextTitle}>{t('setup.success.next_title')}</Text>
          </View>
          <Text style={styles.nextItem}>{t('setup.success.next_log')}</Text>
          <Text style={styles.nextItem}>{t('setup.success.next_buyers')}</Text>
          <Text style={styles.nextItem}>{t('setup.success.next_trial')}</Text>
        </Card>

        <Button
          label={t('setup.success.go_to_dashboard')}
          variant="primary"
          onPress={() => router.replace('/(tabs)/dashboard')}
          fullWidth
          style={styles.cta}
        />
      </ScrollView>
    </View>
  );
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | null }) {
  return (
    <View style={styles.summaryRow}>
      <View style={styles.summaryIcon}>{icon}</View>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  scroll: { flexGrow: 1, padding: spacing.lg, alignItems: 'center', justifyContent: 'center' },
  iconCircle: {
    width: 88, height: 88, borderRadius: radius.full, backgroundColor: colors.success,
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.xl,
  },
  heading: { ...typography.displayMd, color: colors.ink, textAlign: 'center', marginBottom: spacing.sm },
  sub: { ...typography.bodyMd, color: colors.body, textAlign: 'center', marginBottom: spacing['2xl'] },
  summary: { alignSelf: 'stretch', marginBottom: spacing.lg },
  summaryRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  summaryIcon: {
    width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.canvasSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  summaryLabel: { ...typography.bodyMd, color: colors.ink, flex: 1 },
  summaryValue: { ...typography.displayXs, color: colors.ink },
  divider: { height: 1, backgroundColor: colors.mute, marginVertical: spacing.xs },
  nextCard: { alignSelf: 'stretch', marginBottom: spacing['2xl'], gap: spacing.xs },
  nextHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  nextTitle: { ...typography.bodyMdStrong, color: colors.ink },
  nextItem: { ...typography.bodySm, color: colors.body },
  cta: { alignSelf: 'stretch' },
});
