import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import { Button, TextInput } from '../../components/ui';
import { colors, spacing } from '../../theme/tokens';

const PHONE_REGEX = /^\+?\d{10,15}$/;

function makeSchema(t: TFunction) {
  return z.object({
    buyer_name: z.string().trim().min(1, t('buyers.form.errors.name_required')),
    phone: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || PHONE_REGEX.test(v), t('buyers.form.errors.invalid_phone')),
    whatsapp_phone: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || PHONE_REGEX.test(v), t('buyers.form.errors.invalid_whatsapp')),
    address: z.string().trim().optional(),
    gstin: z.string().trim().optional(),
    credit_limit: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => !v || (!Number.isNaN(Number(v)) && Number(v) >= 0),
        t('buyers.form.errors.positive_number'),
      ),
  });
}

type FormValues = z.infer<ReturnType<typeof makeSchema>>;

export default function NewBuyerScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const schema = useMemo(() => makeSchema(t), [t]);

  const { control, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      buyer_name: '',
      phone: '',
      whatsapp_phone: '',
      address: '',
      gstin: '',
      credit_limit: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    if (!currentFarm) {
      setSnackbar(t('buyers.form.no_farm_selected'));
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('buyers').insert({
        farm_id: currentFarm.id,
        buyer_name: values.buyer_name,
        phone: values.phone || null,
        whatsapp_phone: values.whatsapp_phone || null,
        address: values.address || null,
        gstin: values.gstin || null,
        credit_limit: values.credit_limit ? Number(values.credit_limit) : 0,
      });
      if (error) throw error;
      router.back();
    } catch (err: unknown) {
      setSnackbar(err instanceof Error ? err.message : t('buyers.form.add_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Controller
          control={control}
          name="buyer_name"
          render={({ field }) => (
            <TextInput
              label={`${t('buyers.form.name')} *`}
              value={field.value}
              onChangeText={field.onChange}
              error={errors.buyer_name?.message}
              autoCapitalize="words"
            />
          )}
        />
        <Controller
          control={control}
          name="phone"
          render={({ field }) => (
            <TextInput
              label={t('buyers.form.phone')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              error={errors.phone?.message}
              keyboardType="phone-pad"
            />
          )}
        />
        <Controller
          control={control}
          name="whatsapp_phone"
          render={({ field }) => (
            <TextInput
              label={t('buyers.form.whatsapp_phone')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              error={errors.whatsapp_phone?.message}
              keyboardType="phone-pad"
            />
          )}
        />
        <Controller
          control={control}
          name="address"
          render={({ field }) => (
            <TextInput
              label={t('buyers.form.address')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              error={errors.address?.message}
              multiline
            />
          )}
        />
        <Controller
          control={control}
          name="gstin"
          render={({ field }) => (
            <TextInput
              label={t('buyers.form.gstin')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              error={errors.gstin?.message}
              autoCapitalize="characters"
            />
          )}
        />
        <Controller
          control={control}
          name="credit_limit"
          render={({ field }) => (
            <TextInput
              label={t('buyers.form.credit_limit')}
              value={field.value ?? ''}
              onChangeText={field.onChange}
              error={errors.credit_limit?.message}
              keyboardType="decimal-pad"
            />
          )}
        />

        <View style={styles.actions}>
          <Button
            variant="primary"
            label={submitting ? t('buyers.form.saving') : t('buyers.form.add')}
            onPress={handleSubmit(onSubmit)}
            disabled={submitting}
          />
        </View>
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
        {snackbar ?? ''}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing['3xl'] },
  actions: { marginTop: spacing.lg },
});
