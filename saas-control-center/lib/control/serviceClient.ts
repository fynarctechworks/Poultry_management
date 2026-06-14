// =============================================================================
// Control Center — server-only service-role Supabase client.
// =============================================================================
// The Control Center operates ABOVE tenant RLS, so it reads/writes across all
// tenants using the service-role key. This client therefore BYPASSES RLS and
// MUST NEVER reach the browser. Every use is behind `requirePlatformPermission`
// in guard.ts, which checks RBAC and writes an audit row.
//
// Guard rails:
//   * a runtime check throws if this module is ever evaluated in the browser
//   * the key is read from SUPABASE_SERVICE_ROLE_KEY (server env, never NEXT_PUBLIC_)
// =============================================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

if (typeof window !== 'undefined') {
  throw new Error(
    'control/serviceClient.ts was imported in the browser. The service-role client is server-only.'
  );
}

let cached: SupabaseClient | null = null;

/**
 * Returns true only when SUPABASE_SERVICE_ROLE_KEY is a real service_role JWT.
 * A common failure mode is leaving a placeholder string in .env.local — that
 * value is non-empty (so createServiceClient does NOT throw) yet every query
 * 401s, which the data layer would otherwise swallow into fake zeros. Pages use
 * this to render an explicit "key not configured" banner instead of empty data.
 */
export function serviceRoleKeyConfigured(): boolean {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return false;
  const parts = key.split('.');
  if (parts.length !== 3 || !key.startsWith('eyJ')) return false;
  try {
    const claims = JSON.parse(Buffer.from(parts[1], 'base64').toString());
    return claims.role === 'service_role';
  } catch {
    return false;
  }
}

/** Returns a singleton service-role client. Server-only. */
export function createServiceClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL is not set');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');

  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
