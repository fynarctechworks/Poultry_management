import { useEffect, useMemo, useState } from 'react';
import { AppModal } from './AppModal';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AlertTriangle } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { Button } from './Button';
import { TextInput } from './TextInput';
import { todayISO } from '../../lib/format-date';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { formatINR as sharedINR, formatNumber as sharedNum } from '@poultryos/shared';

export interface CloseBatchModalProps {
  visible: boolean;
  onDismiss: () => void;
  batch: {
    id: string;
    batch_code: string;
    current_bird_count: number;
    placement_date: string;
  };
  onSuccess: (updated: ClosedBatch) => void;
  testID?: string;
}

export interface ClosedBatch {
  id: string;
  status: string;
  harvest_date: string | null;
  birds_sold: number | null;
  sale_weight_kg: number | null;
  sale_price_per_kg: number | null;
  total_sale_revenue: number | null;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function buildSchema(batch: CloseBatchModalProps['batch']) {
  return z.object({
    harvest_date: z
      .string()
      .regex(ISO_DATE_RE, 'Date must be YYYY-MM-DD')
      .refine(
        (v) => v >= batch.placement_date,
        'Harvest date must be on or after placement',
      )
      .refine((v) => v <= todayISO(), 'Harvest date cannot be in the future'),
    birds_sold: z
      .string()
      .min(1, 'Required')
      .refine(
        (v) => /^\d+$/.test(v),
        'Must be a whole number',
      )
      .refine(
        (v) => Number(v) >= 0 && Number(v) <= batch.current_bird_count,
        `Must be between 0 and ${batch.current_bird_count}`,
      ),
    sale_weight_kg: z
      .string()
      .min(1, 'Required')
      .refine(
        (v) => !Number.isNaN(parseFloat(v)) && parseFloat(v) > 0,
        'Must be greater than 0',
      ),
    sale_price_per_kg: z
      .string()
      .min(1, 'Required')
      .refine(
        (v) => !Number.isNaN(parseFloat(v)) && parseFloat(v) > 0,
        'Must be greater than 0',
      ),
  });
}

type FormFields = {
  harvest_date: string;
  birds_sold: string;
  sale_weight_kg: string;
  sale_price_per_kg: string;
};

export function CloseBatchModal({
  visible,
  onDismiss,
  batch,
  onSuccess,
  testID,
}: CloseBatchModalProps) {
  const schema = useMemo(() => buildSchema(batch), [batch]);
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const { control, handleSubmit, watch, reset, formState: { errors } } =
    useForm<FormFields>({
      resolver: zodResolver(schema),
      defaultValues: {
        harvest_date: todayISO(),
        birds_sold: String(batch.current_bird_count),
        sale_weight_kg: '',
        sale_price_per_kg: '',
      },
    });

  useEffect(() => {
    if (visible) {
      reset({
        harvest_date: todayISO(),
        birds_sold: String(batch.current_bird_count),
        sale_weight_kg: '',
        sale_price_per_kg: '',
      });
      setServerError(null);
    }
  }, [visible, batch.current_bird_count, reset]);

  const weight = watch('sale_weight_kg');
  const price = watch('sale_price_per_kg');
  const estRevenue =
    parseFloat(weight || '0') > 0 && parseFloat(price || '0') > 0
      ? parseFloat(weight) * parseFloat(price)
      : null;

  const onSubmit = async (values: FormFields) => {
    setSubmitting(true);
    setServerError(null);
    try {
      const { data, error } = await supabase.rpc('close_batch', {
        p_batch_id: batch.id,
        p_harvest_date: values.harvest_date,
        p_birds_sold: parseInt(values.birds_sold, 10),
        p_sale_weight_kg: parseFloat(values.sale_weight_kg),
        p_sale_price_per_kg: parseFloat(values.sale_price_per_kg),
      });
      if (error) throw error;
      onSuccess(data as ClosedBatch);
      onDismiss();
    } catch (err: unknown) {
      setServerError(
        err instanceof Error ? err.message : 'Failed to close batch',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}
        testID={testID}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>{`Close batch ${batch.batch_code}`}</Text>

          <View style={styles.warningRow}>
            <AlertTriangle size={16} color={colors.warning} />
            <Text style={styles.warningText}>
              This action is irreversible. Daily logs, health incidents and
              traceability will be locked.
            </Text>
          </View>

          <Controller
            control={control}
            name="harvest_date"
            render={({ field: { value, onChange } }) => (
              <TextInput
                label="Harvest date *"
                value={value}
                onChangeText={onChange}
                placeholder="YYYY-MM-DD"
                autoCapitalize="none"
                error={errors.harvest_date?.message}
                testID="cb-harvest-date"
              />
            )}
          />

          <Controller
            control={control}
            name="birds_sold"
            render={({ field: { value, onChange } }) => (
              <TextInput
                label={`Birds sold * (max ${batch.current_bird_count})`}
                value={value}
                onChangeText={onChange}
                keyboardType="number-pad"
                error={errors.birds_sold?.message}
                testID="cb-birds-sold"
              />
            )}
          />

          <Controller
            control={control}
            name="sale_weight_kg"
            render={({ field: { value, onChange } }) => (
              <TextInput
                label="Sale weight (kg) *"
                value={value}
                onChangeText={onChange}
                keyboardType="decimal-pad"
                error={errors.sale_weight_kg?.message}
                testID="cb-sale-weight"
              />
            )}
          />

          <Controller
            control={control}
            name="sale_price_per_kg"
            render={({ field: { value, onChange } }) => (
              <TextInput
                label="Sale price (₹/kg) *"
                value={value}
                onChangeText={onChange}
                keyboardType="decimal-pad"
                error={errors.sale_price_per_kg?.message}
                testID="cb-sale-price"
              />
            )}
          />

          {estRevenue !== null ? (
            <View style={styles.estimateRow}>
              <Text style={styles.estimateLabel}>Estimated revenue</Text>
              <Text style={styles.estimateValue}>
                {sharedINR(estRevenue, { decimals: 2 })}
              </Text>
            </View>
          ) : null}

          {serverError ? (
            <Text style={styles.serverError}>{serverError}</Text>
          ) : null}

          <View style={styles.actions}>
            <Button
              variant="primary"
              label="Close batch"
              onPress={handleSubmit(onSubmit)}
              loading={submitting}
              fullWidth
              testID="cb-confirm"
            />
            <Button
              variant="outlineDark"
              label="Cancel"
              onPress={onDismiss}
              fullWidth
              testID="cb-cancel"
            />
          </View>
        </ScrollView>
      </AppModal>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: colors.canvas,
    margin: spacing.lg,
    borderRadius: radius.card,
    maxHeight: '90%',
  },
  content: {
    padding: spacing['2xl'],
    gap: spacing.lg,
  },
  title: {
    ...typography.displaySm,
    color: colors.ink,
  },
  warningRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.warningSoft,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  warningText: {
    flex: 1,
    ...typography.bodySm,
    color: colors.warningInk,
  },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.canvasSoft,
    padding: spacing.md,
    borderRadius: radius.sm,
  },
  estimateLabel: {
    ...typography.captionUppercase,
    color: colors.body,
  },
  estimateValue: {
    ...typography.bodyMdStrong,
    color: colors.ink,
  },
  serverError: {
    ...typography.bodySm,
    color: colors.primary,
  },
  actions: {
    gap: spacing.sm,
  },
});
