# PoultryOS — Monorepo

Cross-platform poultry-farm management SaaS + an internal operator Control Center.

## Repository layout

```
.
├─ backend  →  supabase/        PostgreSQL migrations + Edge Functions (the ONE shared backend)
├─ mobile-app/                  Expo (React Native) — farmer mobile app
├─ frontend/                    Next.js 14 — customer web dashboard
├─ saas-control-center/         Next.js 14 — internal operator Control Center (separate app)
├─ packages/shared/             @poultryos/shared — code shared across apps
├─ docs:  PRD.md TRD.md DESIGN.md CLAUDE.md
└─ tests/ tasks/
```

> **Why `supabase/` isn't renamed to `backend/`:** PoultryOS is Supabase-native — there is
> exactly one backend (Postgres + RLS + Edge Functions), shared by all three apps. The
> Supabase CLI hard-requires the folder be named `supabase/`, and the local dev stack is
> bound to it, so it keeps that name. It *is* the backend.

## The three apps, and how they relate

| App | Folder | Port | Purpose |
|-----|--------|------|---------|
| Mobile | `mobile-app/` | Expo | Farmers: daily logs, flocks, khata, weather |
| Customer web | `frontend/` | 3000 | Farm owners: full web dashboard |
| **Control Center** | `saas-control-center/` | 3001 | **PoultryOS operators**: tenants, plans, discounts, revenue, support, errors, audit, RBAC, flags, system |

All three talk to the **same** Supabase backend. The Control Center sits *above* tenant RLS
(operators are `platform_admins`, not tenant members) and reaches data through a server-only
service-role client behind an audited permission guard.

## Run locally

```bash
# 0. Backend (local Supabase stack)
supabase start                      # serves http://127.0.0.1:54321

# 1. Customer web dashboard
cd frontend && cp .env.example .env.local   # fill in Supabase URL + anon key
npm install && npm run dev                  # http://localhost:3000

# 2. SaaS Control Center
cd saas-control-center && cp .env.example .env.local
#   set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY
npm install && npm run dev                  # http://localhost:3001  → redirects to /admin

# 3. Mobile app
cd mobile-app && npm install && npx expo start
```

### First-time Control Center access
The Control Center needs a bootstrapped super admin:
```sql
-- after the operator has a normal auth user (sign up at /login):
SELECT public.platform_bootstrap_super_admin('operator@poultryos.app');
```
Then open http://localhost:3001 and sign in.

## Backend / migrations

Migrations live in `supabase/migrations/` and are the canonical schema history — never delete
them. Apply locally with `supabase db reset` (replays all) or `supabase migration up`.
The Control Center schema is the `…000008`–`…000018` migrations (platform RBAC, audit, tenant
ops, dynamic plans, discounts, health, revenue, support, errors, feature flags, system).
