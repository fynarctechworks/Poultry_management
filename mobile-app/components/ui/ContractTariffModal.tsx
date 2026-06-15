import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { serializeTariffCard, type ContractTariff } from '@poultryos/shared';
import { AppModal } from './AppModal';
import { Button } from './Button';
import { TextInput } from './TextInput';
import { supabase } from '../../lib/supabase';
import { colors, spacing, typography } from '../../theme/tokens';

export interface ContractTariffModalProps {
  visible: boolean;
  onDismiss: () => void;
  cycleId: string;
  /** Pre-fill values (integrator master or an existing confirmed snapshot). */
  defaults: ContractTariff;
  onSuccess: () => void;
  testID?: string;
}

const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Forces the grower to confirm/edit the actual contract terms for this cycle
 * before reconciling. Seeded integrator cards are reference data and may be
 * wrong; the confirmed snapshot is locked onto the cycle so the settlement calc
 * (and reconciliation) use the grower's real terms.
 */
export function ContractTariffModal({
  visible,
  onDismiss,
  cycleId,
  defaults,
  onSuccess,
  testID,
}: ContractTariffModalProps) {
  const { t } = useTranslation();
  const init = (v: number | null | undefined) => (v == null ? '' : String(v));
  const [baseRate, setBaseRate] = useState(init(defaults.baseGrowingChargePerKg));
  const [fcrThresh, setFcrThresh] = useState(init(defaults.fcrBonus?.threshold));
  const [fcrBonus, setFcrBonus] = useState(init(defaults.fcrBonus?.bonusPerKg));
  const [mortThresh, setMortThresh] = useState(init(defaults.mortalityBonus?.thresholdPct));
  const [mortBonus, setMortBonus] = useState(init(defaults.mortalityBonus?.bonusPerKg));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const base = numOrNull(baseRate);
    if (base == null || base < 0) {
      setError(t('contract.tariff.errors.base'));
      return;
    }
    const tariff: ContractTariff = {
      baseGrowingChargePerKg: base,
      fcrBonus:
        numOrNull(fcrThresh) != null && numOrNull(fcrBonus) != null
          ? { threshold: numOrNull(fcrThresh)!, bonusPerKg: numOrNull(fcrBonus)! }
          : null,
      mortalityBonus:
        numOrNull(mortThresh) != null && numOrNull(mortBonus) != null
          ? { thresholdPct: numOrNull(mortThresh)!, bonusPerKg: numOrNull(mortBonus)! }
          : null,
    };
    setSubmitting(true);
    const { error: err } = await supabase
      .from('contract_cycles')
      .update({
        tariff_card_snapshot: serializeTariffCard(tariff),
        tariff_confirmed_at: new Date().toISOString(),
      })
      .eq('id', cycleId);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    onSuccess();
  }

  return (
    <AppModal visible={visible} onDismiss={onDismiss} testID={testID}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('contract.tariff.title')}</Text>
        <Text style={styles.help}>{t('contract.tariff.help')}</Text>

        <TextInput label={t('contract.tariff.base_rate')} value={baseRate} onChangeText={setBaseRate} keyboardType="decimal-pad" />
        <View style={styles.grid}>
          <View style={styles.gridCell}>
            <TextInput label={t('contract.tariff.fcr_threshold')} value={fcrThresh} onChangeText={setFcrThresh} keyboardType="decimal-pad" />
          </View>
          <View style={styles.gridCell}>
            <TextInput label={t('contract.tariff.fcr_bonus')} value={fcrBonus} onChangeText={setFcrBonus} keyboardType="decimal-pad" />
          </View>
          <View style={styles.gridCell}>
            <TextInput label={t('contract.tariff.mortality_threshold')} value={mortThresh} onChangeText={setMortThresh} keyboardType="decimal-pad" />
          </View>
          <View style={styles.gridCell}>
            <TextInput label={t('contract.tariff.mortality_bonus')} value={mortBonus} onChangeText={setMortBonus} keyboardType="decimal-pad" />
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Button variant="outlineDark" label={t('common.cancel')} onPress={onDismiss} />
          <Button
            variant="primary"
            label={submitting ? t('contract.tariff.saving') : t('contract.tariff.confirm')}
            onPress={save}
            disabled={submitting}
          />
        </View>
      </ScrollView>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.sm },
  title: { ...typography.bodyMdStrong, color: colors.ink },
  help: { ...typography.bodySm, color: colors.body, marginBottom: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  gridCell: { flexBasis: '47%', flexGrow: 1 },
  error: { ...typography.bodySm, color: colors.danger, marginTop: spacing.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
});
