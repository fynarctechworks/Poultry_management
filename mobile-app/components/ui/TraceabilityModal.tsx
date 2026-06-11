import { AppModal } from './AppModal';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { CheckCircle2, MessageCircle, Lock, Copy } from 'lucide-react-native';
import { colors, radius, spacing, typography } from '../../theme/tokens';

const WHATSAPP_GREEN = '#25D366';

export interface TraceabilityRecord {
  qr_token: string;
  supplier_name: string | null;
  placement_date: string | null;
  breed_name: string | null;
  total_vaccinations: number;
  health_incidents_count: number;
  withdrawal_cleared: boolean;
  harvest_date: string | null;
  is_locked: boolean;
}

export interface TraceabilityModalProps {
  visible: boolean;
  onDismiss: () => void;
  record: TraceabilityRecord | null;
  batchCode: string;
  farmName: string;
  publicBaseUrl?: string;  // defaults to https://poultryos.app/trace
  testID?: string;
}

function formatDMY(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${String(d.getDate()).padStart(2,'0')}-${months[d.getMonth()]}-${d.getFullYear()}`;
}

export function TraceabilityModal({
  visible,
  onDismiss,
  record,
  batchCode,
  farmName,
  publicBaseUrl = 'https://poultryos.app/trace',
  testID,
}: TraceabilityModalProps) {
  if (!record) return null;
  const publicUrl = `${publicBaseUrl}/${record.qr_token}`;

  const shareViaWhatsApp = async () => {
    const text = `Traceability certificate for ${batchCode} (${farmName}). View → ${publicUrl}`;
    const native = `whatsapp://send?text=${encodeURIComponent(text)}`;
    const fallback = `https://wa.me/?text=${encodeURIComponent(text)}`;
    const ok = await Linking.canOpenURL(native).catch(() => false);
    await Linking.openURL(ok ? native : fallback);
  };

  const copyUrl = async () => {
    await Linking.openURL(publicUrl);
  };

  return (
    <AppModal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}
        testID={testID}
      >
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.headerRow}>
            <Text style={styles.title}>Traceability certificate</Text>
            {record.is_locked ? (
              <View style={styles.lockedPill}>
                <Lock size={12} color={colors.body} />
                <Text style={styles.lockedText}>Locked</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.subtitle}>{`${batchCode} · ${farmName}`}</Text>

          <View style={styles.qrWrap}>
            <QRCode value={publicUrl} size={220} backgroundColor={colors.canvas} />
          </View>
          <Text style={styles.urlText} numberOfLines={1}>{publicUrl}</Text>

          <View style={styles.factGrid}>
            <FactRow label="Breed" value={record.breed_name ?? '—'} />
            <FactRow label="Supplier" value={record.supplier_name ?? '—'} />
            <FactRow label="Placed" value={formatDMY(record.placement_date)} />
            <FactRow label="Harvested" value={formatDMY(record.harvest_date)} />
            <FactRow
              label="Vaccinations"
              value={String(record.total_vaccinations)}
            />
            <FactRow
              label="Health incidents"
              value={String(record.health_incidents_count)}
            />
          </View>

          <View
            style={[
              styles.statusBanner,
              record.withdrawal_cleared
                ? styles.bannerSuccess
                : styles.bannerWarning,
            ]}
          >
            <CheckCircle2
              size={16}
              color={
                record.withdrawal_cleared ? colors.success : colors.warning
              }
            />
            <Text
              style={[
                styles.statusText,
                record.withdrawal_cleared
                  ? styles.statusTextSuccess
                  : styles.statusTextWarning,
              ]}
            >
              {record.withdrawal_cleared
                ? 'All medicine withdrawal periods cleared before harvest'
                : 'Withdrawal period overlap — review health incidents'}
            </Text>
          </View>

          <Pressable
            onPress={shareViaWhatsApp}
            style={styles.shareBtn}
            accessibilityRole="button"
            accessibilityLabel="Share certificate via WhatsApp"
          >
            <MessageCircle size={18} color={colors.onPrimary} />
            <Text style={styles.shareLabel}>Share via WhatsApp</Text>
          </Pressable>

          <Pressable
            onPress={copyUrl}
            style={styles.copyBtn}
            accessibilityRole="button"
            accessibilityLabel="Open public certificate page"
          >
            <Copy size={16} color={colors.ink} />
            <Text style={styles.copyLabel}>Open public page</Text>
          </Pressable>

          <Pressable onPress={onDismiss} style={styles.closeBtn}>
            <Text style={styles.closeLabel}>Close</Text>
          </Pressable>
        </ScrollView>
      </AppModal>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.factRow}>
      <Text style={styles.factLabel}>{label}</Text>
      <Text style={styles.factValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  modal: {
    backgroundColor: colors.canvas,
    margin: spacing.lg,
    borderRadius: radius.card,
    maxHeight: '92%',
  },
  content: {
    padding: spacing['2xl'],
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { ...typography.displaySm, color: colors.ink },
  subtitle: { ...typography.captionUppercase, color: colors.body },
  lockedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.canvasSoft,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  lockedText: { ...typography.captionStrong, color: colors.body },
  qrWrap: {
    alignSelf: 'center',
    padding: spacing.lg,
    backgroundColor: colors.canvas,
    borderColor: colors.mute,
    borderWidth: 1,
    borderRadius: radius.card,
  },
  urlText: {
    ...typography.captionStrong,
    color: colors.body,
    textAlign: 'center',
  },
  factGrid: {
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.card,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.xs,
  },
  factRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  factLabel: { ...typography.bodySm, color: colors.body },
  factValue: { ...typography.bodySmStrong, color: colors.ink, flexShrink: 1, marginLeft: spacing.md, textAlign: 'right' },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
  },
  bannerSuccess: { backgroundColor: colors.successSoft },
  bannerWarning: { backgroundColor: colors.warningSoft },
  statusText: { ...typography.bodySm, flex: 1 },
  statusTextSuccess: { color: colors.success },
  statusTextWarning: { color: colors.warningInk },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: WHATSAPP_GREEN,
    borderRadius: radius.pillLg,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  shareLabel: { ...typography.bodyMdStrong, color: colors.onPrimary },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderColor: colors.ink,
    borderWidth: 1,
    borderRadius: radius.pillLg,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
  },
  copyLabel: { ...typography.bodyMdStrong, color: colors.ink },
  closeBtn: {
    alignSelf: 'center',
    paddingVertical: spacing.sm,
  },
  closeLabel: { ...typography.bodySmStrong, color: colors.body },
});
