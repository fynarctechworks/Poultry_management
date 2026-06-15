import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// DEV-ONLY email confirmation shortcut.
// =============================================================================
// We are not yet wired to a transactional email provider, so the real
// verification link never reaches the inbox in development. This route lets the
// "Verify now" button on /verify-email mark the account's email as confirmed.
//
// SECURITY: this runs entirely server-side using the Supabase Admin API and the
// SERVICE_ROLE key (which is never exposed to the browser). It does NOT use any
// anon-callable database function — the old public.dev_confirm_email() backdoor
// was dropped (migration 20260613170000) because the anon key ships in the
// client bundle and the env flag below never gated the database itself.
//
// PRODUCTION: keep DEV_EMAIL_VERIFY unset (or anything other than "true"). The
// route hard-refuses, and without SUPABASE_SERVICE_ROLE_KEY it cannot act at all.
// =============================================================================

export async function POST(request: Request) {
  // Defense-in-depth: never honour this shortcut in a production build, even if
  // DEV_EMAIL_VERIFY is mistakenly set. The flag below is the dev-only gate.
  if (process.env.NODE_ENV === 'production' || process.env.DEV_EMAIL_VERIFY !== 'true') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  let email: string | undefined;
  try {
    ({ email } = await request.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'Email is required' }, { status: 400 });
  }
  const target = email.trim().toLowerCase();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: 'Server is missing Supabase admin credentials' },
      { status: 500 },
    );
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Admin API has no get-by-email, so page through users to locate the account.
  // Dev databases are small; cap the search to avoid an unbounded loop.
  let found: { id: string; email_confirmed_at?: string | null } | undefined;
  for (let page = 1; page <= 20 && !found; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    found = data.users.find((u) => u.email?.toLowerCase() === target) as typeof found;
    if (data.users.length < 200) break; // last page
  }

  if (!found) {
    // No such account, or it's beyond the search window. The user can still try
    // to log in, so treat as a no-op success (matches prior behaviour).
    return NextResponse.json({ ok: true, confirmed: false });
  }

  if (found.email_confirmed_at) {
    return NextResponse.json({ ok: true, confirmed: true });
  }

  const { error: updErr } = await admin.auth.admin.updateUserById(found.id, {
    email_confirm: true,
  });
  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, confirmed: true });
}
