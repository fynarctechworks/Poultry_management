import { useMemo } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { z } from 'zod';
import { colors, spacing } from '../../theme/tokens';
import { todayISO } from '../../lib/format-date';
import { Button } from './Button';
import { TextInput } from './TextInput';
import { Select } from './Select';
import { RadioGroup } from './RadioGroup';

export type TransactionType = 'income' | 'expense';
export type PaymentStatus = 'paid' | 'pending' | 'partial';

export type TransactionFormValues = {
  transactionType: TransactionType;
  category: string;
  amount: number;
  quantity?: number;
  pricePerUnit?: number;
  buyerId?: string;
  counterparty?: string;
  transactionDate: string;
  paymentStatus: PaymentStatus;
  amountPaid?: number;
  dueDate?: string;
  notes?: string;
};

export interface TransactionFormProps {
  buyers: { id: string; label: string }[];
  defaultType?: TransactionType;
  defaultBuyerId?: string;
  onSubmit: (values: TransactionFormValues) => Promise<void>;
  submitting: boolean;
  onCancel?: () => void;
  style?: ViewStyle;
  testID?: string;
}

const INCOME_CATEGORY_VALUES = [
  'bird_sale',
  'egg_sale',
  'manure_sale',
  'other_income',
] as const;

const EXPENSE_CATEGORY_VALUES = [
  'feed',
  'medicine',
  'vaccine',
  'chicks',
  'labour',
  'utilities',
  'equipment',
  'other_expense',
] as const;

const PAYMENT_STATUS_VALUES = ['paid', 'pending', 'partial'] as const;
const TYPE_VALUES = ['income', 'expense'] as const;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function makeSchema(t: TFunction) {
  const numericPositive = z
    .string()
    .min(1, t('transaction_form.errors.required'))
    .refine((v) => !Number.isNaN(parseFloat(v)) && parseFloat(v) > 0, {
      message: t('transaction_form.errors.must_be_positive'),
    });

  const numericOptional = z
    .string()
    .optional()
    .refine(
      (v) =>
        v === undefined ||
        v === '' ||
        (!Number.isNaN(parseFloat(v)) && parseFloat(v) >= 0),
      { message: t('transaction_form.errors.must_be_zero_or_greater') },
    );

  return z
    .object({
      transactionType: z.enum(['income', 'expense']),
      category: z.string().min(1, t('transaction_form.errors.pick_category')),
      amount: numericPositive,
      quantity: numericOptional,
      pricePerUnit: numericOptional,
      buyerId: z.string().optional(),
      counterparty: z.string().optional(),
      transactionDate: z
        .string()
        .regex(ISO_DATE_RE, t('transaction_form.errors.date_format')),
      paymentStatus: z.enum(['paid', 'pending', 'partial']),
      amountPaid: numericOptional,
      dueDate: z
        .string()
        .optional()
        .refine((v) => v === undefined || v === '' || ISO_DATE_RE.test(v), {
          message: t('transaction_form.errors.due_date_format'),
        }),
      notes: z.string().optional(),
    })
    .refine(
      (data) =>
        data.paymentStatus === 'paid' || !!(data.dueDate && data.dueDate !== ''),
      {
        message: t('transaction_form.errors.due_date_required'),
        path: ['dueDate'],
      },
    )
    .refine(
      (data) => {
        if (data.paymentStatus !== 'partial') return true;
        const paid = parseFloat(data.amountPaid ?? '');
        const total = parseFloat(data.amount);
        return !Number.isNaN(paid) && paid > 0 && !Number.isNaN(total) && paid < total;
      },
      {
        message: t('transaction_form.errors.amount_paid_range'),
        path: ['amountPaid'],
      },
    );
}

type FormFields = z.infer<ReturnType<typeof makeSchema>>;

export function TransactionForm({
  buyers,
  defaultType = 'income',
  defaultBuyerId,
  onSubmit,
  submitting,
  onCancel,
  style,
  testID,
}: TransactionFormProps) {
  const { t } = useTranslation();
  const schema = useMemo(() => makeSchema(t), [t]);
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      transactionType: defaultType,
      category: '',
      amount: '',
      quantity: '',
      pricePerUnit: '',
      buyerId: defaultBuyerId ?? '',
      counterparty: '',
      transactionDate: todayISO(),
      paymentStatus: 'paid',
      amountPaid: '',
      dueDate: '',
      notes: '',
    },
  });

  const txType = watch('transactionType');
  const paymentStatus = watch('paymentStatus');

  const typeOptions = TYPE_VALUES.map((value) => ({
    value,
    label: t(`transaction_form.type.${value}`),
  }));

  const paymentStatusOptions = PAYMENT_STATUS_VALUES.map((value) => ({
    value,
    label: t(`transaction_form.payment_status.${value}`),
  }));

  const categoryOptions =
    txType === 'income'
      ? INCOME_CATEGORY_VALUES.map((value) => ({
          value,
          label: t(`transaction_form.income_category.${value}`),
        }))
      : EXPENSE_CATEGORY_VALUES.map((value) => ({
          value,
          label: t(`transaction_form.expense_category.${value}`),
        }));

  const buyerOptions = [
    { value: '', label: t('transaction_form.no_buyer_linked') },
    ...buyers.map((b) => ({ value: b.id, label: b.label })),
  ];

  const handleValidSubmit = async (data: FormFields) => {
    const values: TransactionFormValues = {
      transactionType: data.transactionType,
      category: data.category,
      amount: parseFloat(data.amount),
      quantity:
        data.quantity && data.quantity !== ''
          ? parseFloat(data.quantity)
          : undefined,
      pricePerUnit:
        data.pricePerUnit && data.pricePerUnit !== ''
          ? parseFloat(data.pricePerUnit)
          : undefined,
      buyerId: data.buyerId && data.buyerId !== '' ? data.buyerId : undefined,
      counterparty: data.counterparty || undefined,
      transactionDate: data.transactionDate,
      paymentStatus: data.paymentStatus,
      amountPaid:
        data.paymentStatus === 'partial' && data.amountPaid && data.amountPaid !== ''
          ? parseFloat(data.amountPaid)
          : undefined,
      dueDate: data.dueDate && data.dueDate !== '' ? data.dueDate : undefined,
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
      <Controller
        control={control}
        name="transactionType"
        render={({ field: { value, onChange } }) => (
          <RadioGroup
            label={`${t('transaction_form.type_label')} *`}
            options={typeOptions}
            value={value}
            onChange={(v) => {
              onChange(v);
              setValue('category', '');
              if (v === 'expense') setValue('buyerId', '');
            }}
            error={errors.transactionType?.message}
            testID="tx-type"
          />
        )}
      />

      <Controller
        control={control}
        name="category"
        render={({ field: { value, onChange } }) => (
          <Select
            label={`${t('transaction_form.category_label')} *`}
            options={categoryOptions}
            value={value || null}
            onChange={onChange}
            placeholder={t('transaction_form.category_placeholder')}
            error={errors.category?.message}
            testID="tx-category"
          />
        )}
      />

      <Controller
        control={control}
        name="amount"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={`${t('transaction_form.amount_label')} *`}
            value={value}
            onChangeText={onChange}
            keyboardType="decimal-pad"
            error={errors.amount?.message}
            testID="tx-amount"
          />
        )}
      />

      <Controller
        control={control}
        name="quantity"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('transaction_form.quantity_label')}
            value={value ?? ''}
            onChangeText={onChange}
            keyboardType="decimal-pad"
            error={errors.quantity?.message}
            testID="tx-quantity"
          />
        )}
      />

      <Controller
        control={control}
        name="pricePerUnit"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('transaction_form.price_per_unit_label')}
            value={value ?? ''}
            onChangeText={onChange}
            keyboardType="decimal-pad"
            error={errors.pricePerUnit?.message}
            testID="tx-price-per-unit"
          />
        )}
      />

      {txType === 'income' && buyers.length > 0 ? (
        <Controller
          control={control}
          name="buyerId"
          render={({ field: { value, onChange } }) => (
            <Select
              label={t('transaction_form.buyer_label')}
              options={buyerOptions}
              value={value ?? ''}
              onChange={onChange}
              placeholder={t('transaction_form.buyer_placeholder')}
              error={errors.buyerId?.message}
              testID="tx-buyer"
            />
          )}
        />
      ) : null}

      <Controller
        control={control}
        name="counterparty"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={
              txType === 'income'
                ? t('transaction_form.buyer_name_label')
                : t('transaction_form.supplier_name_label')
            }
            value={value ?? ''}
            onChangeText={onChange}
            error={errors.counterparty?.message}
            testID="tx-counterparty"
          />
        )}
      />

      <Controller
        control={control}
        name="transactionDate"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={`${t('transaction_form.transaction_date_label')} *`}
            value={value}
            onChangeText={onChange}
            placeholder={t('transaction_form.date_placeholder')}
            autoCapitalize="none"
            error={errors.transactionDate?.message}
            testID="tx-date"
          />
        )}
      />

      <Controller
        control={control}
        name="paymentStatus"
        render={({ field: { value, onChange } }) => (
          <RadioGroup
            label={`${t('transaction_form.payment_status_label')} *`}
            options={paymentStatusOptions}
            value={value}
            onChange={onChange}
            error={errors.paymentStatus?.message}
            testID="tx-payment-status"
          />
        )}
      />

      {paymentStatus === 'partial' ? (
        <Controller
          control={control}
          name="amountPaid"
          render={({ field: { value, onChange } }) => (
            <TextInput
              label={`${t('transaction_form.amount_paid_label')} *`}
              value={value ?? ''}
              onChangeText={onChange}
              keyboardType="decimal-pad"
              error={errors.amountPaid?.message}
              testID="tx-amount-paid"
            />
          )}
        />
      ) : null}

      {paymentStatus !== 'paid' ? (
        <Controller
          control={control}
          name="dueDate"
          render={({ field: { value, onChange } }) => (
            <TextInput
              label={`${t('transaction_form.due_date_label')} *`}
              value={value ?? ''}
              onChangeText={onChange}
              placeholder={t('transaction_form.date_placeholder')}
              autoCapitalize="none"
              error={errors.dueDate?.message}
              testID="tx-due-date"
            />
          )}
        />
      ) : null}

      <Controller
        control={control}
        name="notes"
        render={({ field: { value, onChange } }) => (
          <TextInput
            label={t('transaction_form.notes_label')}
            value={value ?? ''}
            onChangeText={onChange}
            multiline
            numberOfLines={3}
            error={errors.notes?.message}
            testID="tx-notes"
          />
        )}
      />

      <View style={styles.actions}>
        <Button
          variant="primary"
          label={t('transaction_form.save')}
          onPress={handleSubmit(handleValidSubmit)}
          loading={submitting}
          fullWidth
          testID="tx-save"
        />
        {!!onCancel && (
          <Button
            variant="outlineDark"
            label={t('transaction_form.cancel')}
            onPress={onCancel}
            fullWidth
            style={styles.cancelButton}
            testID="tx-cancel"
          />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
    backgroundColor: colors.canvasSoft,
  },
  actions: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  cancelButton: {
    marginTop: spacing.xs,
  },
});
