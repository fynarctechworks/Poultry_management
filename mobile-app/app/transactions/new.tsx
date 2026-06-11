import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import {
  TransactionForm,
  type TransactionFormValues,
  type TransactionType,
} from '../../components/ui';
import { colors } from '../../theme/tokens';

interface BuyerOption {
  id: string;
  label: string;
}

export default function NewTransactionScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const params = useLocalSearchParams<{ type?: string; buyerId?: string }>();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const [buyers, setBuyers] = useState<BuyerOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const initialType: TransactionType =
    params.type === 'expense' ? 'expense' : 'income';
  const initialBuyerId = params.buyerId ?? undefined;

  const loadBuyers = useCallback(async () => {
    if (!currentFarm) return;
    const { data, error } = await supabase
      .from('buyers')
      .select('id, buyer_name')
      .eq('farm_id', currentFarm.id)
      .order('buyer_name');
    if (error) {
      setSnackbar(error.message);
      return;
    }
    setBuyers(
      (data ?? []).map((b) => ({ id: b.id, label: b.buyer_name })),
    );
  }, [currentFarm]);

  useEffect(() => {
    loadBuyers();
  }, [loadBuyers]);

  const onSubmit = async (values: TransactionFormValues) => {
    if (!currentFarm) {
      setSnackbar(t('transaction_form.no_farm_selected'));
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('financial_transactions').insert({
        farm_id: currentFarm.id,
        buyer_id: values.buyerId ?? null,
        transaction_type: values.transactionType,
        category: values.category,
        amount: values.amount,
        quantity: values.quantity ?? null,
        price_per_unit: values.pricePerUnit ?? null,
        buyer_or_supplier: values.counterparty ?? null,
        transaction_date: values.transactionDate,
        payment_status: values.paymentStatus,
        due_date: values.dueDate ?? null,
        notes: values.notes ?? null,
      });
      if (error) throw error;
      router.back();
    } catch (err: unknown) {
      setSnackbar(err instanceof Error ? err.message : t('transaction_form.save_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TransactionForm
        buyers={buyers.map((b) => ({ id: b.id, label: b.label }))}
        defaultType={initialType}
        defaultBuyerId={initialBuyerId}
        onSubmit={onSubmit}
        submitting={submitting}
        onCancel={() => router.back()}
      />
      <Snackbar visible={!!snackbar} onDismiss={() => setSnackbar(null)}>
        {snackbar ?? ''}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
});
