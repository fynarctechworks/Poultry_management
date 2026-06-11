import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { z } from 'zod';
import { colors, spacing, typography } from '../../theme/tokens';
import { todayISO } from '../../lib/format-date';
import { Button } from './Button';
import { TextInput } from './TextInput';
import { Toggle } from './Toggle';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HealthIncidentValues = {
  incident_date: string;          // YYYY-MM-DD
  symptom_description: string;   // required, min 3
  affected_bird_count?: number;  // optional, >= 0
  vet_consulted: boolean;
  diagnosis?: string;
  treatment_given?: string;
  medicine_name?: string;
  dose?: string;
  withdrawal_days?: number;      // optional, >= 0
};

export interface HealthIncidentFormProps {
  onSubmit: (values: HealthIncidentValues) => Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
  initialValues?: Partial<HealthIncidentValues>;
  style?: ViewStyle;
  testID?: string;
}

// ---------------------------------------------------------------------------
// Zod schema — numeric fields are string-native in RHF (mirror DailyLogForm)
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function makeSchema(t: TFunction) {
  return z.object({
    incident_date: z
      .string()
      .regex(ISO_DATE_RE, t('health.form.errors.date_format'))
      .min(1, t('health.form.errors.date_required')),
    symptom_description: z
      .string()
      .min(3, t('health.form.errors.symptom_min')),
    affected_bird_count: z
      .string()
      .optional()
      .refine(
        (v) => v === undefined || v === '' || (/^\d+$/.test(v) && parseInt(v, 10) >= 0),
        { message: t('health.form.errors.whole_number') },
      ),
    vet_consulted: z.boolean(),
    diagnosis: z.string().optional(),
    treatment_given: z.string().optional(),
    medicine_name: z.string().optional(),
    dose: z.string().optional(),
    withdrawal_days: z
      .string()
      .optional()
      .refine(
        (v) => v === undefined || v === '' || (/^\d+$/.test(v) && parseInt(v, 10) >= 0),
        { message: t('health.form.errors.whole_number') },
      ),
  });
}

type FormFields = z.infer<ReturnType<typeof makeSchema>>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HealthIncidentForm({
  onSubmit,
  onCancel,
  submitting = false,
  initialValues,
  style,
  testID,
}: HealthIncidentFormProps) {
  const { t } = useTranslation();
  const schema = useMemo(() => makeSchema(t), [t]);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      incident_date: initialValues?.incident_date ?? todayISO(),
      symptom_description: initialValues?.symptom_description ?? '',
      affected_bird_count:
        initialValues?.affected_bird_count !== undefined
          ? String(initialValues.affected_bird_count)
          : '',
      vet_consulted: initialValues?.vet_consulted ?? false,
      diagnosis: initialValues?.diagnosis ?? '',
      treatment_given: initialValues?.treatment_given ?? '',
      medicine_name: initialValues?.medicine_name ?? '',
      dose: initialValues?.dose ?? '',
      withdrawal_days:
        initialValues?.withdrawal_days !== undefined
          ? String(initialValues.withdrawal_days)
          : '',
    },
  });

  const handleValidSubmit = async (data: FormFields) => {
    const values: HealthIncidentValues = {
      incident_date: data.incident_date,
      symptom_description: data.symptom_description,
      affected_bird_count:
        data.affected_bird_count && data.affected_bird_count !== ''
          ? parseInt(data.affected_bird_count, 10)
          : undefined,
      vet_consulted: data.vet_consulted,
      diagnosis: data.diagnosis || undefined,
      treatment_given: data.treatment_given || undefined,
      medicine_name: data.medicine_name || undefined,
      dose: data.dose || undefined,
      withdrawal_days:
        data.withdrawal_days && data.withdrawal_days !== ''
          ? parseInt(data.withdrawal_days, 10)
          : undefined,
    };
    await onSubmit(values);
  };

  return (
    <ScrollView
      style={[styles.scroll, style]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      {/* 1. Incident date */}
      <Controller
        control={control}
        name="incident_date"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('health.form.incident_date')}
            value={value}
            onChangeText={onChange}
            placeholder={t('health.form.date_placeholder')}
            autoCapitalize="none"
            error={errors.incident_date?.message}
            style={styles.field}
            testID="hi-incident-date"
          />
        )}
      />

      {/* 2. Symptom description (required) */}
      <Controller
        control={control}
        name="symptom_description"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={`${t('health.form.symptom_description')} *`}
            value={value}
            onChangeText={onChange}
            multiline
            numberOfLines={3}
            error={errors.symptom_description?.message}
            style={styles.field}
            testID="hi-symptoms"
          />
        )}
      />

      {/* 3. Affected bird count (optional) */}
      <Controller
        control={control}
        name="affected_bird_count"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('health.form.affected_birds')}
            value={value ?? ''}
            onChangeText={onChange}
            keyboardType="number-pad"
            error={errors.affected_bird_count?.message}
            style={styles.field}
            testID="hi-affected-count"
          />
        )}
      />

      {/* 4. Vet consulted (toggle) */}
      <Controller
        control={control}
        name="vet_consulted"
        render={({ field: { value, onChange } }) => (
          <Toggle
            label={t('health.form.vet_consulted')}
            value={value}
            onValueChange={onChange}
            style={styles.field}
            testID="hi-vet-consulted"
          />
        )}
      />

      {/* 5. Diagnosis (optional) */}
      <Controller
        control={control}
        name="diagnosis"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('health.form.diagnosis')}
            value={value ?? ''}
            onChangeText={onChange}
            error={errors.diagnosis?.message}
            style={styles.field}
            testID="hi-diagnosis"
          />
        )}
      />

      {/* 6. Treatment given (optional, multiline) */}
      <Controller
        control={control}
        name="treatment_given"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('health.form.treatment_given')}
            value={value ?? ''}
            onChangeText={onChange}
            multiline
            numberOfLines={3}
            error={errors.treatment_given?.message}
            style={styles.field}
            testID="hi-treatment"
          />
        )}
      />

      {/* 7. Medicine name (optional) */}
      <Controller
        control={control}
        name="medicine_name"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('health.form.medicine_name')}
            value={value ?? ''}
            onChangeText={onChange}
            error={errors.medicine_name?.message}
            style={styles.field}
            testID="hi-medicine-name"
          />
        )}
      />

      {/* 8. Dose (optional) */}
      <Controller
        control={control}
        name="dose"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('health.form.dose')}
            value={value ?? ''}
            onChangeText={onChange}
            error={errors.dose?.message}
            style={styles.field}
            testID="hi-dose"
          />
        )}
      />

      {/* 9. Withdrawal days (optional) */}
      <Controller
        control={control}
        name="withdrawal_days"
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <TextInput
              label={t('health.form.withdrawal_days')}
              value={value ?? ''}
              onChangeText={onChange}
              keyboardType="number-pad"
              error={errors.withdrawal_days?.message}
              testID="hi-withdrawal-days"
            />
            <Text style={styles.helperText}>
              {t('health.form.withdrawal_helper')}
            </Text>
          </View>
        )}
      />

      {/* Action buttons */}
      <View style={styles.actions}>
        <Button
          variant="primary"
          label={t('health.form.save')}
          onPress={handleSubmit(handleValidSubmit)}
          loading={submitting}
          fullWidth
          testID="hi-save"
        />
        {!!onCancel && (
          <Button
            variant="outlineDark"
            label={t('health.form.cancel')}
            onPress={onCancel}
            fullWidth
            style={styles.cancelButton}
            testID="hi-cancel"
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  field: {
    // gap is handled by the container
  },
  helperText: {
    fontSize: typography.caption.fontSize,
    lineHeight: typography.caption.lineHeight,
    fontWeight: typography.caption.fontWeight,
    fontFamily: typography.caption.fontFamily,
    color: colors.body,
    marginTop: spacing.xs,
  },
  actions: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  cancelButton: {
    marginTop: spacing.xs,
  },
});
