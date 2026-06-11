import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  History,
  Smartphone,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react-native';
import {
  getSecurityProfile,
  setTwoFactorMethod,
  getTotpFactor,
  isThisDeviceTrusted,
  trustThisDevice,
  revokeTrustedDevice,
  listTrustedDevices,
  type SecurityProfile,
  type TwoFactorMethod,
} from '../../auth/auth-service';
import { Card, RadioGroup, Toggle, Snackbar } from '../../components/ui';
import { colors, spacing, typography, radius } from '../../theme/tokens';

export default function SecuritySettingsScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  const [profile, setProfile] = useState<SecurityProfile | null>(null);
  const [method, setMethod] = useState<TwoFactorMethod>('disabled');
  const [totpEnrolled, setTotpEnrolled] = useState(false);
  const [deviceTrusted, setDeviceTrusted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, totp, trusted] = await Promise.all([
        getSecurityProfile(),
        getTotpFactor().catch(() => null),
        isThisDeviceTrusted().catch(() => false),
      ]);
      setProfile(p);
      setMethod(p?.two_factor_method ?? 'disabled');
      setTotpEnrolled(!!totp && totp.status === 'verified');
      setDeviceTrusted(trusted);
    } catch (e: any) {
      setSnackbar(e?.message ?? t('security.errors.load_failed'));
    }
  }, [t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onChangeMethod(next: string) {
    const value = next as TwoFactorMethod;
    // TOTP needs an authenticator enrolment first — route to the enrol screen.
    if (value === 'totp' && !totpEnrolled) {
      router.push('/security/two-factor');
      return;
    }
    setBusy(true);
    try {
      await setTwoFactorMethod(value);
      setMethod(value);
      setSnackbar(t('security.saved'));
    } catch (e: any) {
      setSnackbar(e?.message ?? t('security.errors.save_failed'));
    } finally {
      setBusy(false);
    }
  }

  async function onToggleTrust(value: boolean) {
    setBusy(true);
    try {
      if (value) {
        await trustThisDevice(30);
        setDeviceTrusted(true);
        setSnackbar(t('security.device.trusted_ok'));
      } else {
        const devices = await listTrustedDevices();
        // Best-effort: revoke any trusted row for this device.
        await Promise.all(devices.map((d) => revokeTrustedDevice(d.id).catch(() => {})));
        setDeviceTrusted(false);
        setSnackbar(t('security.device.revoked_ok'));
      }
    } catch (e: any) {
      setSnackbar(e?.message ?? t('security.errors.save_failed'));
    } finally {
      setBusy(false);
    }
  }

  const phoneVerified = !!profile?.phone_verified_at;
  const emailVerified = !!profile?.email_verified_at;

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('security.title') }} />
      <ScrollView contentContainerStyle={styles.content}>
        {/* Verification status */}
        <Card>
          <Text style={styles.sectionTitle}>{t('security.verification.title')}</Text>
          <VerifyRow label={t('security.verification.mobile')} ok={phoneVerified}
            okText={t('security.verification.verified')} pendingText={t('security.verification.unverified')} />
          <VerifyRow label={t('security.verification.email')} ok={emailVerified}
            okText={t('security.verification.verified')} pendingText={t('security.verification.email_pending')} />
        </Card>

        {/* Two-factor method */}
        <Card>
          <Text style={styles.sectionTitle}>{t('security.twofa.title')}</Text>
          <Text style={styles.muted}>{t('security.twofa.description')}</Text>
          <RadioGroup
            label=""
            value={method}
            onChange={onChangeMethod}
            options={[
              { value: 'disabled', label: t('security.twofa.option.disabled'), description: t('security.twofa.option.disabled_desc') },
              { value: 'sms', label: t('security.twofa.option.sms'), description: t('security.twofa.option.sms_desc') },
              { value: 'email', label: t('security.twofa.option.email'), description: t('security.twofa.option.email_desc') },
              {
                value: 'totp',
                label: t('security.twofa.option.totp') + (totpEnrolled ? ` · ${t('security.twofa.enrolled')}` : ''),
                description: t('security.twofa.option.totp_desc'),
              },
            ]}
          />
          {method !== 'totp' && (
            <Pressable onPress={() => router.push('/security/two-factor')} style={styles.inlineLink} hitSlop={8}>
              <Text style={styles.inlineLinkText}>
                {totpEnrolled ? t('security.twofa.manage_authenticator') : t('security.twofa.setup_authenticator')}
              </Text>
            </Pressable>
          )}
        </Card>

        {/* Remember this device */}
        <Card>
          <Toggle
            label={t('security.device.remember')}
            description={t('security.device.remember_desc')}
            value={deviceTrusted}
            onValueChange={onToggleTrust}
            disabled={busy}
          />
        </Card>

        {/* Links */}
        <Card style={styles.linksCard}>
          <NavRow icon={<History size={20} color={colors.ink} />} label={t('security.links.login_history')}
            onPress={() => router.push('/security/sessions')} />
          <View style={styles.divider} />
          <NavRow icon={<Smartphone size={20} color={colors.ink} />} label={t('security.links.trusted_devices')}
            onPress={() => router.push('/security/devices')} />
        </Card>
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>{snackbar ?? ''}</Snackbar>
    </View>
  );
}

function VerifyRow({ label, ok, okText, pendingText }: { label: string; ok: boolean; okText: string; pendingText: string }) {
  return (
    <View style={styles.verifyRow}>
      {ok
        ? <CheckCircle2 size={18} color={colors.success} />
        : <AlertCircle size={18} color={colors.warning} />}
      <Text style={styles.verifyLabel}>{label}</Text>
      <Text style={[styles.verifyStatus, { color: ok ? colors.successInk : colors.warning }]}>
        {ok ? okText : pendingText}
      </Text>
    </View>
  );
}

function NavRow({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.navRow} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.navIcon}>{icon}</View>
      <Text style={styles.navLabel}>{label}</Text>
      <ChevronRight size={20} color={colors.body} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  sectionTitle: { ...typography.bodyMdStrong, color: colors.ink, marginBottom: spacing.sm },
  muted: { ...typography.bodySm, color: colors.body, marginBottom: spacing.md },
  verifyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  verifyLabel: { ...typography.bodyMd, color: colors.ink, flex: 1 },
  verifyStatus: { ...typography.bodySmStrong },
  inlineLink: { marginTop: spacing.md, paddingVertical: spacing.xs },
  inlineLinkText: { ...typography.bodySmStrong, color: colors.primary },
  linksCard: { paddingVertical: spacing.xs },
  navRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md, minHeight: 44 },
  navIcon: {
    width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.canvasSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  navLabel: { ...typography.bodyMdStrong, color: colors.ink, flex: 1 },
  divider: { height: 1, backgroundColor: colors.mute },
});
