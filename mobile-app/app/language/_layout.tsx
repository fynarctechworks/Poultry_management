import { Stack } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { colors } from '../../theme/tokens';
import { HeaderBackButton } from '../../components/ui/HeaderBackButton';

export default function LanguageLayout() {
  const { t } = useTranslation();
  return (
    <Stack
      screenOptions={{
        headerTintColor: colors.ink,
        headerStyle: { backgroundColor: colors.canvas },
        headerShadowVisible: false,
        headerLeft: () => <HeaderBackButton />,
      }}
    >
      <Stack.Screen name="index" options={{ title: t('language.label') }} />
    </Stack>
  );
}
