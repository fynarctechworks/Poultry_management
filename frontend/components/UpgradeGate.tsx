import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase/server';

interface Props {
  feature: string;
  description: string;
  children: React.ReactNode;
}

/**
 * Server-side freemium gate. Calls the `is_paid()` RPC (which honours the
 * 7-day past_due grace) and either renders `children` or shows an upgrade
 * card. Use on paid-only pages: /multi-farm, /contract, etc.
 */
export async function UpgradeGate({ feature, description, children }: Props) {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.rpc('is_paid');
  const isPaid = !error && data === true;

  if (isPaid) {
    return <>{children}</>;
  }

  return (
    <div className="max-w-[720px] mx-auto">
      <div className="card border-primary-dark">
        <p className="text-xs uppercase tracking-wider text-body-soft">Paid feature</p>
        <h1 className="text-2xl font-bold text-ink mt-xs">{feature}</h1>
        <p className="text-sm text-body mt-md">{description}</p>
        <div className="mt-lg">
          <Link href="/billing" className="btn-primary">View plans</Link>
        </div>
      </div>
    </div>
  );
}
