import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, spacing, radius, typography, motion, elevation } from '../../theme/tokens';

export type ToastTone = 'neutral' | 'success' | 'error' | 'info';

export interface ToastOptions {
  message: string;
  tone?: ToastTone;
  /** Auto-dismiss after ms (default 4000; pass 0 to require manual dismiss). */
  duration?: number;
  /** Optional action button, e.g. { label: 'Undo', onPress } — blueprint §9.2. */
  action?: { label: string; onPress: () => void };
}

interface ToastContextValue {
  show: (options: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

const TONE_BG: Record<ToastTone, string> = {
  neutral: colors.ink,
  success: colors.successInk,
  error: colors.danger,
  info: colors.info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastOptions | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hide = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setToast(null);
  }, []);

  const show = useCallback((options: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    setToast(options);
    const ms = options.duration ?? 4000;
    if (ms > 0) timer.current = setTimeout(() => setToast(null), ms);
  }, []);

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <ToastBar tone={toast.tone ?? 'neutral'} onDismiss={hide} action={toast.action}>
          {toast.message}
        </ToastBar>
      )}
    </ToastContext.Provider>
  );
}

interface ToastBarProps {
  children: ReactNode;
  tone?: ToastTone;
  onDismiss: () => void;
  action?: { label: string; onPress: () => void };
  style?: ViewStyle;
}

function ToastBar({ children, tone = 'neutral', onDismiss, action, style }: ToastBarProps) {
  const translateY = useRef(new Animated.Value(8)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let reduced = false;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      reduced = v;
      if (reduced) {
        translateY.setValue(0);
        opacity.setValue(1);
        return;
      }
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: motion.entrance,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: motion.entrance,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    });
  }, [translateY, opacity]);

  return (
    <Animated.View
      style={[styles.bar, { backgroundColor: TONE_BG[tone], transform: [{ translateY }], opacity }, style]}
      accessibilityLiveRegion="polite"
      accessibilityRole="alert"
    >
      <Text style={styles.message} numberOfLines={3}>
        {children}
      </Text>
      {action && (
        <Pressable
          onPress={() => {
            action.onPress();
            onDismiss();
          }}
          style={styles.actionButton}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          hitSlop={8}
        >
          <Text style={styles.actionLabel}>{action.label}</Text>
        </Pressable>
      )}
      <Pressable
        onPress={onDismiss}
        style={styles.dismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        hitSlop={8}
      >
        <Text style={styles.dismissLabel}>✕</Text>
      </Pressable>
    </Animated.View>
  );
}

export interface SnackbarProps {
  visible: boolean;
  onDismiss: () => void;
  children: ReactNode;
  /** Auto-dismiss after ms. Mirrors the react-native-paper Snackbar API. */
  duration?: number;
  style?: ViewStyle;
  tone?: ToastTone;
  action?: { label: string; onPress: () => void };
}

/**
 * Drop-in replacement for react-native-paper's Snackbar (the only Paper
 * surface that remained — blueprint §4.4). Controlled by `visible`, renders
 * a bottom-anchored ToastBar, auto-dismisses after `duration` ms.
 */
export function Snackbar({
  visible,
  onDismiss,
  children,
  duration = 4000,
  style,
  tone = 'neutral',
  action,
}: SnackbarProps) {
  useEffect(() => {
    if (!visible || duration <= 0) return;
    const id = setTimeout(onDismiss, duration);
    return () => clearTimeout(id);
  }, [visible, duration, onDismiss]);

  if (!visible) return null;
  return (
    <View pointerEvents="box-none" style={styles.snackbarHost}>
      <ToastBar tone={tone} onDismiss={onDismiss} action={action} style={style}>
        {children}
      </ToastBar>
    </View>
  );
}

const styles = StyleSheet.create({
  snackbarHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  bar: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 48,
    ...elevation.subtle,
  },
  message: {
    flex: 1,
    fontSize: typography.bodySm.fontSize,
    lineHeight: typography.bodySm.lineHeight,
    fontWeight: typography.bodySm.fontWeight,
    fontFamily: typography.bodySm.fontFamily,
    color: colors.onDark,
  },
  actionButton: {
    marginLeft: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  actionLabel: {
    fontSize: typography.bodySmStrong.fontSize,
    fontWeight: typography.bodySmStrong.fontWeight,
    fontFamily: typography.bodySmStrong.fontFamily,
    color: colors.onDark,
    textDecorationLine: 'underline',
  },
  dismiss: {
    marginLeft: spacing.md,
    minWidth: 24,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dismissLabel: {
    color: colors.onDark,
    fontSize: typography.bodySm.fontSize,
  },
});
