import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { Check } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { Card } from '../../components/ui';
import { setLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from '../../lib/i18n';
import { colors, radius, spacing, typography } from '../../theme/tokens';

interface LanguageOption {
  code: SupportedLanguage;
  /** Native-language label so the option is recognisable to that language's speakers */
  nativeLabel: string;
  /** Latin transliteration / English name for cross-language clarity */
  romanLabel: string;
}

const OPTIONS: LanguageOption[] = [
  { code: 'en', nativeLabel: 'English',  romanLabel: 'English' },
  { code: 'hi', nativeLabel: 'हिंदी',     romanLabel: 'Hindi'   },
  { code: 'te', nativeLabel: 'తెలుగు',   romanLabel: 'Telugu'  },
  { code: 'ta', nativeLabel: 'தமிழ்',    romanLabel: 'Tamil'   },
];

export default function LanguageScreen() {
  const { t, i18n } = useTranslation();
  const [snackbar, setSnackbar] = useState<string | null>(null);
  const current = (i18n.language as SupportedLanguage) ?? 'en';

  async function handlePick(code: SupportedLanguage) {
    try {
      await setLanguage(code);
      setSnackbar(t('settings.saved'));
    } catch {
      setSnackbar(t('common.error'));
    }
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('language.label') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={styles.intro}>{t('language.description')}</Text>
          {OPTIONS.map((opt, idx) => {
            const selected = opt.code === current;
            const isSupported = (
              SUPPORTED_LANGUAGES as ReadonlyArray<string>
            ).includes(opt.code);
            return (
              <Pressable
                key={opt.code}
                onPress={() => handlePick(opt.code)}
                disabled={!isSupported}
                accessibilityRole="radio"
                accessibilityLabel={opt.romanLabel}
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.row,
                  idx === 0 && styles.firstRow,
                  pressed && styles.rowPressed,
                ]}
              >
                <View style={styles.textCol}>
                  <Text style={styles.nativeLabel}>{opt.nativeLabel}</Text>
                  <Text style={styles.romanLabel}>{opt.romanLabel}</Text>
                </View>
                {selected ? (
                  <View style={styles.checkPill}>
                    <Check size={16} color={colors.onPrimary} />
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </Card>
      </ScrollView>

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  intro: {
    ...typography.bodySm,
    color: colors.body,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.mute,
    minHeight: 44,
  },
  firstRow: { borderTopWidth: 0 },
  rowPressed: { opacity: 0.7 },
  textCol: { flex: 1, gap: spacing.xxs },
  nativeLabel: {
    ...typography.bodyMdStrong,
    color: colors.ink,
  },
  romanLabel: {
    ...typography.caption,
    color: colors.body,
  },
  checkPill: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
