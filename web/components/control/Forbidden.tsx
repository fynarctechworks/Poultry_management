import { ShieldAlert } from 'lucide-react';

export function Forbidden({ message }: { message?: string }) {
  return (
    <div className="max-w-[560px] mx-auto mt-2xl bg-canvas border border-mute rounded-card p-2xl text-center">
      <div className="grid place-items-center w-12 h-12 rounded-full bg-warning-soft text-warning-ink mx-auto mb-md">
        <ShieldAlert size={24} />
      </div>
      <h2 className="text-xl font-bold text-ink mb-xs">Access denied</h2>
      <p className="text-sm text-body-soft">
        {message ?? 'You do not have permission to view this section.'}
      </p>
    </div>
  );
}
