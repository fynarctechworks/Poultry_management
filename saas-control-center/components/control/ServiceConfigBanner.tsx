// Platform-wide warning shown when the service-role key is a placeholder.
//
// Why this exists: the Control Center reads every metric through the service-
// role client. When SUPABASE_SERVICE_ROLE_KEY is a placeholder, those reads 401
// and the data layer renders fake zeros (count ?? 0) — making a fully-built
// dashboard look "empty" with no clue why. This banner turns that silent
// failure into an explicit, actionable message on every admin page.
import { AlertTriangle } from 'lucide-react';
import { serviceRoleKeyConfigured } from '@/lib/control/serviceClient';

export function ServiceConfigBanner() {
  if (serviceRoleKeyConfigured()) return null;

  return (
    <div className="mb-xl flex items-start gap-md rounded-card border border-warning-ink/30 bg-warning-soft p-lg text-warning-ink">
      <AlertTriangle size={20} className="mt-0.5 shrink-0" />
      <div className="text-sm">
        <p className="font-bold">Service-role key not configured — data is unavailable</p>
        <p className="mt-xs">
          <code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code> in{' '}
          <code className="font-mono">.env.local</code> is missing or a placeholder, so all
          above-RLS reads (tenant counts, billing, audit, navigation) return 401 and show as 0.
          Paste the project’s <strong>service_role</strong> JWT (Supabase Dashboard → Project
          Settings → API), then restart the dev server.
        </p>
      </div>
    </div>
  );
}
