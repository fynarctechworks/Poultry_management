import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View, AccessibilityInfo } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Check, CircleAlert } from 'lucide-react-native';
import { useOnboardingStore } from '../../stores/onboarding';
import { useFarmStore } from '../../stores/farm';
import { completeOnboarding } from '../../lib/onboarding-sync';
import { track, FUNNEL } from '../../lib/analytics';
import { Button } from '../../components/ui';
import { colors, spacing, typography, radius } from '../../theme/tokens';

const MIN_ANIMATION_MS = 1800;
const STEP_KEYS = ['tenant', 'farm', 'trial', 'ready'] as const;

export default function CreatingWorkspace() {
  const { t } = useTranslation();
  const router = useRouter();
  const reset = useOnboardingStore((s) => s.reset);
  const setCurrentFarm = useFarmStore((s) => s.setCurrentFarm);

  const [error, setError] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState(0);
  const ranRef = useRef(false);

  async function run() {
    setError(null);
    setActiveStep(0);
    const startedAt = Date.now();

    // Staggered checklist tick — purely visual, capped so it never outlasts
    // the real work by much on a slow connection.
    const ticker = setInterval(() => {
      setActiveStep((s) => Math.min(s + 1, STEP_KEYS.length - 1));
    }, MIN_ANIMATION_MS / STEP_KEYS.length);

    try {
      const result = await completeOnboarding();
      // Enforce a minimum on-screen time so the animation doesn't flash.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_ANIMATION_MS) {
        await new Promise((r) => setTimeout(r, MIN_ANIMATION_MS - elapsed));
      }
      clearInterval(ticker);
      setActiveStep(STEP_KEYS.length);
      void track(FUNNEL.ONBOARDING_COMPLETED, { tenant_id: result.tenant_id });
      setCurrentFarm(result.farm);
      reset();
      router.replace('/setup/sheds');
    } catch (e: any) {
      clearInterval(ticker);
      setError(e?.message ?? t('onboarding.creating.error_generic'));
    }
  }

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;
    run();
  }, []);

  if (error) {
    return (
      <View style={styles.root}>
        <View style={[styles.iconCircle, styles.iconError]}>
          <CircleAlert size={36} color={colors.danger} />
        </View>
        <Text style={styles.heading}>{t('onboarding.creating.error_title')}</Text>
        <Text style={styles.sub}>{error}</Text>
        <Button
          label={t('onboarding.creating.retry')}
          variant="primary"
          onPress={() => { ranRef.current = true; run(); }}
          fullWidth
          style={styles.retryBtn}
        />
        <Button
          label={t('onboarding.creating.go_back')}
          variant="outlineDark"
          onPress={() => router.back()}
          fullWidth
          style={styles.backBtn}
        />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <View style={styles.iconCircle}>
        {activeStep >= STEP_KEYS.length
          ? <Check size={36} color={colors.onPrimary} />
          : <ActivityIndicator size="large" color={colors.onPrimary} />}
      </View>
      <Text style={styles.heading}>{t('onboarding.creating.title')}</Text>
      <Text style={styles.sub}>{t('onboarding.creating.sub')}</Text>

      <View style={styles.checklist}>
        {STEP_KEYS.map((key, idx) => (
          <ChecklistRow
            key={key}
            label={t(`onboarding.creating.steps.${key}`)}
            done={activeStep > idx}
            active={activeStep === idx}
          />
        ))}
      </View>
    </View>
  );
}

function ChecklistRow({ label, done, active }: { label: string; done: boolean; active: boolean }) {
  const opacity = useRef(new Animated.Value(done || active ? 1 : 0.4)).current;

  useEffect(() => {
    let reduced = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduced = v;
      const target = done || active ? 1 : 0.4;
      if (reduced) { opacity.setValue(target); return; }
      Animated.timing(opacity, {
        toValue: target,
        duration: 220,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }).start();
    });
  }, [done, active]);

  return (
    <Animated.View style={[styles.row, { opacity }]}>
      <View style={[styles.tick, done && styles.tickDone]}>
        {done ? <Check size={14} color={colors.onPrimary} /> : null}
      </View>
      <Text style={[styles.rowLabel, done && styles.rowLabelDone]}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  iconCircle: {
    width: 80, height: 80, borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.xl,
  },
  iconError: { backgroundColor: colors.warningSoft },
  heading: { ...typography.displayMd, color: colors.ink, textAlign: 'center', marginBottom: spacing.sm },
  sub: { ...typography.bodyMd, color: colors.body, textAlign: 'center', marginBottom: spacing['2xl'] },
  checklist: { alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tick: {
    width: 22, height: 22, borderRadius: radius.full,
    borderWidth: 2, borderColor: colors.mute,
    alignItems: 'center', justifyContent: 'center',
  },
  tickDone: { backgroundColor: colors.success, borderColor: colors.success },
  rowLabel: { ...typography.bodyMd, color: colors.body },
  rowLabelDone: { ...typography.bodyMdStrong, color: colors.ink },
  retryBtn: { marginTop: spacing.xl },
  backBtn: { marginTop: spacing.md },
});
