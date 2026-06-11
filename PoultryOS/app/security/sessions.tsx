import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { LogIn, LogOut, ShieldCheck, ShieldAlert, KeyRound, Smartphone } from 'lucide-react-native';
import { listAuthAuditEvents, type AuthAuditEvent } from '../../auth/auth-service';
import { Card, EmptyState, Skeleton } from '../../components/ui';
import { colors, spacing, typography, radius } from '../../theme/tokens';
import { formatDDMMMYYYY } from '../../lib/format-date';

function iconFor(eventType: string) {
  if (eventType.includes('login')) return <LogIn size={18} color={colors.ink} />;
  if (eventType === 'logout') return <LogOut size={18} color={colors.body} />;
  if (eventType.startsWith('2fa')) return <ShieldCheck size={18} color={colors.success} />;
  if (eventType.includes('failed') || eventType.includes('revoked')) return <ShieldAlert size={18} color={colors.danger} />;
  if (eventType.includes('device')) return <Smartphone size={18} color={colors.ink} />;
  return <KeyRound size={18} color={colors.ink} />;
}

function whenLabel(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  return `${formatDDMMMYYYY(iso)} · ${time}`;
}

export default function SessionsScreen() {
  const { t } = useTranslation();
  const [events, setEvents] = useState<AuthAuditEvent[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await listAuthAuditEvents(50);
      setEvents(rows);
    } catch {
      setEvents([]);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  if (events === null) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: t('security.sessions.title') }} />
        <View style={styles.content}><Skeleton height={64} /><Skeleton height={64} /><Skeleton height={64} /></View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('security.sessions.title') }} />
      <FlatList
        data={events}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        ListHeaderComponent={<Text style={styles.intro}>{t('security.sessions.intro')}</Text>}
        ListEmptyComponent={
          <EmptyState
            title={t('security.sessions.empty.title')}
            description={t('security.sessions.empty.description')}
          />
        }
        renderItem={({ item }) => (
          <Card style={styles.row}>
            <View style={styles.iconWrap}>{iconFor(item.event_type)}</View>
            <View style={styles.textCol}>
              <Text style={styles.eventLabel}>{t(`security.event.${item.event_type}`, item.event_type.replace(/_/g, ' '))}</Text>
              <Text style={styles.meta}>{whenLabel(item.created_at)}</Text>
              {!!item.ip_address && <Text style={styles.metaSoft}>{t('security.sessions.ip', { ip: item.ip_address })}</Text>}
            </View>
          </Card>
        )}
      />
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
  eventLabel: { ...typography.bodyMdStrong, color: colors.ink, textTransform: 'capitalize' },
  meta: { ...typography.bodySm, color: colors.body },
  metaSoft: { ...typography.caption, color: colors.bodySoft },
});
