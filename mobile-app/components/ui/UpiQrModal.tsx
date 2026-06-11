import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors, radius, spacing, typography } from '../../theme/tokens';
import { Button } from './Button';
import { buildUpiUri, isValidVpa } from '../../lib/upi';
import { formatINR as sharedINR, formatNumber as sharedNum } from '@poultryos/shared';

export interface UpiQrModalProps {
  visible: boolean;
  onClose: () => void;
  vpa: string | null;
  payeeName: string;
  amount: number;
  buyerName?: string;
  note?: string;
  testID?: string;
}

export function UpiQrModal({
  visible,
  onClose,
  vpa,
  payeeName,
  amount,
  buyerName,
  note,
  testID,
}: UpiQrModalProps) {
  const validVpa = isValidVpa(vpa);
  const uri =
    validVpa && amount > 0
      ? buildUpiUri({ vpa: vpa!.trim(), payeeName, amount, note })
      : null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      testID={testID}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Scan to pay</Text>
          {buyerName ? <Text style={styles.subtitle}>{buyerName}</Text> : null}

          <View style={styles.qrWrap}>
            {uri ? (
              <QRCode value={uri} size={250} backgroundColor={colors.canvas} />
            ) : (
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText}>
                  {validVpa ? 'Enter amount above ₹0' : 'Add your UPI ID in farm settings'}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.amount}>
            {sharedINR(amount, { decimals: 2 })}
          </Text>
          {validVpa ? (
            <Text style={styles.vpa}>{vpa}</Text>
          ) : null}

          <Button
            variant="primary"
            label="Done"
            onPress={onClose}
            style={styles.closeBtn}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.canvas,
    borderTopLeftRadius: radius.card * 4,
    borderTopRightRadius: radius.card * 4,
    padding: spacing['2xl'],
    alignItems: 'center',
    gap: spacing.md,
  },
  title: {
    ...typography.displayXs,
    color: colors.ink,
  },
  subtitle: {
    ...typography.bodyMd,
    color: colors.body,
  },
  qrWrap: {
    padding: spacing.lg,
    backgroundColor: colors.canvas,
    borderRadius: radius.card,
    borderColor: colors.mute,
    borderWidth: 1,
    marginVertical: spacing.md,
  },
  placeholder: {
    width: 250,
    height: 250,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  placeholderText: {
    ...typography.bodyMd,
    color: colors.body,
    textAlign: 'center',
  },
  amount: {
    ...typography.displayMd,
    color: colors.ink,
  },
  vpa: {
    ...typography.captionStrong,
    color: colors.body,
  },
  closeBtn: {
    marginTop: spacing.lg,
    alignSelf: 'stretch',
  },
});
