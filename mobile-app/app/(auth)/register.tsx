import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { register, sendOtp, isValidIndianMobile, toE164 } from '../../auth/auth-service';
import { track, FUNNEL } from '../../lib/analytics';
import { TextInput, Button, InlineError } from '../../components/ui';
import { colors, spacing, typography, fonts } from '../../theme/tokens';

function makeSchema(t: TFunction) {
  return z.object({
    fullName: z.string().min(2, t('auth.register.errors.name_required')),
    phone: z.string().refine(isValidIndianMobile, t('auth.register.errors.phone_invalid')),
    email: z.string().email(t('auth.register.errors.email_invalid')),
    password: z.string().min(6, t('auth.register.errors.password_min')),
  });
}

type FormData = z.infer<ReturnType<typeof makeSchema>>;

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [serverError, setServerError] = useState('');
  const schema = useMemo(() => makeSchema(t), [t]);

  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', phone: '', email: '', password: '' },
  });

  const onSubmit = async (values: FormData) => {
    setServerError('');
    const e164 = toE164(values.phone);
    try {
      // 1. Create the account (handle_new_user trigger writes the profile row).
      await register({
        email: values.email,
        password: values.password,
        fullName: values.fullName,
        phone: e164,
      });
      void track(FUNNEL.SIGNUP_STARTED, { method: 'email' });
      // 2. Mandatory mobile verification — send an OTP and route to verify.
      //    shouldCreateUser=false: the account already exists from step 1.
      await sendOtp(e164, false);
      router.push({ pathname: '/(auth)/verify-otp', params: { phone: e164 } });
    } catch (e: any) {
      // If SMS isn't wired yet, the account is still created — the email/
      // password the user just set works on the login screen. Guide them there.
      if (e?.message?.toLowerCase?.().includes('unconfigured') || e?.status === 501) {
        setServerError(t('auth.register.sms_unconfigured'));
      } else {
        setServerError(e?.message ?? t('auth.register.register_failed'));
      }
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.heading}>{t('auth.register.heading')}</Text>
        <Text style={styles.sub}>{t('auth.register.sub')}</Text>

        <View style={styles.fields}>
          <Controller
            control={control}
            name="fullName"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('auth.register.full_name')}
                value={value ?? ''}
                onChangeText={onChange}
                autoCapitalize="words"
                autoComplete="name"
                error={errors.fullName?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="phone"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('auth.register.mobile')}
                value={value ?? ''}
                // India (+91) is the only supported country here (MSG91 OTP) —
                // restrict to 10 numeric digits as the user types.
                onChangeText={(text) => onChange(text.replace(/\D/g, '').slice(0, 10))}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder={t('auth.register.mobile_placeholder')}
                error={errors.phone?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('auth.register.email')}
                value={value ?? ''}
                onChangeText={onChange}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                placeholder={t('auth.register.email_placeholder')}
                error={errors.email?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('auth.register.password')}
                value={value ?? ''}
                onChangeText={onChange}
                secureTextEntry
                placeholder={t('auth.register.password_placeholder')}
                error={errors.password?.message}
              />
            )}
          />
        </View>

        <Text style={styles.verifyHint}>{t('auth.register.verify_hint')}</Text>

        {serverError ? <InlineError style={styles.serverError}>{serverError}</InlineError> : null}

        <Button
          variant="primary"
          label={t('auth.register.create_account')}
          onPress={handleSubmit(onSubmit)}
          loading={isSubmitting}
          disabled={isSubmitting}
          fullWidth
          style={styles.button}
        />

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.register.have_account')}</Text>
          <Link href="/(auth)/login" style={styles.link}>{t('auth.register.sign_in')}</Link>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing['3xl'] },
  heading: { ...typography.displayLg, color: colors.ink, marginBottom: spacing.xs },
  sub: { ...typography.bodyMd, color: colors.body, marginBottom: spacing['3xl'] },
  fields: { gap: spacing.lg, marginBottom: spacing.md },
  verifyHint: { ...typography.bodySm, color: colors.bodySoft, marginBottom: spacing.sm },
  serverError: { marginBottom: spacing.sm },
  button: { marginTop: spacing.sm },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing['2xl'] },
  footerText: { ...typography.bodyMd, color: colors.body },
  link: { color: colors.primary, fontSize: typography.caption.fontSize, fontWeight: '500', fontFamily: fonts.medium },
});
