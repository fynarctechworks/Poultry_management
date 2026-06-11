import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import {
  ChevronRight,
  Receipt,
  Pill,
  Syringe,
  Package,
  TrendingUp,
  FileSignature,
  Settings as SettingsIcon,
  ShieldCheck,
  CreditCard,
  LayoutGrid,
  Bell,
  MessageCircle,
  CloudSun,
  FileBarChart2,
  Languages,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { useFarmStore } from '../../stores/farm';
import { colors, radius, spacing, typography } from '../../theme/tokens';

type MoreItem = {
  label: string;
  description: string;
  icon: React.ReactNode;
  href: string;
};

export default function MoreScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const isContractFarm = currentFarm?.farm_type === 'contract';

  const items: MoreItem[] = [
    {
      label: t('more.transactions.label'),
      description: t('more.transactions.description'),
      icon: <Receipt size={20} color={colors.ink} />,
      href: '/transactions',
    },
    {
      label: t('more.market_prices.label'),
      description: t('more.market_prices.description'),
      icon: <TrendingUp size={20} color={colors.ink} />,
      href: '/market-prices',
    },
    {
      label: t('more.weather.label'),
      description: t('more.weather.description'),
      icon: <CloudSun size={20} color={colors.ink} />,
      href: '/weather',
    },
    {
      label: t('more.reports.label'),
      description: t('more.reports.description'),
      icon: <FileBarChart2 size={20} color={colors.ink} />,
      href: '/reports',
    },
    {
      label: t('more.health.label'),
      description: t('more.health.description'),
      icon: <Pill size={20} color={colors.ink} />,
      href: '/health',
    },
    {
      label: t('more.vaccinations.label'),
      description: t('more.vaccinations.description'),
      icon: <Syringe size={20} color={colors.ink} />,
      href: '/vaccinations',
    },
    {
      label: t('more.inventory.label'),
      description: t('more.inventory.description'),
      icon: <Package size={20} color={colors.ink} />,
      href: '/inventory',
    },
    ...(isContractFarm
      ? [
          {
            label: t('more.contract.label'),
            description: t('more.contract.description'),
            icon: <FileSignature size={20} color={colors.ink} />,
            href: '/contract',
          } as MoreItem,
        ]
      : []),
    {
      label: t('more.settings.label'),
      description: t('more.settings.description'),
      icon: <SettingsIcon size={20} color={colors.ink} />,
      href: '/settings',
    },
    {
      label: t('more.security.label'),
      description: t('more.security.description'),
      icon: <ShieldCheck size={20} color={colors.ink} />,
      href: '/security',
    },
    {
      label: t('more.billing.label'),
      description: t('more.billing.description'),
      icon: <CreditCard size={20} color={colors.ink} />,
      href: '/billing',
    },
    {
      label: t('more.multi_farm.label'),
      description: t('more.multi_farm.description'),
      icon: <LayoutGrid size={20} color={colors.ink} />,
      href: '/multi-farm',
    },
    {
      label: t('more.notifications.label'),
      description: t('more.notifications.description'),
      icon: <Bell size={20} color={colors.ink} />,
      href: '/notifications',
    },
    {
      label: t('more.whatsapp_settings.label'),
      description: t('more.whatsapp_settings.description'),
      icon: <MessageCircle size={20} color={colors.ink} />,
      href: '/whatsapp-settings',
    },
    {
      label: t('more.language.label'),
      description: t('more.language.description'),
      icon: <Languages size={20} color={colors.ink} />,
      href: '/language',
    },
  ];

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('more.title') }} />
      <ScrollView contentContainerStyle={styles.content}>
        {items.map((item) => (
          <Pressable
            key={item.href}
            onPress={() => router.push(item.href as any)}
            style={styles.row}
            accessibilityRole="button"
            accessibilityLabel={item.label}
          >
            <View style={styles.iconWrap}>{item.icon}</View>
            <View style={styles.textCol}>
              <Text style={styles.label}>{item.label}</Text>
              <Text style={styles.description}>{item.description}</Text>
            </View>
            <ChevronRight size={20} color={colors.body} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.canvas,
    borderColor: colors.mute,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.canvasSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: {
    flex: 1,
    gap: spacing.xxs,
  },
  label: {
    ...typography.bodyMdStrong,
    color: colors.ink,
  },
  description: {
    ...typography.bodySm,
    color: colors.body,
  },
});
