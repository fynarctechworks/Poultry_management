-- Recovered from the applied database migration history.
-- This migration ran on the live DB but its file was lost in the folder restructure.
-- Name: fix_invoke_edge_function_add_apikey_header

-- Supabase Edge Function gateway requires `apikey` header in addition to
-- `Authorization: Bearer`. The service_role JWT can satisfy both.

CREATE OR REPLACE FUNCTION private.invoke_edge_function(
  p_path text,
  p_body jsonb DEFAULT '{}'::jsonb
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_base_url    text;
  v_service_key text;
  v_request_id  bigint;
BEGIN
  SELECT decrypted_secret INTO v_base_url
  FROM vault.decrypted_secrets
  WHERE name = 'edge_function_base_url'
  LIMIT 1;

  SELECT decrypted_secret INTO v_service_key
  FROM vault.decrypted_secrets
  WHERE name = 'edge_function_service_key'
  LIMIT 1;

  IF v_base_url IS NULL OR v_service_key IS NULL THEN
    RAISE EXCEPTION
      'Edge function secrets missing in Vault: base_url=%, service_key_present=%',
      v_base_url IS NOT NULL, v_service_key IS NOT NULL;
  END IF;

  SELECT net.http_post(
    url                  := v_base_url || p_path,
    headers              := jsonb_build_object(
                              'Content-Type',  'application/json',
                              'apikey',        v_service_key,
                              'Authorization', 'Bearer ' || v_service_key
                            ),
    body                 := p_body,
    timeout_milliseconds := 60000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;