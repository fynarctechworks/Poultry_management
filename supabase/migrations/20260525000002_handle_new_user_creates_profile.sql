-- Recovered from the applied database migration history.
-- This migration ran on the live DB but its file was lost in the folder restructure.
-- Name: handle_new_user_creates_profile

-- Auto-create a `profiles` row for every new auth.users insert.
--
-- Why this is needed: the client-side register flow does
-- `supabase.auth.signUp()` then `supabase.from('profiles').upsert(...)` —
-- but at the upsert moment the browser has no session (email-confirmation
-- is on), so RLS rejects the insert silently. Result: every signup since
-- launch ended up with an auth.users row but no profiles row, breaking
-- every downstream join (farm_id, role, subscription_status, WhatsApp).
--
-- The Supabase-recommended pattern is a SECURITY DEFINER trigger on
-- auth.users that runs server-side with full privileges.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, phone)
  VALUES (
    NEW.id,
    COALESCE(
      NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
      NULLIF(split_part(NEW.email, '@', 1), ''),
      'Farmer'
    ),
    NULLIF(NEW.raw_user_meta_data->>'phone', '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

COMMENT ON FUNCTION public.handle_new_user() IS
  'Trigger fn: creates a profiles row for each new auth.users insert. Reads full_name + phone from raw_user_meta_data populated by the register form.';

-- Backfill orphaned users (auth.users without a profiles row).
INSERT INTO public.profiles (id, full_name, phone)
SELECT
  u.id,
  COALESCE(
    NULLIF(u.raw_user_meta_data->>'full_name', ''),
    NULLIF(split_part(u.email, '@', 1), ''),
    'Farmer'
  ) AS full_name,
  NULLIF(u.raw_user_meta_data->>'phone', '') AS phone
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = u.id);