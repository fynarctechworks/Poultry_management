import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useMemo } from 'react';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import { todayISO } from '../../lib/format-date';
import {
  Button,
  TextInput,
  RadioGroup,
} from '../../components/ui';
import { colors, spacing } from '../../theme/tokens';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const ROUTE_VALUES = ['oral', 'injection', 'spray'] as const;

function makeSchema(t: TFunction) {
  return z.object({
    vaccine_name: z.string().min(1, t('vaccinations.form.errors.vaccine_required')),
    scheduled_date: z
      .string()
      .regex(ISO_DATE_RE, t('vaccinations.form.errors.date_format'))
      .min(1, t('vaccinations.form.errors.date_required')),
    dose: z.string().optional(),
    route: z.enum(['oral', 'injection', 'spray']).default('oral'),
    birds_vaccinated: z
      .string()
      .optional()
      .refine(
        (v) => v === undefined || v === '' || (/^\d+$/.test(v) && parseInt(v, 10) >= 0),
        { message: t('vaccinations.form.errors.whole_number') },
      ),
  });
}

type FormFields = z.infer<ReturnType<typeof makeSchema>>;

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ScheduleVaccinationScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { batchId } = useLocalSearchParams<{ batchId?: string }>();
  const currentFarm = useFarmStore((s) => s.currentFarm);

  const [snackbar, setSnackbar] = useState<string | null>(null);
  const schema = useMemo(() => makeSchema(t), [t]);
  const routeOptions = ROUTE_VALUES.map((value) => ({
    value,
    label: t(`vaccinations.route.${value}`),
  }));

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      vaccine_name: '',
      scheduled_date: todayISO(),
      dose: '',
      route: 'oral',
      birds_vaccinated: '',
    },
  });

  async function onSubmit(values: FormFields) {
    if (!currentFarm) {
      setSnackbar(t('vaccinations.form.session_error'));
      return;
    }
    if (!batchId) {
      setSnackbar(t('vaccinations.form.no_batch'));
      return;
    }

    const { error } = await supabase.from('vaccinations').insert({
      batch_id: batchId,
      farm_id: currentFarm.id,
      vaccine_name: values.vaccine_name,
      scheduled_date: values.scheduled_date,
      dose: values.dose || null,
      route: values.route ?? null,
      birds_vaccinated:
        values.birds_vaccinated && values.birds_vaccinated !== ''
          ? parseInt(values.birds_vaccinated, 10)
          : null,
      status: 'scheduled',
    });

    if (error) {
      setSnackbar(t('vaccinations.form.save_failed', { reason: error.message }));
      return;
    }

    setSnackbar(t('vaccinations.form.scheduled_ok'));
    setTimeout(() => router.back(), 800);
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{ title: t('vaccinations.form.title'), presentation: 'modal' }}
      />

      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Vaccine name */}
        <Controller
          control={control}
          name="vaccine_name"
          render={({ field: { value, onChange } }) => (
            <TextInput
              label={`${t('vaccinations.form.vaccine_name')} *`}
              value={value}
              onChangeText={onChange}
              autoCapitalize="words"
              placeholder={t('vaccinations.form.vaccine_name_placeholder')}
              error={errors.vaccine_name?.message}
              testID="vax-name"
            />
          )}
        />

        {/* Scheduled date */}
        <Controller
          control={control}
          name="scheduled_date"
          render={({ field: { value, onChange } }) => (
            <TextInput
              label={t('vaccinations.form.scheduled_date')}
              value={value}
              onChangeText={onChange}
              placeholder={t('vaccinations.form.date_placeholder')}
              autoCapitalize="none"
              keyboardType="numeric"
              error={errors.scheduled_date?.message}
              testID="vax-date"
            />
          )}
        />

        {/* Dose */}
        <Controller
          control={control}
          name="dose"
          render={({ field: { value, onChange } }) => (
            <TextInput
              label={t('vaccinations.form.dose')}
              value={value ?? ''}
              onChangeText={onChange}
              placeholder={t('vaccinations.form.dose_placeholder')}
              error={errors.dose?.message}
              testID="vax-dose"
            />
          )}
        />

        {/* Route */}
        <Controller
          control={control}
          name="route"
          render={({ field: { value, onChange } }) => (
            <RadioGroup
              label={t('vaccinations.form.route_label')}
              options={routeOptions}
              value={value ?? 'oral'}
              onChange={onChange}
              error={errors.route?.message}
              testID="vax-route"
            />
          )}
        />

        {/* Birds vaccinated */}
        <Controller
          control={control}
          name="birds_vaccinated"
          render={({ field: { value, onChange } }) => (
            <TextInput
              label={t('vaccinations.form.birds_vaccinated')}
              value={value ?? ''}
              onChangeText={onChange}
              keyboardType="number-pad"
              error={errors.birds_vaccinated?.message}
              testID="vax-birds"
            />
          )}
        />

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            variant="primary"
            label={t('vaccinations.form.schedule')}
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            fullWidth
            testID="vax-submit"
          />
          <Button
            variant="outlineDark"
            label={t('vaccinations.form.cancel')}
            onPress={() => router.back()}
            fullWidth
            style={styles.cancelBtn}
            testID="vax-cancel"
          />
        </View>
      </ScrollView>

      <Snackbar
        visible={snackbar !== null}
        onDismiss={() => setSnackbar(null)}
        duration={3500}
      >
        {snackbar ?? ''}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
  },
  scroll: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  actions: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  cancelBtn: {
    marginTop: spacing.xs,
  },
});
