import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth';
import { useFarmStore } from '../../stores/farm';
import { HealthIncidentForm, type HealthIncidentValues } from '../../components/ui';
import { colors } from '../../theme/tokens';

export default function NewHealthIncidentScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { batchId } = useLocalSearchParams<{ batchId?: string }>();
  const user = useAuthStore((s) => s.user);
  const currentFarm = useFarmStore((s) => s.currentFarm);

  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  async function handleSubmit(values: HealthIncidentValues) {
    if (!currentFarm || !user) {
      setSnackbar(t('health.form.session_error'));
      return;
    }
    if (!batchId) {
      setSnackbar(t('health.form.no_batch'));
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('health_incidents').insert({
        batch_id: batchId,
        farm_id: currentFarm.id,
        reported_by: user.id,
        incident_date: values.incident_date,
        symptom_description: values.symptom_description,
        affected_bird_count: values.affected_bird_count ?? null,
        vet_consulted: values.vet_consulted,
        diagnosis: values.diagnosis ?? null,
        treatment_given: values.treatment_given ?? null,
        medicine_name: values.medicine_name ?? null,
        dose: values.dose ?? null,
        withdrawal_days: values.withdrawal_days ?? null,
        // withdrawal_clearance_date is a GENERATED column — never passed here
        // vet_note is vet-role only — never passed from this screen
      });

      if (error) {
        setSnackbar(t('health.form.save_failed', { reason: error.message }));
        return;
      }

      setSnackbar(t('health.form.recorded'));
      // Brief delay so the snackbar is visible before navigating back
      setTimeout(() => router.back(), 800);
    } catch (e) {
      setSnackbar(e instanceof Error ? t('health.form.save_failed', { reason: e.message }) : t('health.form.save_failed_generic'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('health.form.title'), presentation: 'modal' }} />

      <HealthIncidentForm
        onSubmit={handleSubmit}
        onCancel={() => router.back()}
        submitting={submitting}
      />

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
});
