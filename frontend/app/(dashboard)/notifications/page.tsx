import { createSupabaseServerClient } from '@/lib/supabase/server';

export default async function NotificationsPage() {
  const supabase = createSupabaseServerClient();

  const { data: messages } = await supabase
    .from('whatsapp_messages_log')
    .select('id, recipient_phone, message_type, status, error_message, created_at, farms(farm_name)')
    .order('created_at', { ascending: false })
    .limit(100);

  return (
    <div className="max-w-[1100px] mx-auto">
      <h1 className="text-3xl font-bold text-ink mb-xs">Notification history</h1>
      <p className="text-sm text-body mb-2xl">Last 100 WhatsApp messages sent on your account.</p>

      <div className="card p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-canvas-soft border-b border-mute">
            <tr className="text-left text-xs uppercase tracking-wider text-body-soft">
              <th className="px-md py-sm">Sent</th>
              <th className="px-md py-sm">Type</th>
              <th className="px-md py-sm">Recipient</th>
              <th className="px-md py-sm">Farm</th>
              <th className="px-md py-sm">Status</th>
              <th className="px-md py-sm">Error</th>
            </tr>
          </thead>
          <tbody>
            {(messages ?? []).map((m: any) => (
              <tr key={m.id} className="border-b border-mute last:border-0">
                <td className="px-md py-md text-body">{new Date(m.created_at).toLocaleString('en-IN')}</td>
                <td className="px-md py-md font-semibold text-ink">{m.message_type}</td>
                <td className="px-md py-md text-body">{m.recipient_phone}</td>
                <td className="px-md py-md text-body">{m.farms?.farm_name ?? '—'}</td>
                <td className="px-md py-md">
                  <span className={`px-sm py-xxs rounded-md text-xs font-semibold ${
                    m.status === 'delivered' || m.status === 'read' ? 'bg-success-soft text-success-ink' :
                    m.status === 'failed' ? 'bg-warning-soft text-warning-ink' :
                    'bg-mute-soft text-body'
                  }`}>{m.status}</span>
                </td>
                <td className="px-md py-md text-body text-xs">{m.error_message ?? '—'}</td>
              </tr>
            ))}
            {(!messages || messages.length === 0) && (
              <tr><td colSpan={6} className="py-2xl text-center text-body">No WhatsApp messages sent yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
