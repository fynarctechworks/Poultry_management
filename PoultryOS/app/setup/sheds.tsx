import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Snackbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Warehouse } from 'lucide-react-native';
import { useFarmStore } from '../../stores/farm';
import { supabase } from '../../lib/supabase';
import {
  Card,
  TextInput,
  RadioGroup,
  Button,
  EmptyState,
  UpgradeBanner,
} from '../../components/ui';
import { canAddShed } from '../../lib/freemium';
import { useIsPaid } from '../../lib/freemium-hooks';
import { track, FUNNEL } from '../../lib/analytics';
import { colors, spacing, typography } from '../../theme/tokens';

type Shed = {
  id: string;
  shed_name: string;
  capacity: number;
  poultry_type: 'broiler' | 'layer' | 'breeder';
  status: string;
};

function makeSchema(t: TFunction) {
  return z.object({
    shed_name: z.string().min(1, t('setup.sheds.errors.name_required')),
    capacity: z
      .string()
      .refine((v) => /^[0-9]+$/.test(v) && parseInt(v) > 0, {
        message: t('setup.sheds.errors.capacity_valid'),
      }),
    poultry_type: z.enum(['broiler', 'layer', 'breeder'], {
      errorMap: () => ({ message: t('setup.sheds.errors.type_required') }),
    }),
  });
}

type FormData = z.infer<ReturnType<typeof makeSchema>>;

const POULTRY_TYPE_VALUES = ['broiler', 'layer', 'breeder'] as const;

export default function ShedsSetup() {
  const router = useRouter();
  const { t } = useTranslation();
  const currentFarm = useFarmStore((s) => s.currentFarm);
  const { isPaid } = useIsPaid();
  const schema = useMemo(() => makeSchema(t), [t]);
  const poultryTypeOptions = POULTRY_TYPE_VALUES.map((value) => ({
    value,
    label: t(`setup.poultry_type.${value}`),
  }));
  const [sheds, setSheds] = useState<Shed[]>([]);
  const [snackVisible, setSnackVisible] = useState(false);
  const [snackMessage, setSnackMessage] = useState('');

  const {
    control,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { shed_name: '', capacity: '', poultry_type: 'broiler' },
  });

  const loadSheds = async () => {
    if (!currentFarm?.id) return;
    const { data } = await supabase
      .from('sheds')
      .select('id,shed_name,capacity,poultry_type,status')
      .eq('farm_id', currentFarm.id)
      .order('created_at');
    setSheds(data ?? []);
  };

  useEffect(() => {
    loadSheds();
  }, [currentFarm?.id]);

  const shedGate = canAddShed(sheds.length, isPaid);

  const onAddShed = async (values: FormData) => {
    if (!currentFarm?.id) return;
    if (!shedGate.allowed) {
      setSnackMessage(shedGate.reason ?? t('setup.sheds.upgrade'));
      setSnackVisible(true);
      return;
    }
    const { error } = await supabase.from('sheds').insert({
      farm_id: currentFarm.id,
      shed_name: values.shed_name,
      capacity: parseInt(values.capacity),
      poultry_type: values.poultry_type,
      status: 'active',
    });
    if (error) {
      setSnackMessage(error.message ?? t('setup.sheds.add_failed'));
      setSnackVisible(true);
      return;
    }
    if (sheds.length === 0) void track(FUNNEL.FIRST_SHED_CREATED);
    resetForm({ shed_name: '', capacity: '', poultry_type: 'broiler' });
    await loadSheds();
  };

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {sheds.length === 0 ? (
          <EmptyState
            icon={<Warehouse size={48} color={colors.body} />}
            title={t('setup.sheds.empty_title')}
            description={t('setup.sheds.empty_description')}
            style={styles.emptyState}
          />
        ) : (
          <View style={styles.shedList}>
            <Text style={styles.sectionLabel}>{t('setup.sheds.your_sheds')}</Text>
            {sheds.map((shed) => (
              <Card key={shed.id} style={styles.shedCard}>
                <Text style={styles.shedName}>{shed.shed_name}</Text>
                <Text style={styles.shedMeta}>
                  {t('setup.sheds.capacity_meta', {
                    type: t(`setup.poultry_type.${shed.poultry_type}`),
                    capacity: shed.capacity.toLocaleString(),
                  })}
                </Text>
              </Card>
            ))}
          </View>
        )}

        {!shedGate.allowed && shedGate.reason ? (
          <UpgradeBanner reason={shedGate.reason} />
        ) : null}

        <Text style={styles.sectionLabel}>{t('setup.sheds.add_a_shed')}</Text>

        <View style={styles.form}>
          <Controller
            control={control}
            name="shed_name"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('setup.sheds.shed_name')}
                value={value}
                onChangeText={onChange}
                autoCapitalize="words"
                placeholder={t('setup.sheds.shed_name_placeholder')}
                error={errors.shed_name?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="capacity"
            render={({ field: { onChange, value } }) => (
              <TextInput
                label={t('setup.sheds.capacity')}
                value={value}
                onChangeText={onChange}
                keyboardType="number-pad"
                placeholder={t('setup.sheds.capacity_placeholder')}
                error={errors.capacity?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="poultry_type"
            render={({ field: { onChange, value } }) => (
              <RadioGroup
                label={t('setup.sheds.poultry_type')}
                options={poultryTypeOptions}
                value={value}
                onChange={onChange}
                error={errors.poultry_type?.message}
              />
            )}
          />

          <Button
            label={t('setup.sheds.add_shed')}
            variant="primary"
            onPress={handleSubmit(onAddShed)}
            loading={isSubmitting}
            disabled={!shedGate.allowed}
            fullWidth
          />
        </View>

        <Button
          label={t('setup.sheds.continue')}
          variant="primary"
          onPress={() => router.push('/setup/batches')}
          disabled={sheds.length === 0}
          fullWidth
          style={styles.continueBtn}
        />
      </ScrollView>

      <Snackbar
        visible={snackVisible}
        onDismiss={() => setSnackVisible(false)}
        duration={4000}
        style={styles.snackbar}
      >
        {snackMessage}
      </Snackbar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  scroll: {
    flexGrow: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  emptyState: { marginBottom: spacing.lg },
  shedList: { gap: spacing.sm },
  sectionLabel: {
    ...typography.displayXs,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  shedCard: { gap: spacing.xs },
  shedName: {
    ...typography.bodyMdStrong,
    color: colors.ink,
  },
  shedMeta: {
    ...typography.caption,
    color: colors.body,
  },
  form: { gap: spacing.lg },
  continueBtn: { marginTop: spacing.lg },
  snackbar: { backgroundColor: colors.ink },
});
