// =============================================================================
// PoultryOS Control Center — initial Super Admin seed.
// =============================================================================
// Run ONCE after a fresh deploy:  npm run seed:admin
//
// Behaviour (all idempotent — safe to re-run):
//   1. Reads SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD / SUPER_ADMIN_NAME from
//      the environment (loaded from .env.local / .env if not already set).
//   2. Creates the auth.users row via the Admin API if it doesn't exist.
//      Supabase Auth hashes the password (argon2) — we never store plaintext.
//      Sets app_metadata.force_password_change = true so the operator must
//      rotate the seed password on first login.
//   3. Promotes that user to the platform `super_admin` role via the
//      `platform_bootstrap_super_admin` RPC (refuses once any admin exists).
//
// Security: service-role key + admin password live ONLY in server env. This
// script runs server-side (CI / shell), never in the browser. The password is
// never logged.
// =============================================================================

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, '..');

// --- Minimal .env loader (no dependency). Real env always wins. ---------------
function loadEnvFile(name) {
  try {
    const raw = readFileSync(resolve(projectRoot, name), 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let val = trimmed.slice(eq + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = val;
    }
  } catch {
    // File absent — fine in environments that inject real env vars.
  }
}
loadEnvFile('.env.local');
loadEnvFile('.env');

function fail(msg) {
  console.error(`\n  ✗ ${msg}\n`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.env.SUPER_ADMIN_EMAIL;
const password = process.env.SUPER_ADMIN_PASSWORD;
const name = process.env.SUPER_ADMIN_NAME;

if (!url) fail('NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) is not set.');
if (!serviceKey) fail('SUPABASE_SERVICE_ROLE_KEY is not set.');
if (!email) fail('SUPER_ADMIN_EMAIL is not set.');
if (!password) fail('SUPER_ADMIN_PASSWORD is not set.');
if (password.length < 12) {
  fail('SUPER_ADMIN_PASSWORD must be at least 12 characters.');
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Find an existing auth user by email, paging through the admin list. */
async function findUserByEmail(target) {
  const wanted = target.toLowerCase();
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => (u.email ?? '').toLowerCase() === wanted);
    if (hit) return hit;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

async function main() {
  console.log(`\n  PoultryOS Control Center — seeding super admin (${email})`);

  // 1. Ensure the auth user exists.
  let user = await findUserByEmail(email);
  if (user) {
    console.log('  • auth user already exists — reusing.');
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: name ?? null },
      app_metadata: { force_password_change: true, platform: 'control-center' },
    });
    if (error) fail(`could not create auth user: ${error.message}`);
    user = data.user;
    console.log('  • created auth user (forced password change on first login).');
  }

  // 2. Promote to platform super_admin (idempotent).
  const { data: adminId, error: rpcErr } = await admin.rpc(
    'platform_bootstrap_super_admin',
    { p_email: email }
  );

  if (rpcErr) {
    if (/already seeded/i.test(rpcErr.message)) {
      // Verify THIS user is the seeded admin; if not, the operator must use
      // the Access Control UI to add further admins.
      const { data: existing } = await admin
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) {
        console.log('  • already a platform super admin — nothing to do.');
      } else {
        console.log(
          '  • a different platform admin is already seeded. Use /admin/access to add this operator.'
        );
      }
    } else {
      fail(`promotion failed: ${rpcErr.message}`);
    }
  } else {
    console.log(`  • promoted to super_admin (platform_admins.id=${adminId}).`);
  }

  console.log('\n  ✓ Done. Sign in at /login, then rotate the seed password.\n');
}

main().catch((e) => fail(e?.message ?? String(e)));
