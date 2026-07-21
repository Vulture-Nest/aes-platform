-- Provision the non-privileged application role that the API connects as at runtime, so
-- Postgres RLS actually takes effect (superusers and the owner role bypass RLS). Run this
-- ONCE per environment as a superuser / the database owner:
--
--   docker exec -i aes-postgres psql -U aes -d aes -f - < prisma/rls/aes_app_role.sql
--
-- then point the app's DATABASE_URL at aes_app. Migrations continue to run as the owner
-- (aes), which retains DDL rights; aes_app deliberately cannot run DDL (least privilege).
--
-- The password here is for LOCAL DEV ONLY. In staging/production, provision the role with a
-- strong secret out-of-band (or ALTER ROLE ... PASSWORD) and keep it out of version control.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aes_app') THEN
    CREATE ROLE aes_app LOGIN PASSWORD 'aes_app_local_dev';
  END IF;
END $$;

-- Not a superuser, cannot bypass RLS: these are the defaults, but assert them explicitly
-- so an accidentally-elevated role gets corrected on re-run.
ALTER ROLE aes_app NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;

GRANT USAGE ON SCHEMA public TO aes_app;
GRANT USAGE ON SCHEMA app TO aes_app;

-- CRUD on existing tables + sequences, and EXECUTE on the RLS helper functions.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aes_app;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO aes_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO aes_app;

-- Same grants for anything the owner creates in future migrations.
ALTER DEFAULT PRIVILEGES FOR ROLE aes GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aes_app;
ALTER DEFAULT PRIVILEGES FOR ROLE aes GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO aes_app;
ALTER DEFAULT PRIVILEGES FOR ROLE aes IN SCHEMA app GRANT EXECUTE ON FUNCTIONS TO aes_app;

-- Audit hardening (Prompt 2): the audit log is append-only. The app role may INSERT and
-- SELECT but never UPDATE, DELETE or TRUNCATE audit history.
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM aes_app;
