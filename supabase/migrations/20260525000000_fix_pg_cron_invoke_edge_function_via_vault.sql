-- Recovered from the applied database migration history.
-- This migration ran on the live DB but its file was lost in the folder restructure.
-- Name: fix_pg_cron_invoke_edge_function_via_vault

-- Repair broken pg_cron jobs that referenced `app.edge_function_base_url`
-- and `app.edge_function_service_key` GUCs that were never set on the cluster
-- (resulting in "unrecognized configuration parameter" failures for every run).

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

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
                              'Content-Type', 'application/json',
                              'Authorization', 'Bearer ' || v_service_key
                            ),
    body                 := p_body,
    timeout_milliseconds := 60000
  )
  INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE ALL ON FUNCTION private.invoke_edge_function(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.invoke_edge_function(text, jsonb) TO postgres, service_role;

COMMENT ON FUNCTION private.invoke_edge_function(text, jsonb) IS
  'pg_cron helper. Reads edge_function_base_url + edge_function_service_key from Vault, POSTs to /functions/v1{path}. Service-role-scoped.';

SELECT cron.alter_job(job_id := 1::bigint, command := $cmd$SELECT private.invoke_edge_function('/fetch-weather-data');$cmd$);
SELECT cron.alter_job(job_id := 2::bigint, command := $cmd$SELECT private.invoke_edge_function('/send-vaccination-reminders');$cmd$);
SELECT cron.alter_job(job_id := 3::bigint, command := $cmd$SELECT private.invoke_edge_function('/send-low-stock-alerts');$cmd$);
SELECT cron.alter_job(job_id := 4::bigint, command := $cmd$SELECT private.invoke_edge_function('/send-daily-digest');$cmd$);
SELECT cron.alter_job(job_id := 5::bigint, command := $cmd$SELECT private.invoke_edge_function('/send-payment-reminders');$cmd$);