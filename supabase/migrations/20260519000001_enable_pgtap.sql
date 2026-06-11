-- Migration: 20260519000001_enable_pgtap
-- Enables the pgTAP extension in the `extensions` schema so we can run
-- pgTAP-style assertions against the database from tests/db/*.test.sql.
--
-- pgTAP is a unit testing framework for PostgreSQL: https://pgtap.org
-- Supabase exposes it as a queryable extension; installing it under the
-- dedicated `extensions` schema keeps `public` clean.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

COMMIT;
