import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppModal } from './AppModal';
import { Button } from './Button';
import { RadioGroup } from './RadioGroup';
import { Select } from './Select';
import { TextInput } from './TextInput';
import { supabase } from '../../lib/supabase';
import { todayISO } from '../../lib/format-date';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatINR } from '@poultryos/shared';

export interface HarvestBuyerOption {
  id: string;
  buyer_name: string;
}

export interface HarvestBatchModalProps {
  visible: boolean;
  onDismiss: () => void;
  batch: {
    id: string;
    batch_code: string;
    current_bird_count: number;
    placement_date: string;
  };
  buyers: HarvestBuyerOption[];
  onSuccess: () => void;
  testID?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type FormFields = {
  birds: string;
  avg_weight_kg: string;
  price_per_kg: string;
  harvest_date: string;
  buyer_id: string;
  payment_status: 'paid' | 'pending' | 'partial';
  notes: string;
};

export function HarvestBatchModal({
  visible,
  onDismiss,
  batch,
  buyers,
  onSuccess,
  testID,
}: HarvestBatchModalProps) {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const max = batch.current_bird_count;

  // The DB RPC re-validates all of this; client validation is just for fast feedback.
  const schema = useMemo(
    () =>
      z.object({
        birds: z
          .string()
          .refine(
            (v) => /^\d+$/.test(v) && parseInt(v, 10) >= 1 && parseInt(v, 10) <= max,
            t('harvest.errors.birds_range', { max }),
          ),
        avg_weight_kg: z
          .string()
          .refine((v) => parseFloat(v) > 0, t('harvest.errors.weight_positive')),
        price_per_kg: z
          .string()
          .refine((v) => parseFloat(v) >= 0, t('harvest.errors.price_non_negative')),
        harvest_date: z
          .string()
          .regex(ISO_DATE_RE, t('harvest.errors.date_format'))
          .refine((v) => v >= batch.placement_date, t('harvest.errors.date_after_placement'))
          .refine((v) => v <= todayISO(), t('harvest.errors.date_future')),
        buyer_id: z.string().optional().or(z.literal('')),
        payment_status: z.enum(['paid', 'pending', 'partial']),
        notes: z.string().max(500).optional().or(z.literal('')),
      }),
    [max, batch.placement_date, t],
  );

  const defaults: FormFields = useMemo(
    () => ({
      birds: '',
      avg_weight_kg: '',
      price_per_kg: '',
      harvest_date: todayISO(),
      buyer_id: '',
      payment_status: 'paid',
      notes: '',
    }),
    [],
  );

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<FormFields>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  useEffect(() => {
    if (visible) {
      reset(defaults);
      setServerError(null);
    }
  }, [visible, reset, defaults]);

  const birds = watch('birds');
  const weight = watch('avg_weight_kg');
  const price = watch('price_per_kg');
  const revenue =
    (parseFloat(birds || '0') * parseFloat(weight || '0') * parseFloat(price || '0')) || 0;

  const statusOptions = [
    { value: 'paid', label: t('harvest.status.paid') },
    { value: 'pending', label: t('harvest.status.pending') },
    { value: 'partial', label: t('harvest.status.partial') },
  ];

  const onSubmit = async (values: FormFields) => {
    setSubmitting(true);
    setServerError(null);
    try {
      const { error } = await supabase.rpc('record_harvest', {
        p_batch_id: batch.id,
        p_birds: parseInt(values.birds, 10),
        p_avg_weight_kg: parseFloat(values.avg_weight_kg),
        p_price_per_kg: parseFloat(values.price_per_kg),
        p_date: values.harvest_date,
        p_buyer_id: values.buyer_id ? values.buyer_id : null,
        p_payment_status: values.payment_status,
        p_notes: values.notes?.trim() ? values.notes.trim() : null,
      });
      if (error) throw error;
      onSuccess();
      onDismiss();
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : t('harvest.errors.failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal} testID={testID}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('harvest.title', { code: batch.batch_code })}</Text>
        <Text style={styles.subtitle}>
          {t('harvest.subtitle', { count: max.toLocaleString('en-IN') })}
        </Text>

        <Controller
          control={control}
          name="birds"
          render={({ field: { value, onChange } }) => (
            <TextInput
              label={t('harvest.birds')}
              value={value}
              onChangeText={onChange}
              keyboardType="number-pad"
              error={errors.birds?.message}
              testID="hb-birds"
            />
          )}
        />

        <Controller
          control={control}
          name="avg_weight_kg"
          render={({ field: { value, onChange } }) => (
            <TextInput
              label={t('harvest.avg_weight')}
              value={value}
              onChangeText={onChange}
              keyboardType="decimal-pad"
              error={errors.avg_weight_kg?.message}
              testID="hb-weight"
            />
          )}
        />

        <Controller
          control={control}
          name="price_per_kg"
          render={({ field: { value, onChange } }) => (
            <TextInput
              label={t('harvest.price_per_kg')}
              value={value}
              onChangeText={onChange}
              keyboardType="decimal-pad"
              error={errors.price_per_kg?.message}
              testID="hb-price"
            />
          )}
        />

        <Controller
          control={control}
          name="harvest_date"
          render={({ field: { value, onChange } }) => (
            <TextInput
              label={t('harvest.date')}
              value={value}
              onChangeText={onChange}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              error={errors.harvest_date?.message}
              testID="hb-date"
            />
          )}
        />

        {buyers.length > 0 ? (
          <Controller
            control={control}
            name="buyer_id"
            render={({ field: { value, onChange } }) => (
              <Select
                label={t('harvest.buyer')}
                value={value || null}
                onChange={onChange}
                options={[
                  { value: '', label: t('harvest.buyer_none') },
                  ...buyers.map((b) => ({ value: b.id, label: b.buyer_name })),
                ]}
                placeholder={t('harvest.buyer_none')}
                error={errors.buyer_id?.message}
                testID="hb-buyer"
              />
            )}
          />
        ) : null}

        <Controller
          control={control}
          name="payment_status"
          render={({ field: { value, onChange } }) => (
            <RadioGroup
              label={t('harvest.payment_status')}
              options={statusOptions}
              value={value}
              onChange={onChange}
              error={errors.payment_status?.message}
              testID="hb-status"
            />
          )}
        />

        <Controller
          control={control}
          name="notes"
          render={({ field: { value, onChange } }) => (
            <TextInput
              label={t('harvest.notes')}
              value={value}
              onChangeText={onChange}
              error={errors.notes?.message}
              testID="hb-notes"
            />
          )}
        />

        <View style={styles.revenueCard}>
          <Text style={styles.revenueLabel}>{t('harvest.revenue_booked')}</Text>
          <Text style={styles.revenueValue}>{formatINR(revenue, { decimals: 2 })}</Text>
          <Text style={styles.revenueFormula}>
            {t('harvest.revenue_formula', {
              birds: birds || 0,
              weight: weight || 0,
              price: formatINR(parseFloat(price || '0'), { decimals: 2 }),
            })}
          </Text>
        </View>

        {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}

        <View style={styles.actions}>
          <Button
            variant="primary"
            label={t('harvest.submit')}
            onPress={handleSubmit(onSubmit)}
            loading={submitting}
            fullWidth
            testID="hb-confirm"
          />
          <Button variant="outlineDark" label={t('common.cancel')} onPress={onDismiss} fullWidth testID="hb-cancel" />
        </View>
      </ScrollView>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  modal: { backgroundColor: colors.canvas, margin: spacing.lg, borderRadius: radius.card, maxHeight: '90%' },
  content: { padding: spacing['2xl'], gap: spacing.lg },
  title: { ...typography.displaySm, color: colors.ink },
  subtitle: { ...typography.bodySm, color: colors.body },
  revenueCard: {
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  revenueLabel: { ...typography.captionUppercase, color: colors.body },
  revenueValue: { ...typography.displayXs, color: colors.ink },
  revenueFormula: { ...typography.bodySm, color: colors.body },
  serverError: { ...typography.bodySm, color: colors.primary },
  actions: { gap: spacing.sm },
});
