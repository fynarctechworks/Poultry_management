import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OtpInput } from 'react-native-otp-entry';
import { sendOtp, verifyOtp } from '../../auth/auth-service';
import { Button, InlineError } from '../../components/ui';
import { colors, spacing, typography, radius, fonts } from '../../theme/tokens';

const RESEND_SECONDS = 30;

export default function VerifyOtpScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1 && timerRef.current) clearInterval(timerRef.current);
        return s - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  async function onVerify(value?: string) {
    const candidate = (value ?? code).trim();
    setError('');
    if (candidate.length !== 6) {
      setError(t('auth.otp.errors.code_invalid'));
      return;
    }
    setVerifying(true);
    try {
      await verifyOtp(String(phone), candidate);
      // _layout.tsx onAuthStateChange drives the redirect to onboarding/dashboard
    } catch (e: any) {
      setError(e?.message ?? t('auth.otp.errors.verify_failed'));
    } finally {
      setVerifying(false);
    }
  }

  async function onResend() {
    if (secondsLeft > 0) return;
    setError('');
    try {
      await sendOtp(String(phone), true);
      setSecondsLeft(RESEND_SECONDS);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1 && timerRef.current) clearInterval(timerRef.current);
          return s - 1;
        });
      }, 1000);
    } catch (e: any) {
      setError(e?.message ?? t('auth.otp.errors.send_failed'));
    }
  }

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {/* Atmospheric orb — decorative, cheap plain View */}
        <View style={styles.orbContainer} pointerEvents="none">
          <View style={[styles.orb, styles.orbLavender]} />
        </View>

        <Text style={styles.heading}>{t('auth.otp.verify_heading')}</Text>
        <Text style={styles.sub}>{t('auth.otp.verify_sub', { phone })}</Text>

        <View style={styles.otpWrap}>
          <OtpInput
            numberOfDigits={6}
            onTextChange={setCode}
            onFilled={(v) => onVerify(v)}
            focusColor={colors.primary}
            theme={{
              pinCodeContainerStyle: styles.otpCell,
              pinCodeTextStyle: styles.otpText,
              focusedPinCodeContainerStyle: styles.otpCellFocused,
            }}
          />
        </View>

        {error ? <InlineError style={styles.error}>{error}</InlineError> : null}

        <Button
          variant="primary"
          label={t('auth.otp.verify')}
          onPress={() => onVerify()}
          loading={verifying}
          disabled={verifying}
          fullWidth
          style={styles.button}
        />

        <View style={styles.resendRow}>
          {secondsLeft > 0 ? (
            <Text style={styles.resendMuted}>{t('auth.otp.resend_in', { seconds: secondsLeft })}</Text>
          ) : (
            <Pressable onPress={onResend} hitSlop={8}>
              <Text style={styles.resendActive}>{t('auth.otp.resend')}</Text>
            </Pressable>
          )}
        </View>

        <Pressable onPress={() => router.back()} style={styles.changeBtn} hitSlop={8}>
          <Text style={styles.changeText}>{t('auth.otp.change_number')}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.xxl, paddingBottom: spacing['3xl'] },
  orbContainer: { position: 'absolute', top: 0, left: 0, right: 0, height: 280, overflow: 'hidden' },
  orb: { position: 'absolute', borderRadius: radius.full, opacity: 0.16 },
  orbLavender: { width: 280, height: 280, top: -100, right: -60, backgroundColor: colors.gradientLavender },
  heading: { ...typography.displayXl, color: colors.ink, marginBottom: spacing.sm },
  sub: { ...typography.bodyMd, color: colors.body, marginBottom: spacing['2xl'] },
  otpWrap: { marginBottom: spacing.lg },
  otpCell: {
    width: 48, height: 56, borderRadius: radius.md,
    borderColor: colors.mute, borderWidth: 1, backgroundColor: colors.canvas,
  },
  otpCellFocused: { borderColor: colors.primary, borderWidth: 2 },
  otpText: { ...typography.displaySm, color: colors.ink },
  error: { marginBottom: spacing.sm },
  button: { marginTop: spacing.sm },
  resendRow: { alignItems: 'center', marginTop: spacing.lg },
  resendMuted: { ...typography.bodySm, color: colors.bodySoft },
  resendActive: { ...typography.bodySmStrong, color: colors.primary },
  changeBtn: { alignSelf: 'center', marginTop: spacing.lg, paddingVertical: spacing.sm },
  changeText: { ...typography.bodySm, color: colors.body },
});
