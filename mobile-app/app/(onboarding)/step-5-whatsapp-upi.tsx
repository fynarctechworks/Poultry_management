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
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useOnboardingStore } from '../../stores/onboarding';
import { StepIndicator, TextInput, Toggle, Button, Snackbar } from '../../components/ui';
import { syncOnboardingDraft } from '../../lib/onboarding-sync';
import { colors, spacing, typography } from '../../theme/tokens';

function makeSchema(t: TFunction) {
  return z.object({
    whatsapp_phone: z
      .string()
      .regex(/^\+?[0-9]{10,15}$/, t('onboarding.steps.step5.errors.phone_invalid')),
    whatsapp_opt_in: z.boolean(),
    upi_id: z
      .string()
      .optional()
      .refine(
        (val) => !val || /^[\w.\-]+@[\w.\-]+$/.test(val),
        { message: t('onboarding.steps.step5.errors.upi_invalid') },
      ),
  });
}

type FormData = z.infer<ReturnType<typeof makeSchema>>;

export default function Step5WhatsappUpi() {
  const { t } = useTranslation();
  const router = useRouter();
  const { step2, step5, setStep5 } = useOnboardingStore();
  const [snackVisible, setSnackVisible] = useState(false);
  const [snackMessage, setSnackMessage] = useState('');
  const schema = useMemo(() => makeSchema(t), [t]);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      whatsapp_phone: step5.whatsapp_phone || step2.phone,
      whatsapp_opt_in: step5.whatsapp_opt_in,
      upi_id: step5.upi_id,
    },
  });

  useEffect(() => {
    if (!step5.whatsapp_phone && step2.phone) {
      setValue('whatsapp_phone', step2.phone);
    }
  }, []);

  const onSubmit = async (values: FormData) => {
    // Persist this step locally, mirror the full draft to the server, then
    // hand off to the workspace-creation screen which runs the atomic RPC.
    setStep5({
      whatsapp_phone: values.whatsapp_phone,
      whatsapp_opt_in: values.whatsapp_opt_in,
      upi_id: values.upi_id ?? '',
    });
    await syncOnboardingDraft(5);
    router.push('/(onboarding)/creating');
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
        <StepIndicator current={5} total={5} style={styles.stepIndicator} />

        <Text style={styles.heading}>{t('onboarding.step5_heading')}</Text>
        <Text style={styles.sub}>{t('onboarding.steps.step5.sub')}</Text>

        <View style={styles.fields}>
          <Controller
            control={control}
            name="whatsapp_phone"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('onboarding.steps.step5.whatsapp_number')}
                value={value ?? ''}
                onChangeText={onChange}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder={t('onboarding.steps.step5.whatsapp_placeholder')}
                error={errors.whatsapp_phone?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="whatsapp_opt_in"
            render={({ field: { onChange, value } }) => (
              <Toggle
                label={t('onboarding.steps.step5.wa_toggle')}
                description={t('onboarding.steps.step5.wa_toggle_desc')}
                value={value}
                onValueChange={onChange}
              />
            )}
          />

          <Controller
            control={control}
            name="upi_id"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('onboarding.steps.step5.upi_id')}
                value={value ?? ''}
                onChangeText={onChange}
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder={t('onboarding.steps.step5.upi_placeholder')}
                error={errors.upi_id?.message}
              />
            )}
          />
          <Text style={styles.hint}>{t('onboarding.steps.step5.upi_hint')}</Text>
        </View>

        <View style={styles.navRow}>
          <Button
            label={t('onboarding.back')}
            variant="outlineDark"
            onPress={() => router.back()}
            style={styles.backBtn}
            disabled={isSubmitting}
          />
          <Button
            label={t('onboarding.finish')}
            variant="primary"
            onPress={handleSubmit(onSubmit)}
            loading={isSubmitting}
            style={styles.nextBtn}
          />
        </View>
      </ScrollView>

      <Snackbar visible={snackVisible} onDismiss={() => setSnackVisible(false)} duration={4000}>
        {snackMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xxl,
    paddingBottom: spacing['3xl'],
  },
  stepIndicator: { marginBottom: spacing['3xl'] },
  heading: { ...typography.displayLg, color: colors.ink, marginBottom: spacing.sm },
  sub: { ...typography.bodyMd, color: colors.body, marginBottom: spacing['3xl'] },
  fields: { gap: spacing.lg },
  hint: { ...typography.caption, color: colors.body, marginTop: -spacing.sm },
  navRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing['3xl'] },
  backBtn: { flex: 1 },
  nextBtn: { flex: 2 },
});
