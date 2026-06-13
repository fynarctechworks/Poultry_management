-- SEC-2: Drop the anon-callable email-confirmation backdoor.
--
-- public.dev_confirm_email(text) was SECURITY DEFINER and granted EXECUTE to
-- anon. It set auth.users.email_confirmed_at for any matching email with NO
-- authorization check. The anon key ships in the client bundle, so any
-- unauthenticated caller could confirm any account's email by calling the RPC
-- directly — the DEV_EMAIL_VERIFY env flag in the Next.js route never gated the
-- database, only the UI path.
--
-- The dev "Verify now" convenience is preserved by moving it server-side to the
-- Supabase Admin API (service-role key, never exposed to the browser) in
-- frontend/app/auth/dev-verify/route.ts. No anon-callable surface remains.

DROP FUNCTION IF EXISTS public.dev_confirm_email(text);
