import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  ViewStyle,
  DimensionValue,
} from 'react-native';
import { colors, spacing, radius } from '../../theme/tokens';

export interface SkeletonProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Skeleton placeholder block (blueprint §9.1 — skeleton-first loading).
 * Gentle opacity pulse; renders a static block when the OS requests
 * reduced motion (blueprint §3.3).
 */
export function Skeleton({
  width = '100%',
  height = 16,
  borderRadius = radius.sm,
  style,
  testID,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.6)).current;
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReducedMotion(v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      opacity.setValue(0.6);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reducedMotion]);

  return (
    <Animated.View
      testID={testID ?? 'skeleton'}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        { width, height, borderRadius, backgroundColor: colors.mute, opacity },
        style,
      ]}
    />
  );
}

/** Dashboard KPI grid preset — 2×2 tiles. */
export function SkeletonKpis({ testID }: { testID?: string }) {
  return (
    <View style={styles.kpiGrid} testID={testID ?? 'skeleton-kpis'}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.kpiTile}>
          <Skeleton width="55%" height={12} />
          <Skeleton width="40%" height={24} style={{ marginTop: spacing.sm }} />
        </View>
      ))}
    </View>
  );
}

/** List preset — n rows of icon + two-line text. */
export function SkeletonList({ rows = 6, testID }: { rows?: number; testID?: string }) {
  return (
    <View testID={testID ?? 'skeleton-list'}>
      {Array.from({ length: rows }).map((_, i) => (
        <View key={i} style={styles.listRow}>
          <Skeleton width={36} height={36} borderRadius={radius.full} />
          <View style={styles.listText}>
            <Skeleton width="65%" height={14} />
            <Skeleton width="40%" height={12} style={{ marginTop: spacing.xs }} />
          </View>
          <Skeleton width={56} height={14} />
        </View>
      ))}
    </View>
  );
}

/** Card preset — title + three lines. */
export function SkeletonCard({ testID }: { testID?: string }) {
  return (
    <View style={styles.card} testID={testID ?? 'skeleton-card'}>
      <Skeleton width="45%" height={16} />
      <Skeleton width="100%" height={12} style={{ marginTop: spacing.md }} />
      <Skeleton width="90%" height={12} style={{ marginTop: spacing.sm }} />
      <Skeleton width="70%" height={12} style={{ marginTop: spacing.sm }} />
    </View>
  );
}

const styles = StyleSheet.create({
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  kpiTile: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.mute,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.canvas,
    borderBottomWidth: 1,
    borderBottomColor: colors.muteSoft,
  },
  listText: {
    flex: 1,
  },
  card: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.mute,
    borderRadius: radius.card,
    padding: spacing.lg,
  },
});
