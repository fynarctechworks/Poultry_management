import { useCallback, useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import {
  Button,
  EmptyState,
  KhataLedgerRow,
  UpiQrModal,
  WhatsAppShareButton,
} from '../../components/ui';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { isValidVpa } from '../../lib/upi';
import { formatINR as sharedINR, formatNumber as sharedNum } from '@poultryos/shared';

interface BuyerRow {
  id: string;
  buyer_name: string;
  phone: string | null;
  whatsapp_phone: string | null;
  current_balance: number;
  total_business_volume: number;
}

interface TxnRow {
  id: string;
  transaction_type: 'income' | 'expense';
  amount: number;
  payment_status: 'paid' | 'pending' | 'partial';
  transaction_date: string;
  due_date: string | null;
  notes: string | null;
}

interface UpiCollectResponse {
  ok?: boolean;
  reason?: string;
  short_url?: string;
  payment_link_id?: string;
  error?: string;
}

function formatINR(n: number): string {
  return sharedINR(Math.abs(n), { decimals: 2 });
}

export default function BuyerDetailScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const [buyer, setBuyer] = useState<BuyerRow | null>(null);
  const [txns, setTxns] = useState<TxnRow[]>([]);
  const [qrVisible, setQrVisible] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id || !currentFarm) return;
    try {
      const [buyerRes, txnRes] = await Promise.all([
        supabase
          .from('buyers')
          .select('id, buyer_name, phone, whatsapp_phone, current_balance, total_business_volume')
          .eq('id', id)
          .eq('farm_id', currentFarm.id)
          .maybeSingle(),
        supabase
          .from('financial_transactions')
          .select('id, transaction_type, amount, payment_status, transaction_date, due_date, notes')
          .eq('buyer_id', id)
          .eq('farm_id', currentFarm.id)
          .order('transaction_date', { ascending: false })
          .limit(50),
      ]);
      if (buyerRes.error) throw buyerRes.error;
      if (txnRes.error) throw txnRes.error;
      setBuyer(buyerRes.data as BuyerRow | null);
      setTxns((txnRes.data ?? []) as TxnRow[]);
    } catch (err: unknown) {
      setSnackbar(err instanceof Error ? err.message : t('buyers.errors.load_failed'));
    }
  }, [id, currentFarm, t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const [linkLoading, setLinkLoading] = useState(false);

  async function sendUpiCollectLink() {
    if (!buyer) return;
    const pending = txns.find(
      (t) => t.transaction_type === 'income' && t.payment_status !== 'paid',
    );
    if (!pending) {
      setSnackbar(t('buyers.errors.no_pending'));
      return;
    }
    setLinkLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke<UpiCollectResponse>(
        'create-upi-collect-link',
        { body: { transaction_id: pending.id } },
      );
      if (error) throw error;
      if (!data?.ok) {
        if (data?.reason === 'not_configured') {
          setSnackbar(t('buyers.errors.upi_not_configured'));
          return;
        }
        throw new Error(data?.reason || data?.error || t('buyers.errors.generic_failed'));
      }
      const waPhone = (buyer.whatsapp_phone || buyer.phone || '').replace(/\D/g, '');
      const text = t('buyers.collect_message', {
        name: buyer.buyer_name,
        amount: formatINR(Number(pending.amount)),
        url: data.short_url,
      });
      const native = `whatsapp://send?phone=${waPhone}&text=${encodeURIComponent(text)}`;
      const fallback = `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`;
      const ok = await Linking.canOpenURL(native);
      await Linking.openURL(ok ? native : fallback);
    } catch (err: unknown) {
      setSnackbar(err instanceof Error ? err.message : t('buyers.errors.upi_link_failed'));
    } finally {
      setLinkLoading(false);
    }
  }

  const outstanding = buyer ? Number(buyer.current_balance) : 0;
  const owes = outstanding > 0;
  const farmUpi = currentFarm?.upi_id ?? null;
  const farmHasUpi = isValidVpa(farmUpi);

  const reminderMessage = useMemo(() => {
    if (!buyer) return '';
    const lines = [
      t('buyers.reminder.greeting', { name: buyer.buyer_name }),
      t('buyers.reminder.body', { amount: formatINR(outstanding) }),
    ];
    if (farmHasUpi) {
      lines.push(t('buyers.reminder.upi', { vpa: farmUpi }));
    }
    lines.push('— ' + (currentFarm?.farm_name ?? 'PoultryOS'));
    return lines.join('\n');
  }, [buyer, outstanding, farmHasUpi, farmUpi, currentFarm, t]);

  if (!buyer) {
    return (
      <View style={styles.root}>
        <Stack.Screen options={{ title: t('buyers.title_fallback') }} />
        <View style={styles.loadingWrap}>
          <Text style={styles.loadingText}>{t('buyers.loading')}</Text>
        </View>
        <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
          {snackbar ?? ''}
        </Snackbar>
      </View>
    );
  }

  const waPhone = buyer.whatsapp_phone || buyer.phone || '';

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: buyer.buyer_name }} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Balance summary */}
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>
            {owes ? t('buyers.owes_you') : outstanding < 0 ? t('buyers.you_owe') : t('buyers.settled')}
          </Text>
          <Text
            style={[
              styles.summaryAmount,
              owes ? styles.amountOwed : styles.amountSettled,
            ]}
          >
            {formatINR(outstanding)}
          </Text>
          <Text style={styles.summarySub}>
            {t('buyers.total_business', { amount: formatINR(Number(buyer.total_business_volume)) })}
          </Text>
        </View>

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            variant="primary"
            label={t('buyers.record_sale_payment')}
            onPress={() => router.push(`/transactions/new?type=income&buyerId=${buyer.id}`)}
            style={styles.actionBtn}
          />
          <Button
            variant="outlineDark"
            label={t('buyers.show_upi_qr')}
            onPress={() => {
              if (!farmHasUpi) {
                setSnackbar(t('buyers.errors.add_upi_first'));
                return;
              }
              if (outstanding <= 0) {
                setSnackbar(t('buyers.errors.no_outstanding'));
                return;
              }
              setQrVisible(true);
            }}
            style={styles.actionBtn}
          />
          {waPhone ? (
            <WhatsAppShareButton
              phone={waPhone}
              message={reminderMessage}
              label={t('buyers.send_reminder')}
              disabled={outstanding <= 0}
            />
          ) : null}
          {waPhone ? (
            <Button
              variant="outlineDark"
              label={linkLoading ? t('buyers.generating') : t('buyers.send_upi_collect')}
              onPress={sendUpiCollectLink}
              disabled={linkLoading || outstanding <= 0}
              fullWidth
            />
          ) : null}
        </View>

        {/* Ledger */}
        <Text style={styles.sectionTitle}>{t('buyers.recent_transactions')}</Text>
        {txns.length === 0 ? (
          <EmptyState
            title={t('buyers.empty.title')}
            description={t('buyers.empty.description')}
          />
        ) : (
          <View style={styles.ledger}>
            {txns.map((t) => (
              <KhataLedgerRow
                key={t.id}
                amount={Number(t.amount)}
                transactionType={t.transaction_type}
                paymentStatus={t.payment_status}
                transactionDate={t.transaction_date}
                dueDate={t.due_date}
                notes={t.notes}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <UpiQrModal
        visible={qrVisible}
        onClose={() => setQrVisible(false)}
        vpa={farmUpi}
        payeeName={currentFarm?.farm_name ?? 'PoultryOS'}
        amount={outstanding}
        buyerName={buyer.buyer_name}
        note={t('buyers.qr_note', { name: buyer.buyer_name })}
      />

      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing['3xl'] },
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { ...typography.bodyMd, color: colors.body },
  summary: {
    backgroundColor: colors.canvas,
    borderColor: colors.mute,
    borderWidth: 1,
    borderRadius: radius.card,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  summaryLabel: {
    ...typography.captionUppercase,
    color: colors.body,
  },
  summaryAmount: {
    ...typography.displayMd,
  },
  amountOwed: { color: colors.primary },
  amountSettled: { color: colors.ink },
  summarySub: {
    ...typography.captionStrong,
    color: colors.body,
  },
  actions: { gap: spacing.md },
  actionBtn: { alignSelf: 'stretch' },
  sectionTitle: {
    ...typography.bodyMdStrong,
    color: colors.ink,
    marginTop: spacing.sm,
  },
  ledger: {
    backgroundColor: colors.canvas,
    borderRadius: radius.card,
    borderColor: colors.mute,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
