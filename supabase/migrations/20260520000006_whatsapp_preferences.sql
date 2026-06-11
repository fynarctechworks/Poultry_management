-- Add per-category WhatsApp notification preferences on profiles.
-- Default: all 6 Meta-approved categories enabled. Users can opt out of
-- specific categories from the WhatsApp Settings screen without losing
-- the global whatsapp_opt_in flag.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_preferences JSONB
    NOT NULL
    DEFAULT jsonb_build_object(
      'daily_digest',          true,
      'mortality_alert',       true,
      'vaccination_reminder',  true,
      'heat_stress_alert',     true,
      'payment_reminder',      true,
      'low_stock_alert',       true
    );

UPDATE public.profiles
   SET whatsapp_preferences = jsonb_build_object(
     'daily_digest',          true,
     'mortality_alert',       true,
     'vaccination_reminder',  true,
     'heat_stress_alert',     true,
     'payment_reminder',      true,
     'low_stock_alert',       true
   )
 WHERE whatsapp_preferences IS NULL
    OR whatsapp_preferences = '{}'::jsonb;

COMMENT ON COLUMN public.profiles.whatsapp_preferences IS
  'Per-category WhatsApp notification opt-in flags. Keys map to the 6 Meta-approved template IDs. send-whatsapp-message checks this before dispatching.';
