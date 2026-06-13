import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { Link, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useForm, Controller } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { login, sendOtp, isValidIndianMobile, toE164 } from '../../auth/auth-service';
import { TextInput, Button, InlineError } from '../../components/ui';
import { colors, spacing, typography, fonts } from '../../theme/tokens';

type Mode = 'mobile' | 'email';

function makeEmailSchema(t: TFunction) {
  return z.object({
    email: z.string().email(t('auth.login.errors.email_invalid')),
    password: z.string().min(6, t('auth.login.errors.password_min')),
  });
}
type EmailForm = z.infer<ReturnType<typeof makeEmailSchema>>;

export default function LoginScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('mobile');
  const [serverError, setServerError] = useState('');

  // ── Mobile / OTP ──
  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [sending, setSending] = useState(false);

  async function onSendOtp() {
    setServerError('');
    setPhoneError('');
    if (!isValidIndianMobile(phone)) {
      setPhoneError(t('auth.otp.errors.mobile_invalid'));
      return;
    }
    setSending(true);
    try {
      const e164 = toE164(phone);
      await sendOtp(e164, true);
      router.push({ pathname: '/(auth)/verify-otp', params: { phone: e164 } });
    } catch (e: any) {
      // MSG91 hook not configured yet → guide the user to the email fallback.
      if (e?.message?.toLowerCase?.().includes('unconfigured') || e?.status === 501) {
        setServerError(t('auth.otp.errors.sms_unconfigured'));
        setMode('email');
      } else {
        setServerError(e?.message ?? t('auth.otp.errors.send_failed'));
      }
    } finally {
      setSending(false);
    }
  }

  // ── Email / password ──
  const schema = useMemo(() => makeEmailSchema(t), [t]);
  const { control, handleSubmit, formState: { errors, isSubmitting } } = useForm<EmailForm>({
    resolver: zodResolver(schema),
  });

  const onSubmitEmail = async (values: EmailForm) => {
    setServerError('');
    try {
      await login(values.email, values.password);
      // _layout.tsx onAuthStateChange drives the redirect
    } catch (e: any) {
      setServerError(e?.message ?? t('auth.login.login_failed'));
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {mode === 'mobile' ? (
          <>
            <Text style={styles.heading}>{t('auth.otp.heading')}</Text>
            <Text style={styles.sub}>{t('auth.otp.sub')}</Text>

            <View style={styles.fields}>
              <TextInput
                label={t('auth.otp.mobile')}
                value={phone}
                onChangeText={(v) => { setPhone(v); setPhoneError(''); }}
                keyboardType="phone-pad"
                autoComplete="tel"
                placeholder={t('auth.otp.mobile_placeholder')}
                error={phoneError}
              />
            </View>

            {serverError ? <InlineError style={styles.serverError}>{serverError}</InlineError> : null}

            <Button
              variant="primary"
              label={t('auth.otp.send_otp')}
              onPress={onSendOtp}
              loading={sending}
              disabled={sending}
              fullWidth
              style={styles.button}
            />

            <Pressable onPress={() => { setMode('email'); setServerError(''); }} style={styles.switchBtn}>
              <Text style={styles.switchText}>{t('auth.otp.use_email')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.heading}>{t('auth.login.heading')}</Text>
            <Text style={styles.sub}>{t('auth.login.sub')}</Text>

            <View style={styles.fields}>
              <Controller
                control={control}
                name="email"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    label={t('auth.login.email')}
                    value={value ?? ''}
                    onChangeText={onChange}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoComplete="email"
                    placeholder={t('auth.login.email_placeholder')}
                    error={errors.email?.message}
                  />
                )}
              />
              <Controller
                control={control}
                name="password"
                render={({ field: { onChange, value } }) => (
                  <TextInput
                    label={t('auth.login.password')}
                    value={value ?? ''}
                    onChangeText={onChange}
                    secureTextEntry
                    placeholder={t('auth.login.password_placeholder')}
                    error={errors.password?.message}
                  />
                )}
              />
            </View>

            {serverError ? <InlineError style={styles.serverError}>{serverError}</InlineError> : null}

            <Button
              variant="primary"
              label={t('auth.login.sign_in')}
              onPress={handleSubmit(onSubmitEmail)}
              loading={isSubmitting}
              disabled={isSubmitting}
              fullWidth
              style={styles.button}
            />

            <Pressable onPress={() => { setMode('mobile'); setServerError(''); }} style={styles.switchBtn}>
              <Text style={styles.switchText}>{t('auth.otp.use_mobile')}</Text>
            </Pressable>
          </>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerText}>{t('auth.login.no_account')}</Text>
          <Link href="/(auth)/register" style={styles.link}>{t('auth.login.create_account')}</Link>
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
  serverError: { marginBottom: spacing.sm },
  button: { marginTop: spacing.sm },
  switchBtn: { alignSelf: 'center', marginTop: spacing.lg, paddingVertical: spacing.sm },
  switchText: { ...typography.bodySmStrong, color: colors.primary },
  footer: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing['2xl'] },
  footerText: { ...typography.bodyMd, color: colors.body },
  link: { color: colors.primary, fontSize: typography.caption.fontSize, fontWeight: '500', fontFamily: fonts.medium },
});
