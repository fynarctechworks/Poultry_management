import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppModal } from './AppModal';
import { Button } from './Button';
import { TextInput } from './TextInput';
import { Toggle } from './Toggle';
import { supabase } from '../../lib/supabase';
import { todayISO } from '../../lib/format-date';
import { colors, spacing, typography } from '../../theme/tokens';

export interface ContractStatementInitial {
  integrator_birds_lifted: number | null;
  integrator_avg_weight_kg: number | null;
  integrator_fcr: number | null;
  integrator_mortality_pct: number | null;
  actual_settlement_amount: number | null;
  settlement_received_date: string | null;
  dispute_notes: string | null;
}

export interface ContractStatementModalProps {
  visible: boolean;
  onDismiss: () => void;
  cycleId: string;
  initial: ContractStatementInitial;
  onSuccess: () => void;
  testID?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const numOrNull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * Captures the integrator's settlement-statement figures (the integrator-STATED
 * side of the reconciliation) plus the paid amount and received date. Writes the
 * integrator_* columns + actual_settlement_amount and sets status to
 * settled / disputed. Mirrors the web CycleActions settle form.
 */
export function ContractStatementModal({
  visible,
  onDismiss,
  cycleId,
  initial,
  onSuccess,
  testID,
}: ContractStatementModalProps) {
  const { t } = useTranslation();
  const init = (v: number | null) => (v == null ? '' : String(v));
  const [amount, setAmount] = useState(init(initial.actual_settlement_amount));
  const [receivedDate, setReceivedDate] = useState(initial.settlement_received_date ?? todayISO());
  const [birds, setBirds] = useState(init(initial.integrator_birds_lifted));
  const [weight, setWeight] = useState(init(initial.integrator_avg_weight_kg));
  const [fcr, setFcr] = useState(init(initial.integrator_fcr));
  const [mortality, setMortality] = useState(init(initial.integrator_mortality_pct));
  const [notes, setNotes] = useState(initial.dispute_notes ?? '');
  const [disputed, setDisputed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const amt = numOrNull(amount);
    if (amt == null || amt < 0) {
      setError(t('contract.statement.errors.amount'));
      return;
    }
    if (!ISO_DATE_RE.test(receivedDate)) {
      setError(t('contract.statement.errors.date'));
      return;
    }
    setSubmitting(true);
    const { error: err } = await supabase
      .from('contract_cycles')
      .update({
        actual_settlement_amount: amt,
        settlement_received_date: receivedDate,
        integrator_birds_lifted: numOrNull(birds),
        integrator_avg_weight_kg: numOrNull(weight),
        integrator_fcr: numOrNull(fcr),
        integrator_mortality_pct: numOrNull(mortality),
        dispute_notes: notes.trim() || null,
        status: disputed ? 'disputed' : 'settled',
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
        <Text style={styles.title}>{t('contract.statement.title')}</Text>
        <Text style={styles.help}>{t('contract.statement.help')}</Text>

        <TextInput
          label={t('contract.statement.amount')}
          value={amount}
          onChangeText={setAmount}
          keyboardType="numeric"
        />
        <TextInput
          label={t('contract.statement.received_date')}
          value={receivedDate}
          onChangeText={setReceivedDate}
          placeholder="YYYY-MM-DD"
          autoCapitalize="none"
        />
        <View style={styles.grid}>
          <View style={styles.gridCell}>
            <TextInput label={t('contract.statement.birds')} value={birds} onChangeText={setBirds} keyboardType="numeric" />
          </View>
          <View style={styles.gridCell}>
            <TextInput label={t('contract.statement.weight')} value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
          </View>
          <View style={styles.gridCell}>
            <TextInput label={t('contract.statement.fcr')} value={fcr} onChangeText={setFcr} keyboardType="decimal-pad" />
          </View>
          <View style={styles.gridCell}>
            <TextInput label={t('contract.statement.mortality')} value={mortality} onChangeText={setMortality} keyboardType="decimal-pad" />
          </View>
        </View>
        <TextInput
          label={t('contract.statement.dispute')}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={2}
        />
        <Toggle
          label={t('contract.statement.mark_disputed')}
          value={disputed}
          onValueChange={setDisputed}
          style={styles.toggle}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.actions}>
          <Button variant="outlineDark" label={t('common.cancel')} onPress={onDismiss} />
          <Button
            variant="primary"
            label={submitting ? t('contract.statement.saving') : t('contract.statement.save')}
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
  toggle: { marginTop: spacing.xs },
  error: { ...typography.bodySm, color: colors.danger, marginTop: spacing.xs },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, marginTop: spacing.md },
});
