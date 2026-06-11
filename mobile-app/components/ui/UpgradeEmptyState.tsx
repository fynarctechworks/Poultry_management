import { ViewStyle } from 'react-native';
import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { colors } from '../../theme/tokens';
import { EmptyState } from './EmptyState';

export interface UpgradeEmptyStateProps {
  /** One-line value statement, e.g. "See all your farms in one dashboard." */
  message: string;
  title?: string;
  ctaLabel?: string;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Freemium gates that sell (blueprint §9.6): a designed surface with a
 * one-line value statement and a single upgrade CTA into billing.
 */
export function UpgradeEmptyState({
  message,
  title = 'Upgrade to unlock',
  ctaLabel = 'See plans',
  style,
  testID,
}: UpgradeEmptyStateProps) {
  const router = useRouter();
  return (
    <EmptyState
      icon={<Sparkles size={32} color={colors.primary} />}
      title={title}
      description={message}
      actionLabel={ctaLabel}
      onAction={() => router.push('/billing')}
      style={style}
      testID={testID ?? 'upgrade-empty-state'}
    />
  );
}
