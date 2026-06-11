import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, RefreshControl } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Snackbar } from 'react-native-paper';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react-native';
import { supabase } from '../../lib/supabase';
import { useFarmStore } from '../../stores/farm';
import {
  Select,
  InventoryItemCard,
  EmptyState,
} from '../../components/ui';
import { colors, spacing } from '../../theme/tokens';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type InventoryCategory = 'feed' | 'medicine' | 'vaccine' | 'equipment';
type CategoryFilter = 'all' | InventoryCategory;

interface InventoryItem {
  id: string;
  item_name: string;
  category: InventoryCategory;
  unit: 'kg' | 'litres' | 'units';
  current_stock: number;
  low_stock_threshold: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CATEGORY_FILTER_VALUES: CategoryFilter[] = [
  'all',
  'feed',
  'medicine',
  'vaccine',
  'equipment',
];

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function InventoryScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const currentFarm = useFarmStore((s) => s.currentFarm);

  const categoryOptions = CATEGORY_FILTER_VALUES.map((value) => ({
    value,
    label: value === 'all' ? t('inventory.all_categories') : t(`inventory.cat.${value}`),
  }));

  const [items, setItems] = useState<InventoryItem[] | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // -------------------------------------------------------------------------
  // Data loading
  // -------------------------------------------------------------------------

  const loadItems = useCallback(async () => {
    if (!currentFarm) return;
    const { data, error } = await supabase
      .from('inventory_items')
      .select('id, item_name, category, unit, current_stock, low_stock_threshold')
      .eq('farm_id', currentFarm.id)
      .order('item_name');
    if (!error) {
      setItems((data ?? []) as InventoryItem[]);
    } else {
      setSnackbar(t('inventory.load_failed', { reason: error.message }));
      setItems([]);
    }
  }, [currentFarm, t]);

  useFocusEffect(
    useCallback(() => {
      setItems(null);
      loadItems();
    }, [loadItems]),
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
  }, [loadItems]);

  // -------------------------------------------------------------------------
  // Header right — "+" button
  // -------------------------------------------------------------------------

  function AddButton() {
    return (
      <Pressable
        onPress={() => router.push('/inventory/new')}
        style={styles.headerBtn}
        accessible
        accessibilityRole="button"
        accessibilityLabel={t('inventory.record_new_purchase')}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Plus size={24} color={colors.primary} />
      </Pressable>
    );
  }

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const isLoading = items === null;

  const filteredItems =
    !isLoading && categoryFilter !== 'all'
      ? items.filter((i) => i.category === categoryFilter)
      : (items ?? []);

  const isEmpty = !isLoading && filteredItems.length === 0;

  // -------------------------------------------------------------------------
  // Main render
  // -------------------------------------------------------------------------

  return (
    <View style={styles.root}>
      <Stack.Screen
        options={{
          title: t('inventory.title'),
          headerRight: () => <AddButton />,
        }}
      />

      {/* Category filter */}
      <View style={styles.selectorWrap}>
        <Select
          label={t('inventory.category')}
          options={categoryOptions}
          value={categoryFilter}
          onChange={(val) => setCategoryFilter((val ?? 'all') as CategoryFilter)}
          placeholder={t('inventory.all_categories')}
        />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, isEmpty && styles.scrollEmpty]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        {isEmpty ? (
          <EmptyState
            title={
              categoryFilter === 'all'
                ? t('inventory.empty_all.title')
                : t('inventory.empty_filtered.title', { category: t(`inventory.cat.${categoryFilter}`) })
            }
            description={
              categoryFilter === 'all'
                ? t('inventory.empty_all.description')
                : t('inventory.empty_filtered.description')
            }
            actionLabel={t('inventory.record_purchase')}
            onAction={() => router.push('/inventory/new')}
          />
        ) : (
          !isLoading &&
          filteredItems.map((item) => (
            <InventoryItemCard
              key={item.id}
              itemName={item.item_name}
              category={item.category}
              unit={item.unit}
              currentStock={item.current_stock}
              lowStockThreshold={item.low_stock_threshold}
              style={styles.card}
              testID={`inv-card-${item.id}`}
            />
          ))
        )}
      </ScrollView>

      <Snackbar visible={snackbar !== null} onDismiss={() => setSnackbar(null)} duration={4000}>
        {snackbar ?? ''}
      </Snackbar>
    </View>
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
  selectorWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
    backgroundColor: colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: colors.mute,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing['3xl'],
    gap: spacing.md,
  },
  scrollEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  headerBtn: {
    paddingHorizontal: spacing.sm,
  },
  card: {
    // gap handled by scrollContent
  },
});
