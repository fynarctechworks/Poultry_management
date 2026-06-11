import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo } from 'react';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useOnboardingStore } from '../../stores/onboarding';
import { syncOnboardingDraft } from '../../lib/onboarding-sync';
import { StepIndicator, TextInput, Select, Button } from '../../components/ui';
import { INDIAN_STATES } from '../../lib/constants/states';
import { colors, spacing, typography } from '../../theme/tokens';

function makeSchema(t: TFunction) {
  return z.object({
    farm_name: z.string().min(2, t('onboarding.steps.step2.errors.farm_name_min')),
    owner_name: z.string().min(2, t('onboarding.steps.step2.errors.owner_name_min')),
    state: z.string().min(1, t('onboarding.steps.step2.errors.state_required')),
    district: z.string().min(2, t('onboarding.steps.step2.errors.district_min')),
    phone: z
      .string()
      .regex(/^\+?[0-9]{10,15}$/, t('onboarding.steps.step2.errors.phone_invalid')),
    gstin: z
      .string()
      .optional()
      .refine(
        (val) =>
          !val ||
          /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}[Z]{1}[A-Z0-9]{1}$/i.test(val),
        { message: t('onboarding.steps.step2.errors.gstin_invalid') },
      ),
  });
}

type FormData = z.infer<ReturnType<typeof makeSchema>>;

export default function Step2Farm() {
  const { t } = useTranslation();
  const router = useRouter();
  const { step2, setStep2 } = useOnboardingStore();
  const schema = useMemo(() => makeSchema(t), [t]);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      farm_name: step2.farm_name,
      owner_name: step2.owner_name,
      state: step2.state,
      district: step2.district,
      phone: step2.phone,
      gstin: step2.gstin,
    },
  });

  const onSubmit = (values: FormData) => {
    setStep2({
      farm_name: values.farm_name,
      owner_name: values.owner_name,
      state: values.state,
      district: values.district,
      phone: values.phone,
      gstin: values.gstin ?? '',
    });
    void syncOnboardingDraft(2);
    router.push('/(onboarding)/step-3-integrator');
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
        <StepIndicator current={2} total={5} style={styles.stepIndicator} />

        <Text style={styles.heading}>{t('onboarding.step2_heading')}</Text>
        <Text style={styles.sub}>
          {t('onboarding.steps.step2.sub')}
        </Text>

        <View style={styles.fields}>
          <Controller
            control={control}
            name="farm_name"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('onboarding.steps.step2.farm_name')}
                value={value ?? ''}
                onChangeText={onChange}
                autoCapitalize="words"
                error={errors.farm_name?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="owner_name"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('onboarding.steps.step2.owner_name')}
                value={value ?? ''}
                onChangeText={onChange}
                autoCapitalize="words"
                autoComplete="name"
                error={errors.owner_name?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="state"
            render={({ field: { onChange, value } }) => (
              <Select
                label={t('onboarding.steps.step2.state')}
                options={INDIAN_STATES}
                value={value ?? null}
                onChange={onChange}
                placeholder={t('onboarding.steps.step2.state_placeholder')}
                error={errors.state?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="district"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('onboarding.steps.step2.district')}
                value={value ?? ''}
                onChangeText={onChange}
                autoCapitalize="words"
                error={errors.district?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('onboarding.steps.step2.phone')}
                value={value ?? ''}
                onChangeText={onChange}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder={t('onboarding.steps.step2.phone_placeholder')}
                error={errors.phone?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="gstin"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('onboarding.steps.step2.gstin')}
                value={value ?? ''}
                onChangeText={onChange}
                autoCapitalize="characters"
                placeholder={t('onboarding.steps.step2.gstin_placeholder')}
                error={errors.gstin?.message}
              />
            )}
          />
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
