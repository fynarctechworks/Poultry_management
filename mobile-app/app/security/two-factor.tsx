import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable, ActivityIndicator } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { OtpInput } from 'react-native-otp-entry';
import QRCode from 'react-native-qrcode-svg';
import {
  enrollTotp,
  verifyTotpEnrollment,
  unenrollTotp,
  getTotpFactor,
  setTwoFactorMethod,
} from '../../auth/auth-service';
import { Card, Button, InlineError, Snackbar } from '../../components/ui';
import { colors, spacing, typography, radius } from '../../theme/tokens';

interface EnrollData {
  factorId: string;
  uri: string;
  secret: string;
}

export default function TwoFactorScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [alreadyEnrolled, setAlreadyEnrolled] = useState(false);
  const [enroll, setEnroll] = useState<EnrollData | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const init = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const existing = await getTotpFactor();
      if (existing && existing.status === 'verified') {
        setAlreadyEnrolled(true);
        setEnroll({ factorId: existing.id, uri: '', secret: '' });
        return;
      }
      // Clean up any half-finished unverified factor before re-enrolling.
      if (existing && existing.status !== 'verified') {
        await unenrollTotp(existing.id).catch(() => {});
      }
      const data = await enrollTotp();
      setAlreadyEnrolled(false);
      setEnroll({ factorId: data.id, uri: data.totp.uri, secret: data.totp.secret });
    } catch (e: any) {
      setError(e?.message ?? t('security.twofa_enrol.errors.start_failed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { init(); }, [init]));

  async function onVerify(value?: string) {
    if (!enroll) return;
    const candidate = (value ?? code).trim();
    setError('');
    if (candidate.length !== 6) {
      setError(t('security.twofa_enrol.errors.code_invalid'));
      return;
    }
    setBusy(true);
    try {
      await verifyTotpEnrollment(enroll.factorId, candidate);
      setSnackbar(t('security.twofa_enrol.enabled_ok'));
      setTimeout(() => router.back(), 600);
    } catch (e: any) {
      setError(e?.message ?? t('security.twofa_enrol.errors.verify_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function onDisable() {
    if (!enroll) return;
    setBusy(true);
    try {
      await unenrollTotp(enroll.factorId);
      await setTwoFactorMethod('disabled').catch(() => {});
      setSnackbar(t('security.twofa_enrol.disabled_ok'));
      setTimeout(() => router.back(), 600);
    } catch (e: any) {
      setSnackbar(e?.message ?? t('security.twofa_enrol.errors.disable_failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('security.twofa_enrol.title') }} />
      <ScrollView contentContainerStyle={styles.content}>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
        ) : alreadyEnrolled ? (
          <Card>
            <Text style={styles.heading}>{t('security.twofa_enrol.active_title')}</Text>
            <Text style={styles.muted}>{t('security.twofa_enrol.active_desc')}</Text>
            <Button
              variant="outlineDark"
              label={t('security.twofa_enrol.disable')}
              onPress={onDisable}
              loading={busy}
              disabled={busy}
              fullWidth
              style={styles.button}
            />
          </Card>
        ) : enroll ? (
          <>
            <Card>
              <Text style={styles.heading}>{t('security.twofa_enrol.scan_title')}</Text>
              <Text style={styles.muted}>{t('security.twofa_enrol.scan_desc')}</Text>
              <View style={styles.qrWrap}>
                {enroll.uri ? <QRCode value={enroll.uri} size={200} /> : null}
              </View>
              <Text style={styles.secretLabel}>{t('security.twofa_enrol.manual_key')}</Text>
              <Text selectable style={styles.secret}>{enroll.secret}</Text>
            </Card>

            <Card>
              <Text style={styles.heading}>{t('security.twofa_enrol.enter_code')}</Text>
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
                label={t('security.twofa_enrol.verify_enable')}
                onPress={() => onVerify()}
                loading={busy}
                disabled={busy}
                fullWidth
                style={styles.button}
              />
            </Card>
          </>
        ) : (
          <Card>
            {error ? <InlineError>{error}</InlineError> : null}
            <Pressable onPress={init} style={styles.retry}><Text style={styles.retryText}>{t('common.retry')}</Text></Pressable>
          </Card>
        )}
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>{snackbar ?? ''}</Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  center: { paddingVertical: spacing['3xl'], alignItems: 'center' },
  heading: { ...typography.bodyMdStrong, color: colors.ink, marginBottom: spacing.xs },
  muted: { ...typography.bodySm, color: colors.body, marginBottom: spacing.md },
  qrWrap: { alignItems: 'center', paddingVertical: spacing.lg },
  secretLabel: { ...typography.captionStrong, color: colors.body, marginTop: spacing.sm },
  secret: { ...typography.bodyMdStrong, color: colors.ink, letterSpacing: 1, marginTop: spacing.xxs },
  otpWrap: { marginBottom: spacing.md },
  otpCell: { width: 44, height: 52, borderRadius: radius.md, borderColor: colors.mute, borderWidth: 1, backgroundColor: colors.canvas },
  otpCellFocused: { borderColor: colors.primary, borderWidth: 2 },
  otpText: { ...typography.displaySm, color: colors.ink },
  error: { marginBottom: spacing.sm },
  button: { marginTop: spacing.sm },
  retry: { paddingVertical: spacing.sm },
  retryText: { ...typography.bodySmStrong, color: colors.primary },
});
