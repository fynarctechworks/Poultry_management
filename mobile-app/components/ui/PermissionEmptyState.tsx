import { ViewStyle } from 'react-native';
import { Lock } from 'lucide-react-native';
import { colors } from '../../theme/tokens';
import { EmptyState } from './EmptyState';

export interface PermissionEmptyStateProps {
  /** What the user is missing, e.g. "Only the owner can see buyer ledgers". */
  message: string;
  title?: string;
  style?: ViewStyle;
  testID?: string;
}

/**
 * Shown where RLS denies data that must remain visible in the IA
 * (blueprint §1.4) — never a silent blank screen for workers/vets.
 */
export function PermissionEmptyState({
  message,
  title = 'Owner-only area',
  style,
  testID,
}: PermissionEmptyStateProps) {
  return (
    <EmptyState
      icon={<Lock size={32} color={colors.bodySoft} />}
      title={title}
      description={message}
      style={style}
      testID={testID ?? 'permission-empty-state'}
    />
  );
}
