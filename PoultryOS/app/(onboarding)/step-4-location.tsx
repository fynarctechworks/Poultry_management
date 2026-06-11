import { useMemo, useState } from 'react';
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
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useOnboardingStore } from '../../stores/onboarding';
import { syncOnboardingDraft } from '../../lib/onboarding-sync';
import { StepIndicator, TextInput, Button } from '../../components/ui';
import { colors, spacing, typography } from '../../theme/tokens';

function makeSchema(t: TFunction) {
  return z.object({
    latitude: z
      .string()
      .refine(
        (v) => {
          if (!v) return true; // optional
          const n = parseFloat(v);
          return !isNaN(n) && n >= -90 && n <= 90;
        },
        { message: t('onboarding.steps.step4.errors.lat_range') },
      ),
    longitude: z
      .string()
      .refine(
        (v) => {
          if (!v) return true;
          const n = parseFloat(v);
          return !isNaN(n) && n >= -180 && n <= 180;
        },
        { message: t('onboarding.steps.step4.errors.lon_range') },
      ),
    heat_stress_threshold_celsius: z
      .string()
      .refine(
        (v) => {
          const n = parseFloat(v);
          return !isNaN(n) && n >= 25 && n <= 45;
        },
        { message: t('onboarding.steps.step4.errors.heat_range') },
      ),
  });
}

type FormData = z.infer<ReturnType<typeof makeSchema>>;

export default function Step4Location() {
  const { t } = useTranslation();
  const router = useRouter();
  const { step4, setStep4 } = useOnboardingStore();
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const schema = useMemo(() => makeSchema(t), [t]);

  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      latitude: step4.latitude != null ? String(step4.latitude) : '',
      longitude: step4.longitude != null ? String(step4.longitude) : '',
      heat_stress_threshold_celsius: String(
        step4.heat_stress_threshold_celsius ?? 35.0,
      ),
    },
  });

  const handleGetLocation = async () => {
    setLocating(true);
    setLocationError('');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError(t('onboarding.steps.step4.permission_denied'));
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setValue('latitude', String(pos.coords.latitude.toFixed(6)));
      setValue('longitude', String(pos.coords.longitude.toFixed(6)));
    } catch {
      setLocationError(t('onboarding.steps.step4.location_failed'));
    } finally {
      setLocating(false);
    }
  };

  const onSubmit = (values: FormData) => {
    setStep4({
      latitude: values.latitude ? parseFloat(values.latitude) : null,
      longitude: values.longitude ? parseFloat(values.longitude) : null,
      heat_stress_threshold_celsius: parseFloat(
        values.heat_stress_threshold_celsius,
      ),
    });
    void syncOnboardingDraft(4);
    router.push('/(onboarding)/step-5-whatsapp-upi');
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
        <StepIndicator current={4} total={5} style={styles.stepIndicator} />

        <Text style={styles.heading}>{t('onboarding.step4_heading')}</Text>
        <Text style={styles.sub}>
          {t('onboarding.steps.step4.sub')}
        </Text>

        <View style={styles.fields}>
          <Button
            label={locating ? t('onboarding.steps.step4.locating') : t('onboarding.steps.step4.use_current')}
            variant="outlineDark"
            onPress={handleGetLocation}
            loading={locating}
            fullWidth
          />

          {!!locationError && (
            <Text style={styles.errorText}>{locationError}</Text>
          )}

          <Text style={styles.orLabel}>{t('onboarding.steps.step4.or_manually')}</Text>

          <Controller
            control={control}
            name="latitude"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('onboarding.steps.step4.latitude')}
                value={value ?? ''}
                onChangeText={onChange}
                keyboardType="decimal-pad"
                placeholder={t('onboarding.steps.step4.latitude_placeholder')}
                error={errors.latitude?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="longitude"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('onboarding.steps.step4.longitude')}
                value={value ?? ''}
                onChangeText={onChange}
                keyboardType="decimal-pad"
                placeholder={t('onboarding.steps.step4.longitude_placeholder')}
                error={errors.longitude?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="heat_stress_threshold_celsius"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('onboarding.steps.step4.heat_threshold')}
                value={value ?? ''}
                onChangeText={onChange}
                keyboardType="decimal-pad"
                placeholder={t('onboarding.steps.step4.heat_threshold_placeholder')}
                error={errors.heat_stress_threshold_celsius?.message}
              />
            )}
          />
          <Text style={styles.hint}>
            {t('onboarding.steps.step4.heat_hint')}
          </Text>
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
  orLabel: {
    ...typography.caption,
    color: colors.body,
    textAlign: 'center',
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
  hint: {
    ...typography.caption,
    color: colors.body,
    marginTop: -spacing.sm,
  },
  navRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing['3xl'],
  },
  backBtn: { flex: 1 },
  nextBtn: { flex: 2 },
});
