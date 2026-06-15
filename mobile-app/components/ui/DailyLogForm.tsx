import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, ScrollView, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { colors, spacing, typography } from '../../theme/tokens';
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
  broken_eggs?: number;
  avg_bird_weight_g?: number;
  notes?: string;
};

export interface DailyLogFormProps {
  batchId: string;
  farmId: string;
  loggedByUserId: string;
  /** Drives type-aware fields: eggs + broken eggs show only for layer/breeder. */
  poultryType?: 'broiler' | 'layer' | 'breeder';
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
    // Layer egg entry is captured as up to 3 daily collections that sum into
    // the stored eggs_collected total (one daily_logs row/day, no schema change).
    eggs_morning: z.string().optional(),
    eggs_afternoon: z.string().optional(),
    eggs_evening: z.string().optional(),
    broken_eggs: z.string().optional(),
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

function toISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function todayISO(): string {
  return toISO(new Date());
}

function yesterdayISO(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toISO(d);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DailyLogForm({
  poultryType,
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
  // Type-aware: eggs + broken eggs only matter for layer/breeder flocks.
  const isLayer = poultryType === 'layer' || poultryType === 'breeder';

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
      // On edit we only know the day's total, so seed it into the first slot.
      eggs_morning: initialValues?.eggs_collected?.toString() ?? '',
      eggs_afternoon: '',
      eggs_evening: '',
      broken_eggs: initialValues?.broken_eggs?.toString() ?? '',
      avg_bird_weight_g: initialValues?.avg_bird_weight_g?.toString() ?? '',
      notes: initialValues?.notes ?? '',
    },
  });

  const birdsDead = watch('birds_dead');
  const showDeathCause = parseInt(birdsDead ?? '0', 10) > 0;

  const eggsMorning = watch('eggs_morning');
  const eggsAfternoon = watch('eggs_afternoon');
  const eggsEvening = watch('eggs_evening');
  const eggsTotal =
    (parseInt(eggsMorning || '0', 10) || 0) +
    (parseInt(eggsAfternoon || '0', 10) || 0) +
    (parseInt(eggsEvening || '0', 10) || 0);

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
      eggs_collected: isLayer
        ? (() => {
            const sum =
              (parseInt(data.eggs_morning || '0', 10) || 0) +
              (parseInt(data.eggs_afternoon || '0', 10) || 0) +
              (parseInt(data.eggs_evening || '0', 10) || 0);
            return sum > 0 ? sum : undefined;
          })()
        : undefined,
      broken_eggs: isLayer && data.broken_eggs
        ? parseInt(data.broken_eggs, 10)
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
      {/* 1. Date — quick chips first (the <60s path), free text as fallback */}
      <Controller
        control={control}
        name="log_date"
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <View style={styles.dateChips}>
              <Pressable
                onPress={() => onChange(todayISO())}
                style={[styles.chip, value === todayISO() && styles.chipActive]}
                testID="daily-log-date-today"
              >
                <Text style={[styles.chipText, value === todayISO() && styles.chipTextActive]}>
                  {t('daily_log.date_today')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => onChange(yesterdayISO())}
                style={[styles.chip, value === yesterdayISO() && styles.chipActive]}
                testID="daily-log-date-yesterday"
              >
                <Text style={[styles.chipText, value === yesterdayISO() && styles.chipTextActive]}>
                  {t('daily_log.date_yesterday')}
                </Text>
              </Pressable>
            </View>
            <TextInput
              label={t('daily_log.log_date')}
              value={value}
              onChangeText={onChange}
              placeholder={t('daily_log.date_placeholder')}
              autoCapitalize="none"
              error={errors.log_date?.message}
              testID="daily-log-date"
            />
          </View>
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

      {/* 7. Eggs collected (up to 3 collections/day) + broken eggs — layer only */}
      {isLayer && (
        <View style={styles.field}>
          <Text style={styles.eggsLabel}>{t('daily_log.fields.eggs_collected')}</Text>
          <View style={styles.eggSlots}>
            <Controller
              control={control}
              name="eggs_morning"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={t('daily_log.egg_slots.morning')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  keyboardType="number-pad"
                  style={styles.eggSlot}
                  testID="daily-log-eggs-morning"
                />
              )}
            />
            <Controller
              control={control}
              name="eggs_afternoon"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={t('daily_log.egg_slots.afternoon')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  keyboardType="number-pad"
                  style={styles.eggSlot}
                  testID="daily-log-eggs-afternoon"
                />
              )}
            />
            <Controller
              control={control}
              name="eggs_evening"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={t('daily_log.egg_slots.evening')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  keyboardType="number-pad"
                  style={styles.eggSlot}
                  testID="daily-log-eggs-evening"
                />
              )}
            />
          </View>
          <Text style={styles.eggTotal}>
            {t('daily_log.egg_slots.total', { count: eggsTotal })}
          </Text>
        </View>
      )}

      {isLayer && (
        <Controller
          control={control}
          name="broken_eggs"
          render={({ field: { value, onChange } }) => (
            <TextInput
              label={t('daily_log.fields.broken_eggs')}
              value={value ?? ''}
              onChangeText={onChange}
              keyboardType="number-pad"
              error={errors.broken_eggs?.message}
              style={styles.field}
              testID="daily-log-broken-eggs"
            />
          )}
        />
      )}

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
  eggsLabel: {
    ...typography.bodyMdStrong,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  eggSlots: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  eggSlot: {
    flex: 1,
  },
  eggTotal: {
    ...typography.bodySm,
    color: colors.body,
    marginTop: spacing.xs,
  },
  dateChips: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.mute,
    backgroundColor: colors.canvas,
    minHeight: 44,
    justifyContent: 'center',
  },
  chipActive: {
    backgroundColor: colors.primarySubtle,
    borderColor: colors.primary,
  },
  chipText: {
    ...typography.bodyMdStrong,
    color: colors.body,
  },
  chipTextActive: {
    color: colors.primary,
  },
  actions: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  cancelButton: {
    marginTop: spacing.xs,
  },
});
