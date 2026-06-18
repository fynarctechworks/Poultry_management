import { cn } from '@/lib/utils';

/**
 * Shared table shell — a card-wrapped, horizontally scrollable table with the
 * editorial hairline-row treatment. Use with the Th/Td helpers so every table
 * across the app shares header casing, padding and row dividers.
 */
export function DataTable({
  head,
  children,
  className,
}: {
  head: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('card overflow-x-auto p-0', className)}>
      <table className="w-full text-sm">
        <thead className="bg-canvas-soft border-b border-mute">
          <tr className="text-left text-xs uppercase tracking-wider text-body-soft">{head}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th className={cn('px-md py-sm font-semibold', align === 'right' ? 'text-right' : 'text-left')}>
      {children}
    </th>
  );
}

export function Td({
  children,
  align,
  className = '',
}: {
  children: React.ReactNode;
  align?: 'right';
  className?: string;
}) {
  return (
    <td className={cn('px-md py-md', align === 'right' && 'text-right tabular-nums', className)}>
      {children}
    </td>
  );
}

/** Standard hover row with hairline divider. */
export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn('border-b border-mute last:border-0 hover:bg-canvas-soft', className)}>{children}</tr>;
}
