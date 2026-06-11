import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { Card, Toggle } from '../../components/ui';
import { colors, spacing, typography } from '../../theme/tokens';

type CategoryKey =
  | 'daily_digest'
  | 'mortality_alert'
  | 'vaccination_reminder'
  | 'heat_stress_alert'
  | 'payment_reminder'
  | 'low_stock_alert';

const CATEGORY_KEYS: CategoryKey[] = [
  'mortality_alert',
  'heat_stress_alert',
  'vaccination_reminder',
  'payment_reminder',
  'low_stock_alert',
  'daily_digest',
];

interface ProfileRow {
  whatsapp_opt_in: boolean;
  whatsapp_preferences: Record<string, boolean> | null;
}

const DEFAULT_PREFS: Record<CategoryKey, boolean> = {
  daily_digest: true,
  mortality_alert: true,
  vaccination_reminder: true,
  heat_stress_alert: true,
  payment_reminder: true,
  low_stock_alert: true,
};

export default function WhatsAppSettingsScreen() {
  const { t } = useTranslation();
  const [optIn, setOptIn] = useState<boolean>(true);
  const [prefs, setPrefs] = useState<Record<CategoryKey, boolean>>(DEFAULT_PREFS);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('whatsapp_opt_in, whatsapp_preferences')
      .eq('id', user.id)
      .maybeSingle();
    if (error) {
      setSnackbar(error.message);
      return;
    }
    if (data) {
      const row = data as ProfileRow;
      setOptIn(row.whatsapp_opt_in ?? true);
      const stored = (row.whatsapp_preferences ?? {}) as Record<string, boolean>;
      setPrefs({
        daily_digest:          stored.daily_digest          ?? true,
        mortality_alert:       stored.mortality_alert       ?? true,
        vaccination_reminder:  stored.vaccination_reminder  ?? true,
        heat_stress_alert:     stored.heat_stress_alert     ?? true,
        payment_reminder:      stored.payment_reminder      ?? true,
        low_stock_alert:       stored.low_stock_alert       ?? true,
      });
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function persist(nextOptIn: boolean, nextPrefs: Record<CategoryKey, boolean>) {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setSnackbar(t('whatsapp_settings.not_signed_in'));
        return;
      }
      const { error } = await supabase
        .from('profiles')
        .update({
          whatsapp_opt_in: nextOptIn,
          whatsapp_preferences: nextPrefs,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id);
      if (error) throw error;
      setSnackbar(t('whatsapp_settings.saved'));
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : t('whatsapp_settings.save_failed'));
    } finally {
      setSaving(false);
    }
  }

  function setGlobal(value: boolean) {
    setOptIn(value);
    persist(value, prefs);
  }

  function setCategory(key: CategoryKey, value: boolean) {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    persist(optIn, next);
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('whatsapp_settings.title') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Toggle
            label={t('whatsapp_settings.master_label')}
            description={t('whatsapp_settings.master_description')}
            value={optIn}
            onValueChange={setGlobal}
            disabled={saving}
          />
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>{t('whatsapp_settings.by_category')}</Text>
          <Text style={styles.muted}>{t('whatsapp_settings.category_hint')}</Text>
          {CATEGORY_KEYS.map((key, idx) => (
            <View key={key} style={[styles.categoryRow, idx === 0 && styles.categoryFirst]}>
              <Toggle
                label={t(`whatsapp_settings.categories.${key}.label`)}
                description={t(`whatsapp_settings.categories.${key}.description`)}
                value={prefs[key]}
                onValueChange={(v) => setCategory(key, v)}
                disabled={!optIn || saving}
              />
            </View>
          ))}
        </Card>

        <Card>
          <Text style={styles.sectionTitle}>{t('whatsapp_settings.about_limits_title')}</Text>
          <Text style={styles.muted}>{t('whatsapp_settings.about_limits')}</Text>
        </Card>
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
  muted: {
    ...typography.bodySm,
    color: colors.body,
    marginBottom: spacing.sm,
  },
  categoryRow: {
    borderTopWidth: 1,
    borderTopColor: colors.mute,
    paddingTop: spacing.xs,
  },
  categoryFirst: {
    borderTopWidth: 0,
    paddingTop: 0,
  },
});
