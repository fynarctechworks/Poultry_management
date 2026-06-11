import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePlatformPermission, PlatformForbiddenError } from '@/lib/control/guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { Forbidden } from '@/components/control/Forbidden';
import { ErrorWorkflow } from '@/components/control/ErrorWorkflow';

export const dynamic = 'force-dynamic';

export default async function ErrorDetailPage({ params }: { params: { id: string } }) {
  let service;
  try {
    ({ service } = await requirePlatformPermission('error:read'));
  } catch (e) {
    if (e instanceof PlatformForbiddenError) return <Forbidden message={e.message} />;
    throw e;
  }

  const [{ data: err }, { data: comments }, canManageRes] = await Promise.all([
    service.from('platform_errors').select('*').eq('id', params.id).maybeSingle(),
    service.from('error_comments').select('comment, author_id, created_at').eq('error_id', params.id).order('created_at', { ascending: false }),
    createSupabaseServerClient().rpc('platform_has_permission', { p_perm: 'error:manage' }),
  ]);

  if (!err) notFound();

  return (
    <div className="max-w-[900px]">
      <Link href="/admin/errors" className="text-sm text-body-soft hover:text-ink">← All errors</Link>
      <h2 className="text-xl font-bold text-ink mt-sm mb-xs">{err.message}</h2>
      <p className="text-sm text-body-soft mb-lg">
        {err.source} · {err.module ?? '—'} · severity {err.severity} · seen {err.occurrence_count}× ·
        status <span className="font-semibold">{err.status}</span>
      </p>

      <div className="bg-canvas border border-mute rounded-card p-lg mb-lg">
        <ErrorWorkflow errorId={err.id} status={err.status} canManage={!!canManageRes.data} />
      </div>

      <div className="grid md:grid-cols-2 gap-lg mb-lg">
        <div className="bg-canvas border border-mute rounded-card p-lg text-sm grid grid-cols-2 gap-sm">
          <span className="text-body-soft">Route</span><span className="text-ink break-all">{err.route ?? '—'}</span>
          <span className="text-body-soft">Browser</span><span className="text-ink">{err.browser ?? '—'}</span>
          <span className="text-body-soft">Device</span><span className="text-ink">{err.device ?? '—'}</span>
          <span className="text-body-soft">First seen</span><span className="text-ink">{new Date(err.first_seen_at).toLocaleString('en-IN')}</span>
          <span className="text-body-soft">Last seen</span><span className="text-ink">{new Date(err.last_seen_at).toLocaleString('en-IN')}</span>
          <span className="text-body-soft">Tenant</span><span className="text-ink">{err.tenant_id ? <Link className="text-primary hover:underline" href={`/admin/tenants/${err.tenant_id}`}>view</Link> : '—'}</span>
        </div>
        <div className="bg-canvas border border-mute rounded-card p-lg">
          <h3 className="text-sm font-bold text-ink mb-sm">Stack</h3>
          <pre className="text-xs text-body-soft whitespace-pre-wrap break-all max-h-[200px] overflow-auto">{err.stack ?? '(no stack)'}</pre>
        </div>
      </div>

      <div className="bg-canvas border border-mute rounded-card p-lg">
        <h3 className="text-sm font-bold text-ink mb-md">Comments</h3>
        {(comments?.length ?? 0) === 0 ? <p className="text-sm text-body-soft">No comments yet.</p> : (
          <ul className="text-sm divide-y divide-mute">
            {comments!.map((c, i) => (
              <li key={i} className="py-sm">
                <p className="text-ink">{c.comment}</p>
                <p className="text-xs text-body-soft">{new Date(c.created_at).toLocaleString('en-IN')}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
