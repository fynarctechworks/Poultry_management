import { useEffect, useMemo } from 'react';
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
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuthStore } from '../../stores/auth';
import { useOnboardingStore } from '../../stores/onboarding';
import { syncOnboardingDraft } from '../../lib/onboarding-sync';
import { StepIndicator, TextInput, Button } from '../../components/ui';
import { colors, spacing, typography } from '../../theme/tokens';

function makeSchema(t: TFunction) {
  return z.object({
    full_name: z.string().min(2, t('onboarding.steps.step1.errors.name_min')),
  });
}

type FormData = z.infer<ReturnType<typeof makeSchema>>;

export default function Step1Profile() {
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { step1, setStep1 } = useOnboardingStore();
  const schema = useMemo(() => makeSchema(t), [t]);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { full_name: step1.full_name },
  });

  useEffect(() => {
    // Pre-fill from auth metadata if available
    const metaName = user?.user_metadata?.full_name ?? '';
    if (!step1.full_name && metaName) {
      setValue('full_name', metaName);
    }
  }, [user]);

  const onSubmit = (values: FormData) => {
    setStep1({ full_name: values.full_name });
    void syncOnboardingDraft(1);
    router.push('/(onboarding)/step-2-farm');
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
        <StepIndicator current={1} total={5} style={styles.stepIndicator} />

        <Text style={styles.heading}>{t('onboarding.step1_heading')}</Text>
        <Text style={styles.sub}>
          {t('onboarding.steps.step1.sub')}
        </Text>

        <View style={styles.fields}>
          <Controller
            control={control}
            name="full_name"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('onboarding.steps.step1.full_name')}
                value={value ?? ''}
                onChangeText={onChange}
                autoCapitalize="words"
                autoComplete="name"
                error={errors.full_name?.message}
              />
            )}
          />
        </View>

        <Button
          label={t('onboarding.next')}
          variant="primary"
          onPress={handleSubmit(onSubmit)}
          fullWidth
          style={styles.cta}
        />
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
  cta: { marginTop: spacing['3xl'] },
});
