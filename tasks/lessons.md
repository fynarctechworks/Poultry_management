# Lessons Learned

## Day 2 — 2026-05-02 — Initial schema migration

### L1. PostgreSQL `GENERATED ALWAYS AS … STORED` requires IMMUTABLE expressions
**What broke**: First migration apply failed with `ERROR: 42P17 generation expression is not immutable`.
**Root cause**: Two generated columns used non-IMMUTABLE expressions:
  - `(withdrawal_days || ' days')::INTERVAL` — text-to-INTERVAL cast is STABLE due to locale-dependent parsing
  - `(jsonb_col->'k1'->>'k2')::NUMERIC` — JSONB chain + numeric cast also fails the IMMUTABLE check on PG 15+
**Fix**:
  - For date math: prefer `date + integer` (returns DATE, IMMUTABLE) over `date + (text || ' days')::INTERVAL` (returns TIMESTAMP, STABLE)
  - For JSONB-derived columns: don't try to GENERATE them. Make them regular columns and have the application layer (or trigger) populate them.
**Rule for next time**: Before writing `GENERATED ALWAYS AS … STORED`, mentally verify each function/operator in the expression is `IMMUTABLE` (check `pg_proc.provolatile = 'i'`). If anything in the chain is `STABLE` or `VOLATILE`, the column must be regular + trigger-maintained.

### L2. Supabase MCP `apply_migration` wraps in its own transaction
**What broke**: My migration file had explicit `BEGIN;` / `COMMIT;` for documentation and stand-alone `psql` use, but `mcp__supabase__apply_migration` already runs the whole statement in a transaction. The explicit `BEGIN;` was a no-op (warning) but the explicit `COMMIT;` would have prematurely ended the outer transaction.
**Fix**: Strip transaction-control statements before sending to the MCP tool. Keep them in the on-disk file so manual `psql -f` still works correctly.
**Rule for next time**: When applying via MCP, send only DDL/DML — let the MCP harness manage the transaction. Keep `BEGIN/COMMIT` in the file as documentation only.

### L3. Supabase advisor flags every SECURITY DEFINER function exposed via PostgREST
**What broke**: Advisor flagged 12 instances (anon + authenticated × 6 functions) of "Public Can Execute SECURITY DEFINER Function".
**Root cause**: Any function in the `public` schema is auto-exposed via `/rest/v1/rpc/<name>` by PostgREST. SECURITY DEFINER functions there are a privilege-escalation surface unless you explicitly scope them.
**Fix**: For SECURITY DEFINER functions that are *only* called from RLS policies and triggers (never via API), `REVOKE EXECUTE … FROM anon, authenticated, public;`. Policy/trigger calls go through the planner directly and still work.
**Rule for next time**: SECURITY DEFINER + `public` schema = always pair with REVOKE on `anon, authenticated, public`. Same migration; one-and-done.

> ⚠️ **CORRECTION (2026-06-13) — the claim above about RLS policies is WRONG and dangerous.**
> PostgreSQL **does** enforce EXECUTE privilege on functions invoked from RLS USING/CHECK
> expressions — SECURITY DEFINER does not exempt them. Revoking EXECUTE from `authenticated`
> on an RLS-helper function caused `permission denied for function is_farm_member` lockouts on
> every table whose policy calls it (see migration `20260521000000_restore_rls_helper_execute`).
> **Triggers** are different: a trigger function fires under the table-owner context, so revoking
> the *invoking* user's EXECUTE does NOT break triggers.
> **Correct rule:** RLS-helper functions → KEEP EXECUTE for whatever roles run queries against the
> protected tables (almost always `authenticated`; also `anon` if any policy is `TO public`, which
> is the default — 84/92 of ours are). Only trigger-only / internal-PERFORM-only / never-in-RLS
> functions are safe to fully revoke. Admin RPCs (cc_*) → revoke `anon`, keep `authenticated`
> (internal `cc_assert_permission` enforces). See migration
> `20260613170001_revoke_anon_execute_on_privileged_functions` for the triaged approach.

### L4. Always pin `search_path` on functions, especially SECURITY DEFINER
**What broke**: Advisor flagged 10 functions with `function_search_path_mutable`.
**Root cause**: A function without an explicit `SET search_path` inherits the caller's search_path. A malicious user can prepend a schema with shadow definitions of `pg_catalog`-style names and hijack execution inside SECURITY DEFINER code.
**Fix**: `ALTER FUNCTION … SET search_path = public, pg_temp;` (add `extensions, net` for functions that touch pg_net).
**Rule for next time**: Every function we ship gets `SET search_path` baked in at `CREATE FUNCTION` time, not as a follow-up. Inline syntax: `CREATE FUNCTION … LANGUAGE plpgsql SET search_path = public, pg_temp AS $$ … $$`.

### L6. Strict `IN (7, 15, 30)` date filter breaks reminder cron resilience
**What broke**: `check_payment_overdue()` used `WHERE o.days_overdue IN (7, 15, 30)` — any payment overdue for 8, 16, or 31 days (cron missed a day, or payment recorded late) returns zero rows and the reminder is silently skipped forever.
**Root cause**: Confusing "these are the days we want to remind on" (stage definition) with "these are the only values the function should return" (filter). The CASE expression correctly handles ≥7, ≥15, ≥30, but the WHERE clause was copied verbatim from the spec and undermined the CASE logic.
**Fix**: Replace `WHERE days_overdue IN (7, 15, 30)` with `WHERE reminder_stage IS NOT NULL`. The existing `NOT EXISTS (SELECT 1 FROM payment_reminders WHERE … same stage)` guard already prevents double-sends.
**Rule for next time**: For any cron-driven reminder/escalation function: use range checks (`>= N`), not equality (`= N`). The NOT EXISTS dedup is the guard against re-firing; the WHERE clause should just pass all eligible rows.

### L7. Jest + jest-expo: must use jest@29 and react-test-renderer@matching-react
**What broke**: Installing `jest@30` (latest) with `jest-expo@55` caused `this._moduleMocker.clearMocksOnScope is not a function` at runtime. Installing `react-test-renderer@19.2.0` (shipped by jest-expo) with `react@19.1.0` caused `@testing-library/react-native` peer dep check to fail.
**Root cause**: `jest-expo@55` ships `@jest/globals@^29` internally; its `babel-jest@^29` and `jest-snapshot@^29` require jest@29. Using jest@30 breaks internal module compatibility. `react-test-renderer` must exactly match the `react` version in the project.
**Fix**: `npm install --save-dev jest@29 react-test-renderer@19.1.0`. The `jest-expo` package will use the local `jest` binary.
**Rule for next time**: When adding jest to a project using `jest-expo`, pin to `jest@29` (the version declared in jest-expo's internal `@jest/*` deps). Always pin `react-test-renderer` to exactly the same version as `react`.

### L8. RNTL `getByRole('button')` on a disabled Pressable: fireEvent.press fires regardless
**What broke**: Tests asserting `expect(onPress).not.toHaveBeenCalled()` after `fireEvent.press` on a Pressable with `onPress={undefined}` (the disabled pattern) failed — RNTL's `fireEvent.press` synthesizes the press event regardless of the `onPress` prop value.
**Root cause**: RNTL's `fireEvent` uses RN's event system and does not check whether `onPress` is `undefined` before firing. The component correctly sets `onPress={isDisabled ? undefined : onPress}`, but RNTL bypasses this.
**Fix**: Don't test "callback not called on press when disabled" — test the accessibility contract instead: assert `accessibilityState.disabled === true` and `accessibilityState.busy === true`. These are the correct behavioral assertions for disabled/loading buttons.
**Rule for next time**: For disabled-state Button tests use `expect(btn.props.accessibilityState).toMatchObject({ disabled: true })`. Never rely on `fireEvent.press` to be blocked by an undefined `onPress`.

### L9. RNTL getByRole requires `accessible={true}` on non-interactive Views
**What broke**: `getByRole('progressbar')` on a `View` with `accessibilityRole="progressbar"` failed. The `isAccessibilityElement` check in RNTL returns `false` for plain Views unless `accessible={true}` is explicitly set.
**Root cause**: RNTL's `getByRole` calls `isAccessibilityElement(node)` which checks for `node.props.accessible !== undefined` first. For `View` elements, `accessible` is not set by default, so it falls back to `isHostText || isHostTextInput || isHostSwitch` — all false for a View.
**Fix**: Add `accessible` prop to any non-interactive `View` that needs to be queryable by role: `<View accessible accessibilityRole="progressbar" ...>`.
**Rule for next time**: Whenever a `View` needs a non-standard `accessibilityRole`, also add `accessible` prop. Interactive elements (Pressable, TextInput, etc.) are automatically accessible. Plain Views are not.

### L10. Tests in external directories (outside PoultryOS/) need explicit modulePaths in jest.config
**What broke**: Test files in `tests/components/` (sibling of `PoultryOS/`) couldn't resolve `@react-native-async-storage/async-storage` or `@babel/runtime` — both installed in `PoultryOS/node_modules`.
**Root cause**: Jest's `rootDir` is `PoultryOS/`, so it looks for modules in `PoultryOS/node_modules`. When test files live in `../tests/components/`, the relative `node_modules` lookup path is different.
**Fix**: Add `modulePaths: ['<rootDir>/node_modules']` and `moduleDirectories: ['node_modules', '<rootDir>/node_modules']` to `jest.config.js`. This makes the PoultryOS node_modules visible to tests anywhere in the `roots` array.
**Rule for next time**: Whenever tests live outside `rootDir`, add explicit `modulePaths` pointing to the correct `node_modules`. The `roots` config controls where Jest looks for test files; `modulePaths` controls where it resolves imports.

### L11. weather_data requires UNIQUE(farm_id) for UPSERT; max_temp_today is a regular column
**What broke (caught before deploy)**: The initial schema defined `weather_data` with `farm_id` as a non-unique FK — only an index. UPSERT `onConflict: "farm_id"` fails with "no unique or exclusion constraint matching the ON CONFLICT specification" unless a UNIQUE constraint exists.
**Root cause**: CLAUDE.md spec says "one row per farm" but the initial migration didn't enforce it with a UNIQUE constraint. Also, L1 lesson explains why `max_temp_today` can't be a GENERATED column (JSONB aggregate → numeric cast is STABLE). It was defined as a regular column but the original function skeleton had a stale comment saying "GENERATED — do NOT set".
**Fix**: Migration 20260519000002 adds `ADD CONSTRAINT weather_data_farm_id_unique UNIQUE (farm_id)`. Function explicitly computes and sets `max_temp_today` from the 24h hourly forecast reduce.
**Rule for next time**: When CLAUDE.md says "one row per X", always add a UNIQUE constraint in the same migration that creates the table. Don't rely on the application layer to enforce it.

### L12. pg_cron body must use existing DB settings — align with tg_post_to_edge_function
**What would have broken**: The spec said `app.settings.supabase_url` + `app.settings.service_role_key` in the cron template, but the existing `tg_post_to_edge_function` helper in initial_schema uses `app.edge_function_base_url` + `app.edge_function_service_key`. Two different setting names for the same values.
**Fix**: Changed cron migration to use `app.edge_function_base_url` and `app.edge_function_service_key` — consistent with the existing trigger helper. User configures once, both triggers and cron work.
**Rule for next time**: Before writing any `current_setting('app.*')` call, grep the existing migrations for what's already in use. Don't follow the spec template verbatim if it conflicts with established codebase conventions.

### L13. supabase-js UPSERT with onConflict must name the UNIQUE constraint column, not the FK column
**Note**: `onConflict: "farm_id"` in supabase-js upsert refers to the column name, and requires that column to have a UNIQUE or PK constraint. A plain FK + index is not sufficient.

### L14. Deno node:crypto HMAC values differ from OpenSSL CLI for identical inputs
**What broke**: A known-value test for HMAC-SHA256("key", "The quick brown fox") was written using the digest obtained from `openssl dgst -sha256 -hmac 'key'` on macOS. Deno's `node:crypto` shim (via V8's BoringSSL) produced a different hex value (`203d1e5c...` vs `0f1f955b...`) for the same inputs.
**Root cause**: The OpenSSL CLI `openssl dgst -hmac <key>` may use a different encoding path or the test string included a newline from the shell. Deno's `node:crypto` and the browser SubtleCrypto produce the same result; the openssl CLI echo may have included `\n`.
**Fix**: Derive known-value HMAC test vectors by running `computeHmac(secret, body)` once inside Deno itself and recording the output, not from an external shell command. Alternatively, verify with `echo -n` (no newline) in the shell.
**Rule for next time**: Never hardcode HMAC test vectors from `openssl` CLI without `echo -n`. Generate them from the same runtime (Deno / Node) that the production code uses, or use a well-known RFC test vector (RFC 4231) which specifies exact byte inputs with no ambiguity.

### L5. `pg_net` cannot be relocated out of `public` schema
**What broke**: `ALTER EXTENSION pg_net SET SCHEMA extensions` returns `0A000: extension "pg_net" does not support SET SCHEMA`.
**Root cause**: pg_net is implemented to live in `public` (and creates its own `net` schema for the actual functions). The `extension_in_public` advisor warning is permanent for pg_net on Supabase.
**Rule for next time**: Don't try to fix this advisor warning. Document it as accepted in the hardening migration. The actual `net.http_post` is in the `net` schema (correct) — only the extension's metadata sits in public.
