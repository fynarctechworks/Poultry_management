import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Flame,
  MessageSquare,
  Package,
  Receipt,
  Syringe,
  XCircle,
} from 'lucide-react-native';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import { Card, EmptyState } from '../../components/ui';
import { colors, radius, spacing, typography, fonts } from '../../theme/tokens';
import { formatDDMMMYYYY } from '../../lib/format-date';

type MessageType =
  | 'daily_digest'
  | 'mortality_alert'
  | 'vaccination_reminder'
  | 'heat_stress_alert'
  | 'payment_reminder'
  | 'low_stock_alert'
  | 'invoice'
  | 'traceability_cert'
  | 'report';

interface LogRow {
  id: string;
  recipient_phone: string;
  message_type: MessageType;
  template_id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  error_message: string | null;
  created_at: string;
}

function MessageTypeIcon({ type, status }: { type: MessageType; status: LogRow['status'] }) {
  const color = status === 'failed' ? colors.body : colors.ink;
  switch (type) {
    case 'mortality_alert':       return <AlertTriangle size={20} color={color} />;
    case 'heat_stress_alert':     return <Flame size={20} color={color} />;
    case 'vaccination_reminder':  return <Syringe size={20} color={color} />;
    case 'payment_reminder':      return <Receipt size={20} color={color} />;
    case 'low_stock_alert':       return <Package size={20} color={color} />;
    case 'daily_digest':          return <Bell size={20} color={color} />;
    default:                      return <MessageSquare size={20} color={color} />;
  }
}

function StatusPill({ status, label }: { status: LogRow['status']; label: string }) {
  if (status === 'failed') {
    return (
      <View style={[styles.statusPill, { backgroundColor: colors.canvasSoft }]}>
        <XCircle size={12} color={colors.primary} />
        <Text style={[styles.statusText, { color: colors.primary }]}>{label}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.statusPill, { backgroundColor: colors.successSoft }]}>
      <CheckCircle2 size={12} color={colors.success} />
      <Text style={[styles.statusText, { color: colors.success }]}>{label}</Text>
    </View>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  if (sameDay) return `${hh}:${mm}`;
  return `${formatDDMMMYYYY(date.toISOString())} ${hh}:${mm}`;
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const [logs, setLogs] = useState<LogRow[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentFarm) {
      setLogs([]);
      return;
    }
    const { data, error } = await supabase
      .from('whatsapp_messages_log')
      .select('id, recipient_phone, message_type, template_id, status, error_message, created_at')
      .eq('farm_id', currentFarm.id)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      setSnackbar(error.message);
      setRefreshing(false);
      return;
    }
    setLogs((data ?? []) as LogRow[]);
    setRefreshing(false);
  }, [currentFarm]);

  useFocusEffect(useCallback(() => { setLogs(null); load(); }, [load]));

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: t('notifications.title') }} />

      {logs && logs.length > 0 ? (
        <FlatList
          data={logs}
          keyExtractor={(l) => l.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => { setRefreshing(true); load(); }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <Card style={styles.headerCard}>
              <Text style={styles.headerTitle}>{t('notifications.header_title')}</Text>
              <Text style={styles.muted}>{t('notifications.header_description')}</Text>
            </Card>
          }
          renderItem={({ item }) => (
            <Card style={styles.row}>
              <View style={styles.rowHead}>
                <View style={styles.iconWrap}>
                  <MessageTypeIcon type={item.message_type} status={item.status} />
                </View>
                <View style={styles.rowBody}>
                  <View style={styles.rowTitleLine}>
                    <Text style={styles.rowTitle}>{t(`notifications.type.${item.message_type}`)}</Text>
                    <StatusPill status={item.status} label={t(`notifications.status.${item.status}`)} />
                  </View>
                  <Text style={styles.rowMeta}>
                    {item.recipient_phone} · {formatTime(item.created_at)}
                  </Text>
                  {item.status === 'failed' && item.error_message ? (
                    <Text style={styles.errorText} numberOfLines={2}>
                      {item.error_message}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Card>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        />
      ) : logs && logs.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            title={t('notifications.empty.title')}
            description={t('notifications.empty.description')}
          />
        </View>
      ) : null}

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  listContent: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing['3xl'] },
  headerCard: { marginBottom: spacing.md },
  headerTitle: { ...typography.bodyMdStrong, color: colors.ink, marginBottom: spacing.sm },
  muted: { ...typography.bodySm, color: colors.body },
  emptyWrap: { padding: spacing.lg, flex: 1 },
  row: { gap: spacing.xs },
  rowHead: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'flex-start',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.canvasSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: spacing.xxs },
  rowTitleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  rowTitle: { ...typography.bodyMdStrong, color: colors.ink },
  rowMeta: { ...typography.caption, color: colors.body },
  errorText: { ...typography.caption, color: colors.primary, marginTop: spacing.xxs },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs,
    borderRadius: radius.full,
  },
  statusText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700', fontFamily: fonts.bold,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
});
