-- Row-Level Security for site-scoped tables (Prompt 2 / spec §5, §16).
--
-- The application connects as a non-privileged role (aes_app, provisioned by
-- prisma/rls/aes_app_role.sql) and stamps the caller's site scope into two
-- transaction-local GUCs before every query:
--   * app.bypass_rls = 'on'  -> see/act on all rows (system jobs, cron, global roles)
--   * app.site_ids   = 'uuid,uuid,...' -> the sites the caller is scoped to
-- The policies below read those GUCs. NULL site_id rows are shared/global records
-- (e.g. the chart of accounts, the global approval matrix) and are visible to everyone.
--
-- NOTE: superusers (and the migration/owner role) bypass RLS regardless of these
-- policies, so applying this migration while still connected as the owner is a no-op
-- at runtime until DATABASE_URL is pointed at aes_app.

CREATE SCHEMA IF NOT EXISTS app;

-- Parse app.site_ids into a uuid[]; empty/unset -> empty array.
CREATE OR REPLACE FUNCTION app.current_site_ids() RETURNS uuid[]
  LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN coalesce(current_setting('app.site_ids', true), '') = '' THEN ARRAY[]::uuid[]
    ELSE string_to_array(current_setting('app.site_ids', true), ',')::uuid[]
  END
$$;

CREATE OR REPLACE FUNCTION app.rls_bypass() RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT coalesce(current_setting('app.bypass_rls', true), 'off') = 'on'
$$;

-- A row is visible/writable when the caller bypasses RLS, the row is global (NULL site),
-- or the row's site is in the caller's scoped set.
CREATE OR REPLACE FUNCTION app.rls_visible(row_site_id uuid) RETURNS boolean
  LANGUAGE sql STABLE AS $$
  SELECT app.rls_bypass()
      OR row_site_id IS NULL
      OR row_site_id = ANY (app.current_site_ids())
$$;

-- Enable + FORCE RLS and attach a symmetric site-isolation policy to every site-scoped
-- table. FORCE makes the policy apply even to the table owner (superusers still bypass).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'accounts',
    'approval_chains',
    'approval_matrix',
    'budgets',
    'compliance_obligations',
    'employees',
    'payroll_runs',
    'petty_cash_floats',
    'requisitions',
    'timesheet_periods',
    'travel_requests',
    'user_site_roles'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_site_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY rls_site_isolation ON %I USING (app.rls_visible(site_id)) WITH CHECK (app.rls_visible(site_id))',
      t
    );
  END LOOP;
END $$;
