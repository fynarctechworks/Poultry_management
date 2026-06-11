import { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { colors, spacing } from '../../theme/tokens';

export interface AppModalProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  /** Style of the centered content card (mirrors paper Modal's contentContainerStyle). */
  contentContainerStyle?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Centered modal built on RN's Modal — replaces react-native-paper's
 * Portal+Modal pair (blueprint §4.4). Backdrop tap and hardware back dismiss.
 */
export function AppModal({ visible, onDismiss, children, contentContainerStyle, testID }: AppModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss} accessibilityLabel="Close">
        <View
          style={contentContainerStyle}
          onStartShouldSetResponder={() => true}
          testID={testID}
        >
          {children}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.overlay,
    justifyContent: 'center',
    padding: spacing.xl,
  },
});
