const STYLES: Record<string, string> = {
  active: 'bg-success-soft text-success-ink',
  trial: 'bg-info-soft text-info',
  past_due: 'bg-pending-soft text-pending-ink',
  suspended: 'bg-warning-soft text-warning-ink',
  cancelled: 'bg-mute-soft text-body',
};

export function TenantStatusBadge({ status, deleted }: { status: string; deleted?: boolean }) {
  if (deleted) {
    return (
      <span className="text-[11px] font-bold uppercase bg-mute-soft text-body rounded-sm px-xs py-px line-through">
        deleted
      </span>
    );
  }
  const cls = STYLES[status] ?? 'bg-mute-soft text-body';
  return (
    <span className={`text-[11px] font-bold uppercase rounded-sm px-xs py-px ${cls}`}>
      {status.replace('_', ' ')}
    </span>
  );
}
