import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View, Pressable } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Smartphone, Trash2 } from 'lucide-react-native';
import {
  listTrustedDevices,
  revokeTrustedDevice,
  isThisDeviceTrusted,
  type TrustedDevice,
} from '../../auth/auth-service';
import { getDeviceHash } from '../../lib/device';
import { Card, EmptyState, Skeleton, Snackbar } from '../../components/ui';
import { colors, spacing, typography, radius } from '../../theme/tokens';
import { formatDDMMMYYYY } from '../../lib/format-date';

export default function DevicesScreen() {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<TrustedDevice[] | null>(null);
  const [thisHash, setThisHash] = useState<string>('');
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [rows, hash] = await Promise.all([listTrustedDevices(), getDeviceHash()]);
      setDevices(rows);
      setThisHash(hash);
    } catch {
      setDevices([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function onRevoke(id: string) {
    try {
      await revokeTrustedDevice(id);
      setDevices((prev) => prev?.filter((d) => d.id !== id) ?? null);
      setSnackbar(t('security.device.revoked_ok'));
    } catch (e: any) {
      setSnackbar(e?.message ?? t('security.errors.save_failed'));
    }
  }

  if (devices === null) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: t('security.devices.title') }} />
        <View style={styles.content}><Skeleton height={72} /><Skeleton height={72} /></View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('security.devices.title') }} />
      <FlatList
        data={devices}
        keyExtractor={(d) => d.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={<Text style={styles.intro}>{t('security.devices.intro')}</Text>}
        ListEmptyComponent={
          <EmptyState
            title={t('security.devices.empty.title')}
            description={t('security.devices.empty.description')}
          />
        }
        renderItem={({ item }) => {
          const isCurrent = item.device_hash === thisHash;
          return (
            <Card style={styles.row}>
              <View style={styles.iconWrap}><Smartphone size={20} color={colors.ink} /></View>
              <View style={styles.textCol}>
                <Text style={styles.name}>
                  {item.device_name ?? t('security.devices.unknown')}
                  {isCurrent ? `  ·  ${t('security.devices.this_device')}` : ''}
                </Text>
                <Text style={styles.meta}>{t('security.devices.trusted_until', { date: formatDDMMMYYYY(item.trusted_until) })}</Text>
                {!!item.last_ip && <Text style={styles.metaSoft}>{item.last_ip}</Text>}
              </View>
              <Pressable
                onPress={() => onRevoke(item.id)}
                hitSlop={8}
                style={styles.revoke}
                accessibilityRole="button"
                accessibilityLabel={t('security.devices.revoke')}
              >
                <Trash2 size={18} color={colors.danger} />
              </Pressable>
            </Card>
          );
        }}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>{snackbar ?? ''}</Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing['3xl'] },
  intro: { ...typography.bodySm, color: colors.body, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: {
    width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.canvasSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  textCol: { flex: 1, gap: spacing.xxs },
  name: { ...typography.bodyMdStrong, color: colors.ink },
  meta: { ...typography.bodySm, color: colors.body },
  metaSoft: { ...typography.caption, color: colors.bodySoft },
  revoke: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
