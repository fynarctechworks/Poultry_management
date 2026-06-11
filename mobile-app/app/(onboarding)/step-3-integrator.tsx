import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useOnboardingStore } from '../../stores/onboarding';
import {
  StepIndicator,
  RadioGroup,
  Select,
  TextInput,
  Button,
} from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { syncOnboardingDraft } from '../../lib/onboarding-sync';
import { colors, spacing, typography } from '../../theme/tokens';

const FARM_TYPE_VALUES = ['independent', 'contract'] as const;

const CUSTOM_VALUE = '__custom__';

function makeSchema(t: TFunction) {
  return z
    .object({
      farm_type: z.enum(['independent', 'contract']),
      integrator_id: z.string().nullable(),
      custom_integrator_name: z.string(),
    })
    .superRefine((data, ctx) => {
      if (data.farm_type === 'contract') {
        if (!data.integrator_id) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: t('onboarding.steps.step3.errors.integrator_required'),
            path: ['integrator_id'],
          });
        } else if (data.integrator_id === CUSTOM_VALUE) {
          if (!data.custom_integrator_name || data.custom_integrator_name.trim().length < 2) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: t('onboarding.steps.step3.errors.custom_min'),
              path: ['custom_integrator_name'],
            });
          }
        }
      }
    });
}

type FormData = z.infer<ReturnType<typeof makeSchema>>;

type Integrator = { id: string; name: string };

export default function Step3Integrator() {
  const { t } = useTranslation();
  const router = useRouter();
  const { step3, setStep3 } = useOnboardingStore();
  const [integrators, setIntegrators] = useState<Integrator[]>([]);
  const [loadingIntegrators, setLoadingIntegrators] = useState(false);
  const schema = useMemo(() => makeSchema(t), [t]);
  const farmTypeOptions = FARM_TYPE_VALUES.map((value) => ({
    value,
    label: t(`onboarding.steps.step3.type.${value}`),
  }));

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      farm_type: step3.farm_type,
      integrator_id: step3.integrator_id,
      custom_integrator_name: step3.custom_integrator_name,
    },
  });

  const farmType = useWatch({ control, name: 'farm_type' });
  const integratorId = useWatch({ control, name: 'integrator_id' });

  useEffect(() => {
    if (farmType === 'contract' && integrators.length === 0) {
      setLoadingIntegrators(true);
      async function loadIntegrators() {
        try {
          const { data } = await supabase
            .from('integrators')
            .select('id,name')
            .order('name');
          setIntegrators(data ?? []);
        } catch {
          // ignore
        } finally {
          setLoadingIntegrators(false);
        }
      }
      loadIntegrators();
    }
  }, [farmType]);

  const integratorOptions = [
    ...integrators.map((i) => ({ value: i.id, label: i.name })),
    { value: CUSTOM_VALUE, label: t('onboarding.steps.step3.custom_option') },
  ];

  const onSubmit = (values: FormData) => {
    setStep3({
      farm_type: values.farm_type,
      integrator_id: values.integrator_id,
      custom_integrator_name: values.custom_integrator_name,
    });
    void syncOnboardingDraft(3);
    router.push('/(onboarding)/step-4-location');
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <StepIndicator current={3} total={5} style={styles.stepIndicator} />

        <Text style={styles.heading}>{t('onboarding.step3_heading')}</Text>
        <Text style={styles.sub}>
          {t('onboarding.steps.step3.sub')}
        </Text>

        <View style={styles.fields}>
          <Controller
            control={control}
            name="farm_type"
            render={({ field: { onChange, value } }) => (
              <RadioGroup
                label={t('onboarding.steps.step3.farm_type')}
                options={farmTypeOptions}
                value={value}
                onChange={onChange}
                error={errors.farm_type?.message}
              />
            )}
          />

          {farmType === 'contract' && (
            <>
              <Controller
                control={control}
                name="integrator_id"
                render={({ field: { onChange, value } }) => (
                  <Select
                    label={t('onboarding.steps.step3.integrator')}
                    options={integratorOptions}
                    value={value ?? null}
                    onChange={onChange}
                    placeholder={
                      loadingIntegrators
                        ? t('onboarding.steps.step3.integrator_loading')
                        : t('onboarding.steps.step3.integrator_placeholder')
                    }
                    disabled={loadingIntegrators}
                    error={errors.integrator_id?.message}
                  />
                )}
              />

              {integratorId === CUSTOM_VALUE && (
                <Controller
                  control={control}
                  name="custom_integrator_name"
                  render={({ field: { onChange, value } }) => (
                    <TextInput
                      label={t('onboarding.steps.step3.custom_name')}
                      value={value ?? ''}
                      onChangeText={onChange}
                      autoCapitalize="words"
                      error={errors.custom_integrator_name?.message}
                    />
                  )}
                />
              )}
            </>
          )}
        </View>

        <View style={styles.navRow}>
          <Button
            label={t('onboarding.back')}
            variant="outlineDark"
            onPress={() => router.back()}
            style={styles.backBtn}
          />
          <Button
            label={t('onboarding.next')}
            variant="primary"
            onPress={handleSubmit(onSubmit)}
            style={styles.nextBtn}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing['3xl'],
    paddingBottom: spacing['3xl'],
  },
  stepIndicator: { marginBottom: spacing['2xl'] },
  heading: {
    ...typography.displaySm,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  sub: {
    ...typography.bodyMd,
    color: colors.body,
    marginBottom: spacing['2xl'],
  },
  fields: { gap: spacing.lg },
  navRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing['3xl'],
  },
  backBtn: { flex: 1 },
  nextBtn: { flex: 2 },
});
