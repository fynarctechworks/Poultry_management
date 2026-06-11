import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth';
import { useFarmStore } from '../../stores/farm';
import {
  Button,
  Card,
  Select,
  TextInput,
  Toggle,
} from '../../components/ui';
import { colors, spacing, typography } from '../../theme/tokens';
import { isValidVpa } from '../../lib/upi';
import { INDIAN_STATES } from '../../lib/constants/states';

interface IntegratorRow {
  id: string;
  name: string;
}

const PHONE_REGEX = /^\+?\d{10,15}$/;

function makeSchema(t: TFunction) {
  return z.object({
    farm_name: z.string().trim().min(1, t('settings.form.errors.required')),
    owner_name: z.string().trim().min(1, t('settings.form.errors.required')),
    state: z.string().trim().min(1, t('settings.form.errors.required')),
    district: z.string().trim().optional(),
    phone: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || PHONE_REGEX.test(v), t('settings.form.errors.phone_invalid')),
    gstin: z.string().trim().optional(),
    farm_type: z.enum(['independent', 'contract']),
    integrator_id: z.string().optional(),
    upi_id: z
      .string()
      .trim()
      .optional()
      .refine(
        (v) => !v || isValidVpa(v),
        t('settings.form.errors.upi_invalid'),
      ),
    heat_stress_threshold_celsius: z
      .string()
      .trim()
      .refine(
        (v) => !Number.isNaN(parseFloat(v)) && parseFloat(v) >= 20 && parseFloat(v) <= 50,
        t('settings.form.errors.heat_range'),
      ),
    whatsapp_phone: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || PHONE_REGEX.test(v), t('settings.form.errors.whatsapp_phone_invalid')),
    whatsapp_opt_in: z.boolean(),
  });
}

type FormFields = z.infer<ReturnType<typeof makeSchema>>;

const STATE_OPTIONS = INDIAN_STATES;

export default function SettingsScreen() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const setCurrentFarm = useFarmStore((s) => s.setCurrentFarm);

  const [integrators, setIntegrators] = useState<IntegratorRow[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const schema = useMemo(() => makeSchema(t), [t]);
  const farmTypeOptions = useMemo(
    () => [
      { value: 'independent', label: t('settings.form.type_options.independent') },
      { value: 'contract', label: t('settings.form.type_options.contract') },
    ],
    [t],
  );

  const { control, handleSubmit, watch, reset, formState: { errors } } = useForm<FormFields>({
    resolver: zodResolver(schema),
    defaultValues: {
      farm_name: '',
      owner_name: '',
      state: '',
      district: '',
      phone: '',
      gstin: '',
      farm_type: 'independent',
      integrator_id: '',
      upi_id: '',
      heat_stress_threshold_celsius: '35.0',
      whatsapp_phone: '',
      whatsapp_opt_in: false,
    },
  });

  const farmType = watch('farm_type');

  const loadIntegrators = useCallback(async () => {
    const { data } = await supabase
      .from('integrators')
      .select('id, name')
      .order('name');
    setIntegrators((data ?? []) as IntegratorRow[]);
  }, []);

  const loadDefaults = useCallback(async () => {
    if (!currentFarm || !user) return;
    const [farmRes, profileRes] = await Promise.all([
      supabase
        .from('farms')
        .select(
          'farm_name, owner_name, state, district, phone, gstin, farm_type, integrator_id, upi_id, heat_stress_threshold_celsius',
        )
        .eq('id', currentFarm.id)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('whatsapp_phone, whatsapp_opt_in')
        .eq('id', user.id)
        .maybeSingle(),
    ]);

    const f = farmRes.data;
    const p = profileRes.data;
    if (f) {
      reset({
        farm_name: f.farm_name ?? '',
        owner_name: f.owner_name ?? '',
        state: f.state ?? '',
        district: f.district ?? '',
        phone: f.phone ?? '',
        gstin: f.gstin ?? '',
        farm_type: (f.farm_type as 'independent' | 'contract') ?? 'independent',
        integrator_id: f.integrator_id ?? '',
        upi_id: f.upi_id ?? '',
        heat_stress_threshold_celsius:
          f.heat_stress_threshold_celsius != null
            ? String(f.heat_stress_threshold_celsius)
            : '35.0',
        whatsapp_phone: p?.whatsapp_phone ?? '',
        whatsapp_opt_in: p?.whatsapp_opt_in ?? false,
      });
    }
  }, [currentFarm, user, reset]);

  useEffect(() => {
    loadIntegrators();
    loadDefaults();
  }, [loadIntegrators, loadDefaults]);

  const onSubmit = async (values: FormFields) => {
    if (!currentFarm || !user) return;
    setSubmitting(true);
    try {
      const farmPatch = {
        farm_name: values.farm_name,
        owner_name: values.owner_name,
        state: values.state,
        district: values.district || null,
        phone: values.phone || null,
        gstin: values.gstin || null,
        farm_type: values.farm_type,
        integrator_id:
          values.farm_type === 'contract' && values.integrator_id
            ? values.integrator_id
            : null,
        upi_id: values.upi_id || null,
        heat_stress_threshold_celsius: parseFloat(
          values.heat_stress_threshold_celsius,
        ),
        updated_at: new Date().toISOString(),
      };
      const profilePatch = {
        whatsapp_phone: values.whatsapp_phone || null,
        whatsapp_opt_in: values.whatsapp_opt_in,
        updated_at: new Date().toISOString(),
      };

      const [farmRes, profileRes] = await Promise.all([
        supabase.from('farms').update(farmPatch).eq('id', currentFarm.id).select().maybeSingle(),
        supabase.from('profiles').update(profilePatch).eq('id', user.id),
      ]);
      if (farmRes.error) throw farmRes.error;
      if (profileRes.error) throw profileRes.error;

      // Sync the farm store so dependent screens (Khata UPI QR, heat banner)
      // see the change without a relog.
      if (farmRes.data) {
        setCurrentFarm({
          ...currentFarm,
          farm_name: farmRes.data.farm_name,
          owner_name: farmRes.data.owner_name,
          state: farmRes.data.state,
          district: farmRes.data.district ?? '',
          phone: farmRes.data.phone ?? '',
          farm_type: farmRes.data.farm_type as 'independent' | 'contract',
          upi_id: farmRes.data.upi_id,
          heat_stress_threshold_celsius: farmRes.data.heat_stress_threshold_celsius,
        });
      }
      setSnackbar(t('settings.saved'));
    } catch (err: unknown) {
      setSnackbar(err instanceof Error ? err.message : t('settings.form.save_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const integratorOptions = [
    { value: '', label: t('settings.form.integrator_none') },
    ...integrators.map((i) => ({ value: i.id, label: i.name })),
  ];

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: t('settings.title') }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {/* ---- Farm profile ---- */}
        <Card>
          <Text style={styles.sectionTitle}>{t('settings.sections.farm_profile')}</Text>
          <View style={styles.formGroup}>
            <Controller
              control={control}
              name="farm_name"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={`${t('settings.form.farm_name')} *`}
                  value={value}
                  onChangeText={onChange}
                  error={errors.farm_name?.message}
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="owner_name"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={`${t('settings.form.owner_name')} *`}
                  value={value}
                  onChangeText={onChange}
                  error={errors.owner_name?.message}
                  autoCapitalize="words"
                />
              )}
            />
            <Controller
              control={control}
              name="state"
              render={({ field: { value, onChange } }) => (
                <Select
                  label={`${t('settings.form.state')} *`}
                  options={STATE_OPTIONS}
                  value={value || null}
                  onChange={onChange}
                  error={errors.state?.message}
                  placeholder={t('settings.form.state_placeholder')}
                />
              )}
            />
            <Controller
              control={control}
              name="district"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={t('settings.form.district')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  error={errors.district?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="phone"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={t('settings.form.phone')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  keyboardType="phone-pad"
                  error={errors.phone?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="gstin"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={t('settings.form.gstin')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  autoCapitalize="characters"
                  error={errors.gstin?.message}
                />
              )}
            />
          </View>
        </Card>

        {/* ---- Farm type ---- */}
        <Card>
          <Text style={styles.sectionTitle}>{t('settings.sections.farm_type')}</Text>
          <View style={styles.formGroup}>
            <Controller
              control={control}
              name="farm_type"
              render={({ field: { value, onChange } }) => (
                <Select
                  label={`${t('settings.form.type')} *`}
                  options={farmTypeOptions}
                  value={value}
                  onChange={(v) => onChange(v as 'independent' | 'contract')}
                />
              )}
            />
            {farmType === 'contract' ? (
              <Controller
                control={control}
                name="integrator_id"
                render={({ field: { value, onChange } }) => (
                  <Select
                    label={t('settings.form.integrator')}
                    options={integratorOptions}
                    value={value ?? ''}
                    onChange={onChange}
                    placeholder={t('settings.form.integrator_placeholder')}
                  />
                )}
              />
            ) : null}
          </View>
        </Card>

        {/* ---- Payments ---- */}
        <Card>
          <Text style={styles.sectionTitle}>{t('settings.sections.payments')}</Text>
          <View style={styles.formGroup}>
            <Controller
              control={control}
              name="upi_id"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={t('settings.form.upi_id')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  autoCapitalize="none"
                  placeholder={t('settings.form.upi_placeholder')}
                  error={errors.upi_id?.message}
                />
              )}
            />
            <Text style={styles.helperText}>
              {t('settings.form.upi_helper')}
            </Text>
          </View>
        </Card>

        {/* ---- Climate ---- */}
        <Card>
          <Text style={styles.sectionTitle}>{t('settings.sections.climate')}</Text>
          <View style={styles.formGroup}>
            <Controller
              control={control}
              name="heat_stress_threshold_celsius"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={`${t('settings.form.heat_threshold')} *`}
                  value={value}
                  onChangeText={onChange}
                  keyboardType="decimal-pad"
                  error={errors.heat_stress_threshold_celsius?.message}
                />
              )}
            />
            <Text style={styles.helperText}>
              {t('settings.form.heat_helper')}
            </Text>
          </View>
        </Card>

        {/* ---- WhatsApp ---- */}
        <Card>
          <Text style={styles.sectionTitle}>{t('settings.sections.whatsapp')}</Text>
          <View style={styles.formGroup}>
            <Controller
              control={control}
              name="whatsapp_phone"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label={t('settings.form.whatsapp_phone')}
                  value={value ?? ''}
                  onChangeText={onChange}
                  keyboardType="phone-pad"
                  error={errors.whatsapp_phone?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="whatsapp_opt_in"
              render={({ field: { value, onChange } }) => (
                <Toggle
                  label={t('settings.form.wa_toggle')}
                  description={t('settings.form.wa_toggle_desc')}
                  value={!!value}
                  onValueChange={onChange}
                />
              )}
            />
          </View>
        </Card>

        <Button
          variant="primary"
          label={submitting ? t('common.loading') : t('settings.save')}
          onPress={handleSubmit(onSubmit)}
          disabled={submitting}
          fullWidth
        />
      </ScrollView>
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
        {snackbar ?? ''}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['3xl'] * 2,
  },
  sectionTitle: {
    ...typography.bodyMdStrong,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  formGroup: { gap: spacing.md },
  helperText: {
    ...typography.caption,
    color: colors.body,
  },
});
