import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppModal } from './AppModal';
import { Button } from './Button';
import { Select } from './Select';
import { TextInput } from './TextInput';
import { supabase } from '../../lib/supabase';
import { todayISO } from '../../lib/format-date';
import { colors, radius, spacing, typography } from '../../theme/tokens';

export interface TransferShedOption {
  id: string;
  shed_name: string;
  capacity: number;
  poultry_type: string;
  status: string;
}

export interface TransferBatchModalProps {
  visible: boolean;
  onDismiss: () => void;
  batch: {
    id: string;
    batch_code: string;
    shed_id: string;
    poultry_type: string;
    placement_date: string;
  };
  sheds: TransferShedOption[];
  onSuccess: () => void;
  testID?: string;
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type FormFields = { to_shed_id: string; transfer_date: string; notes: string };

export function TransferBatchModal({
  visible,
  onDismiss,
  batch,
  sheds,
  onSuccess,
  testID,
}: TransferBatchModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Only valid destinations: same farm, active, matching poultry type, not the
  // shed the batch already sits in. (The DB RPC re-validates all of this.)
  const candidates = useMemo(
    () =>
      sheds.filter(
        (s) =>
          s.id !== batch.shed_id &&
          s.status === 'active' &&
          s.poultry_type === batch.poultry_type,
      ),
    [sheds, batch.shed_id, batch.poultry_type],
  );

  const schema = useMemo(
    () =>
      z.object({
        to_shed_id: z.string().uuid('Select a destination shed'),
        transfer_date: z
          .string()
          .regex(ISO_DATE_RE, 'Date must be YYYY-MM-DD')
          .refine((v) => v >= batch.placement_date, 'Must be on or after placement')
          .refine((v) => v <= todayISO(), 'Cannot be in the future'),
        notes: z.string().max(500).optional().or(z.literal('')),
      }),
    [batch.placement_date],
  );

  const { control, handleSubmit, reset, formState: { errors } } = useForm<FormFields>({
    resolver: zodResolver(schema),
    defaultValues: { to_shed_id: '', transfer_date: todayISO(), notes: '' },
  });

  useEffect(() => {
    if (visible) {
      reset({ to_shed_id: '', transfer_date: todayISO(), notes: '' });
      setServerError(null);
    }
  }, [visible, reset]);

  const onSubmit = async (values: FormFields) => {
    setSubmitting(true);
    setServerError(null);
    try {
      const { error } = await supabase.rpc('transfer_batch', {
        p_batch_id: batch.id,
        p_to_shed_id: values.to_shed_id,
        p_transfer_date: values.transfer_date,
        p_notes: values.notes?.trim() ? values.notes.trim() : null,
      });
      if (error) throw error;
      onSuccess();
      onDismiss();
    } catch (err: unknown) {
      setServerError(err instanceof Error ? err.message : 'Failed to transfer batch');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppModal visible={visible} onDismiss={onDismiss} contentContainerStyle={styles.modal} testID={testID}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{`Transfer ${batch.batch_code}`}</Text>
        <Text style={styles.subtitle}>
          The batch keeps its identity and history — only its location changes.
        </Text>

        {candidates.length === 0 ? (
          <>
            <Text style={styles.empty}>
              No eligible destination shed. You need another active{' '}
              {batch.poultry_type} shed on this farm with free capacity.
            </Text>
            <Button variant="outlineDark" label="Close" onPress={onDismiss} fullWidth />
          </>
        ) : (
          <>
            <Controller
              control={control}
              name="to_shed_id"
              render={({ field: { value, onChange } }) => (
                <Select
                  label="Destination shed *"
                  value={value || null}
                  onChange={onChange}
                  options={candidates.map((s) => ({
                    value: s.id,
                    label: `${s.shed_name} (cap. ${s.capacity.toLocaleString('en-IN')})`,
                  }))}
                  placeholder="Select a shed"
                  error={errors.to_shed_id?.message}
                  testID="tb-shed"
                />
              )}
            />

            <Controller
              control={control}
              name="transfer_date"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label="Transfer date *"
                  value={value}
                  onChangeText={onChange}
                  placeholder="YYYY-MM-DD"
                  autoCapitalize="none"
                  error={errors.transfer_date?.message}
                  testID="tb-date"
                />
              )}
            />

            <Controller
              control={control}
              name="notes"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  label="Notes (optional)"
                  value={value}
                  onChangeText={onChange}
                  placeholder="Reason for the move"
                  error={errors.notes?.message}
                  testID="tb-notes"
                />
              )}
            />

            {serverError ? <Text style={styles.serverError}>{serverError}</Text> : null}

            <View style={styles.actions}>
              <Button
                variant="primary"
                label="Transfer batch"
                onPress={handleSubmit(onSubmit)}
                loading={submitting}
                fullWidth
                testID="tb-confirm"
              />
              <Button variant="outlineDark" label="Cancel" onPress={onDismiss} fullWidth testID="tb-cancel" />
            </View>
          </>
        )}
      </ScrollView>
    </AppModal>
  );
}

const styles = StyleSheet.create({
  modal: { backgroundColor: colors.canvas, margin: spacing.lg, borderRadius: radius.card, maxHeight: '90%' },
  content: { padding: spacing['2xl'], gap: spacing.lg },
  title: { ...typography.displaySm, color: colors.ink },
  subtitle: { ...typography.bodySm, color: colors.body },
  empty: { ...typography.bodySm, color: colors.body },
  serverError: { ...typography.bodySm, color: colors.primary },
  actions: { gap: spacing.sm },
});
