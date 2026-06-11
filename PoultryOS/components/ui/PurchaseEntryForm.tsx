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
import { Select } from './Select';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PurchaseEntryValues = {
  itemId: string;
  quantity: number;
  costPerUnit?: number;
  supplier?: string;
  movementDate: string;   // YYYY-MM-DD
  notes?: string;
};

export interface PurchaseEntryFormProps {
  /** Inventory items available for selection. */
  items: { id: string; label: string }[];
  onSubmit: (values: PurchaseEntryValues) => Promise<void>;
  submitting: boolean;
  onCancel?: () => void;
  style?: ViewStyle;
  testID?: string;
}

// ---------------------------------------------------------------------------
// Zod schema
// Numeric fields use string coercion at the RHF boundary (pattern from
// HealthIncidentForm — see comments there).
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function makeSchema(t: TFunction) {
  return z.object({
    itemId: z.string().min(1, t('inventory.purchase.errors.select_item')),
    quantity: z
      .string()
      .min(1, t('inventory.purchase.errors.quantity_required'))
      .refine(
        (v) => !Number.isNaN(parseFloat(v)) && parseFloat(v) > 0,
        { message: t('inventory.purchase.errors.quantity_positive') },
      ),
    costPerUnit: z
      .string()
      .optional()
      .refine(
        (v) => v === undefined || v === '' || (!Number.isNaN(parseFloat(v)) && parseFloat(v) >= 0),
        { message: t('inventory.purchase.errors.cost_non_negative') },
      ),
    supplier: z.string().optional(),
    movementDate: z
      .string()
      .regex(ISO_DATE_RE, t('inventory.purchase.errors.date_format'))
      .min(1, t('inventory.purchase.errors.date_required')),
    notes: z.string().optional(),
  });
}

type FormFields = z.infer<ReturnType<typeof makeSchema>>;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function PurchaseEntryForm({
  items,
  onSubmit,
  submitting,
  onCancel,
  style,
  testID,
}: PurchaseEntryFormProps) {
  const { t } = useTranslation();
  const schema = useMemo(() => makeSchema(t), [t]);
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      itemId: '',
      quantity: '',
      costPerUnit: '',
      supplier: '',
      movementDate: todayISO(),
      notes: '',
    },
  });

  const handleValidSubmit = async (data: FormFields) => {
    const values: PurchaseEntryValues = {
      itemId: data.itemId,
      quantity: parseFloat(data.quantity),
      costPerUnit:
        data.costPerUnit && data.costPerUnit !== ''
          ? parseFloat(data.costPerUnit)
          : undefined,
      supplier: data.supplier || undefined,
      movementDate: data.movementDate,
      notes: data.notes || undefined,
    };
    await onSubmit(values);
  };

  const selectOptions = items.map((i) => ({ value: i.id, label: i.label }));

  return (
    <ScrollView
      style={[styles.scroll, style]}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      testID={testID}
    >
      {/* 1. Item selection (required) */}
      <Controller
        control={control}
        name="itemId"
        render={({ field: { value, onChange } }) => (
          <Select
            label={`${t('inventory.purchase.item')} *`}
            options={selectOptions}
            value={value || null}
            onChange={onChange}
            placeholder={t('inventory.purchase.item_placeholder')}
            error={errors.itemId?.message}
            testID="pe-item-id"
          />
        )}
      />

      {/* 2. Quantity (required, >0) */}
      <Controller
        control={control}
        name="quantity"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={`${t('inventory.purchase.quantity')} *`}
            value={value}
            onChangeText={onChange}
            keyboardType="decimal-pad"
            error={errors.quantity?.message}
            style={styles.field}
            testID="pe-quantity"
          />
        )}
      />

      {/* 3. Cost per unit (optional) */}
      <Controller
        control={control}
        name="costPerUnit"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('inventory.purchase.cost_per_unit')}
            value={value ?? ''}
            onChangeText={onChange}
            keyboardType="decimal-pad"
            error={errors.costPerUnit?.message}
            style={styles.field}
            testID="pe-cost-per-unit"
          />
        )}
      />

      {/* 4. Supplier (optional) */}
      <Controller
        control={control}
        name="supplier"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('inventory.purchase.supplier')}
            value={value ?? ''}
            onChangeText={onChange}
            error={errors.supplier?.message}
            style={styles.field}
            testID="pe-supplier"
          />
        )}
      />

      {/* 5. Movement date */}
      <Controller
        control={control}
        name="movementDate"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('inventory.purchase.purchase_date')}
            value={value}
            onChangeText={onChange}
            placeholder={t('inventory.purchase.date_placeholder')}
            autoCapitalize="none"
            error={errors.movementDate?.message}
            style={styles.field}
            testID="pe-movement-date"
          />
        )}
      />

      {/* 6. Notes (optional, multiline) */}
      <Controller
        control={control}
        name="notes"
        render={({ field: { value, onChange } }) => (
          <View style={styles.field}>
            <TextInput
              label={t('inventory.purchase.notes')}
              value={value ?? ''}
              onChangeText={onChange}
              multiline
              numberOfLines={3}
              error={errors.notes?.message}
              testID="pe-notes"
            />
            <Text style={styles.helperText}>
              {t('inventory.purchase.notes_helper')}
            </Text>
          </View>
        )}
      />

      {/* Action buttons */}
      <View style={styles.actions}>
        <Button
          variant="primary"
          label={t('inventory.purchase.save')}
          onPress={handleSubmit(handleValidSubmit)}
          loading={submitting}
          fullWidth
          testID="pe-save"
        />
        {!!onCancel && (
          <Button
            variant="outlineDark"
            label={t('inventory.purchase.cancel')}
            onPress={onCancel}
            fullWidth
            style={styles.cancelButton}
            testID="pe-cancel"
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
