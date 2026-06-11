import { useCallback, useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import { PurchaseEntryForm } from '../../components/ui';
import type { PurchaseEntryValues } from '../../components/ui';
import { colors } from '../../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ItemOption {
  id: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function RecordPurchaseScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const currentFarm = useFarmStore((s) => s.currentFarm);

  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Load items for the form selector
  // -------------------------------------------------------------------------

  const loadItems = useCallback(async () => {
    if (!currentFarm) return;
    const { data, error } = await supabase
      .from('inventory_items')
      .select('id, item_name')
      .eq('farm_id', currentFarm.id)
      .order('item_name');
    if (!error) {
      setItemOptions(
        (data ?? []).map((row) => ({ id: row.id, label: row.item_name })),
      );
    }
  }, [currentFarm]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // -------------------------------------------------------------------------
  // Submit handler
  // -------------------------------------------------------------------------

  async function handleSubmit(values: PurchaseEntryValues) {
    if (!currentFarm) {
      setSnackbar(t('inventory.purchase.session_error'));
      return;
    }

    setSubmitting(true);
    try {
      // 1. Insert the inventory_movement row
      const { error: insertError } = await supabase
        .from('inventory_movements')
        .insert({
          item_id: values.itemId,
          farm_id: currentFarm.id,
          movement_type: 'purchase',
          quantity: values.quantity,
          cost_per_unit: values.costPerUnit ?? null,
          supplier: values.supplier ?? null,
          movement_date: values.movementDate,
          notes: values.notes ?? null,
        });

      if (insertError) {
        setSnackbar(t('inventory.purchase.save_failed', { reason: insertError.message }));
        return;
      }

      // 2. Read the current stock for the selected item
      const { data: itemData, error: readError } = await supabase
        .from('inventory_items')
        .select('current_stock')
        .eq('id', values.itemId)
        .single();

      if (readError || !itemData) {
        setSnackbar(t('inventory.purchase.stock_read_failed'));
        return;
      }

      // 3. Increment current_stock
      const { error: updateError } = await supabase
        .from('inventory_items')
        .update({ current_stock: itemData.current_stock + values.quantity })
        .eq('id', values.itemId);

      if (updateError) {
        setSnackbar(t('inventory.purchase.stock_update_failed'));
        return;
      }

      // Success — go back; index refreshes via useFocusEffect
      router.back();
    } catch (e) {
      setSnackbar(e instanceof Error ? e.message : t('inventory.purchase.unexpected'));
    } finally {
      setSubmitting(false);
    }
  }

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen
        options={{ title: t('inventory.purchase.title'), presentation: 'modal' }}
      />

      <PurchaseEntryForm
        items={itemOptions}
        onSubmit={handleSubmit}
        submitting={submitting}
        onCancel={() => router.back()}
        testID="purchase-entry-form"
      />

      <Snackbar
        visible={snackbar !== null}
        onDismiss={() => setSnackbar(null)}
        duration={3500}
      >
        {snackbar ?? ''}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
  },
});
