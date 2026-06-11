import { Tabs } from 'expo-router';
import { Home, Bird, ClipboardList, Wallet, MoreHorizontal } from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { colors } from '../../theme/tokens';

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.body,
        tabBarStyle: {
          backgroundColor: colors.canvas,
          borderTopColor: colors.mute,
        },
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="dashboard"
        options={{
          title: t('tabs.dashboard'),
          tabBarIcon: ({ color }) => <Home size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="flocks"
        options={{
          title: t('tabs.flocks'),
          tabBarIcon: ({ color }) => <Bird size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          title: t('tabs.log'),
          tabBarIcon: ({ color }) => <ClipboardList size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="khata"
        options={{
          title: t('tabs.khata'),
          tabBarIcon: ({ color }) => <Wallet size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('tabs.more'),
          tabBarIcon: ({ color }) => <MoreHorizontal size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}
