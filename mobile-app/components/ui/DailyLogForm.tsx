import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { spacing } from '../../theme/tokens';
import { Button } from './Button';
import { RadioGroup } from './RadioGroup';
import { Select, SelectOption } from './Select';
import { TextInput } from './TextInput';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DailyLogValues = {
  log_date: string;
  birds_dead: number;
  death_cause:
    | 'disease'
    | 'culled'
    | 'injury'
    | 'heat_stress'
    | 'unknown'
    | null;
  feed_consumed_kg: number;
  feed_type: 'starter' | 'grower' | 'finisher' | 'layer' | 'custom';
  feed_cost_per_kg?: number;
  eggs_collected?: number;
  avg_bird_weight_g?: number;
  notes?: string;
};

export interface DailyLogFormProps {
  batchId: string;
  farmId: string;
  loggedByUserId: string;
  defaultDate?: string;
  onSubmit: (values: DailyLogValues) => Promise<void>;
  onCancel?: () => void;
  submitting?: boolean;
  initialValues?: Partial<DailyLogValues>;
  style?: ViewStyle;
  testID?: string;
}

// ---------------------------------------------------------------------------
// Zod schema
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const schema = z
  .object({
    log_date: z
      .string()
      .regex(ISO_DATE_RE, 'Date must be YYYY-MM-DD')
      .min(1, 'Date is required'),
    birds_dead: z
      .string()
      .min(1, 'Required')
      .refine((v) => /^\d+$/.test(v) && parseInt(v, 10) >= 0, {
        message: 'Must be a whole number ≥ 0',
      }),
    death_cause: z.string().nullable(),
    feed_consumed_kg: z
      .string()
      .min(1, 'Required')
      .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) >= 0, {
        message: 'Must be a number ≥ 0',
      }),
    feed_type: z.string().min(1, 'Feed type is required'),
    feed_cost_per_kg: z.string().optional(),
    eggs_collected: z.string().optional(),
    avg_bird_weight_g: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) => {
      const dead = parseInt(data.birds_dead, 10);
      if (dead > 0 && !data.death_cause) return false;
      return true;
    },
    {
      message: 'Death cause is required when birds died',
      path: ['death_cause'],
    },
  );

type FormFields = z.infer<typeof schema>;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

const DEATH_CAUSE_OPTIONS: SelectOption[] = [
  { value: 'disease', label: 'Disease' },
  { value: 'culled', label: 'Culled' },
  { value: 'injury', label: 'Injury' },
  { value: 'heat_stress', label: 'Heat stress' },
  { value: 'unknown', label: 'Unknown' },
];

const FEED_TYPE_OPTIONS = [
  { value: 'starter', label: 'Starter' },
  { value: 'grower', label: 'Grower' },
  { value: 'finisher', label: 'Finisher' },
  { value: 'layer', label: 'Layer' },
  { value: 'custom', label: 'Custom' },
];

// ---------------------------------------------------------------------------
// Helper — today's date as YYYY-MM-DD in local time
// ---------------------------------------------------------------------------

function todayISO(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DailyLogForm({
  defaultDate,
  onSubmit,
  onCancel,
  submitting = false,
  initialValues,
  style,
  testID,
}: DailyLogFormProps) {
  const { t } = useTranslation();
  const dateDefault = defaultDate ?? initialValues?.log_date ?? todayISO();

  const deathCauseOptions: SelectOption[] = DEATH_CAUSE_OPTIONS.map((o) => ({
    value: o.value,
    label: t(`daily_log.death_cause.${o.value}`),
  }));
  const feedTypeOptions = FEED_TYPE_OPTIONS.map((o) => ({
    value: o.value,
    label: t(`daily_log.feed_type.${o.value}`),
  }));

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      log_date: dateDefault,
      birds_dead: initialValues?.birds_dead?.toString() ?? '0',
      death_cause: initialValues?.death_cause ?? null,
      feed_consumed_kg: initialValues?.feed_consumed_kg?.toString() ?? '',
      feed_type: initialValues?.feed_type ?? 'grower',
      feed_cost_per_kg: initialValues?.feed_cost_per_kg?.toString() ?? '',
      eggs_collected: initialValues?.eggs_collected?.toString() ?? '',
      avg_bird_weight_g: initialValues?.avg_bird_weight_g?.toString() ?? '',
      notes: initialValues?.notes ?? '',
    },
  });

  const birdsDead = watch('birds_dead');
  const showDeathCause = parseInt(birdsDead ?? '0', 10) > 0;

  const handleValidSubmit = async (data: FormFields) => {
    const values: DailyLogValues = {
      log_date: data.log_date,
      birds_dead: parseInt(data.birds_dead, 10),
      death_cause: (data.death_cause as DailyLogValues['death_cause']) ?? null,
      feed_consumed_kg: parseFloat(data.feed_consumed_kg),
      feed_type: data.feed_type as DailyLogValues['feed_type'],
      feed_cost_per_kg: data.feed_cost_per_kg
        ? parseFloat(data.feed_cost_per_kg)
        : undefined,
      eggs_collected: data.eggs_collected
        ? parseInt(data.eggs_collected, 10)
        : undefined,
      avg_bird_weight_g: data.avg_bird_weight_g
        ? parseInt(data.avg_bird_weight_g, 10)
        : undefined,
      notes: data.notes || undefined,
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
      {/* 1. Date */}
      <Controller
        control={control}
        name="log_date"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('daily_log.log_date')}
            value={value}
            onChangeText={onChange}
            placeholder={t('daily_log.date_placeholder')}
            autoCapitalize="none"
            error={errors.log_date?.message}
            style={styles.field}
            testID="daily-log-date"
          />
        )}
      />

      {/* 2. Birds dead */}
      <Controller
        control={control}
        name="birds_dead"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('daily_log.fields.birds_dead')}
            value={value}
            onChangeText={onChange}
            keyboardType="number-pad"
            error={errors.birds_dead?.message}
            style={styles.field}
            testID="daily-log-birds-dead"
          />
        )}
      />

      {/* 3. Death cause — shown only when birds_dead > 0 */}
      {showDeathCause && (
        <Controller
          control={control}
          name="death_cause"
          render={({ field: { value, onChange } }) => (
            <Select
              label={t('daily_log.fields.death_cause')}
              options={deathCauseOptions}
              value={value}
              onChange={onChange}
              placeholder={t('daily_log.fields.death_cause')}
              error={errors.death_cause?.message}
              testID="daily-log-death-cause"
            />
          )}
        />
      )}

      {/* 4. Feed consumed */}
      <Controller
        control={control}
        name="feed_consumed_kg"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('daily_log.fields.feed_consumed_kg')}
            value={value}
            onChangeText={onChange}
            keyboardType="decimal-pad"
            error={errors.feed_consumed_kg?.message}
            style={styles.field}
            testID="daily-log-feed-consumed"
          />
        )}
      />

      {/* 5. Feed type */}
      <Controller
        control={control}
        name="feed_type"
        render={({ field: { value, onChange } }) => (
          <RadioGroup
            label={t('daily_log.fields.feed_type')}
            options={feedTypeOptions}
            value={value}
            onChange={onChange}
            error={errors.feed_type?.message}
            style={styles.field}
            testID="daily-log-feed-type"
          />
        )}
      />

      {/* 6. Feed cost per kg (optional) */}
      <Controller
        control={control}
        name="feed_cost_per_kg"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('daily_log.feed_cost_per_kg_inr')}
            value={value ?? ''}
            onChangeText={onChange}
            keyboardType="decimal-pad"
            error={errors.feed_cost_per_kg?.message}
            style={styles.field}
            testID="daily-log-feed-cost"
          />
        )}
      />

      {/* 7. Eggs collected (optional) */}
      <Controller
        control={control}
        name="eggs_collected"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('daily_log.fields.eggs_collected')}
            value={value ?? ''}
            onChangeText={onChange}
            keyboardType="number-pad"
            error={errors.eggs_collected?.message}
            style={styles.field}
            testID="daily-log-eggs"
          />
        )}
      />

      {/* 8. Avg bird weight (optional) */}
      <Controller
        control={control}
        name="avg_bird_weight_g"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('daily_log.fields.avg_bird_weight_g')}
            value={value ?? ''}
            onChangeText={onChange}
            keyboardType="number-pad"
            error={errors.avg_bird_weight_g?.message}
            style={styles.field}
            testID="daily-log-weight"
          />
        )}
      />

      {/* 9. Notes (optional) */}
      <Controller
        control={control}
        name="notes"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('daily_log.fields.notes')}
            value={value ?? ''}
            onChangeText={onChange}
            multiline
            numberOfLines={3}
            error={errors.notes?.message}
            style={styles.field}
            testID="daily-log-notes"
          />
        )}
      />

      {/* Action buttons */}
      <View style={styles.actions}>
        <Button
          variant="primary"
          label={t('common.save')}
          onPress={handleSubmit(handleValidSubmit)}
          loading={submitting}
          fullWidth
          testID="daily-log-save"
        />
        {!!onCancel && (
          <Button
            variant="outlineDark"
            label={t('common.cancel')}
            onPress={onCancel}
            fullWidth
            style={styles.cancelButton}
            testID="daily-log-cancel"
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
    // gap handled by container
  },
  actions: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  cancelButton: {
    marginTop: spacing.xs,
  },
});
