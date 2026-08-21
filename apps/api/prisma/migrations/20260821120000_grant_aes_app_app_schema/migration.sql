-- Grant the runtime RLS-subject role (aes_app) access to the `app` schema.
--
-- Multi-schema Prisma puts financial tables in schema `app` (owned by the `aes`
-- owner). Provisioning grants aes_app on `public` only, so runtime queries that
-- touch `app` failed with "permission denied for schema app" (login worked, but
-- /auth/me and schedulers 500'd). This migration fixes that for every fresh DB.
--
-- Guarded: in environments that don't use the two-role model (local dev / CI often
-- run everything as one user), the aes_app role doesn't exist, so this is a no-op.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'aes_app') THEN
    GRANT USAGE ON SCHEMA app TO aes_app;
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO aes_app;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO aes_app;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO aes_app;
    -- Future objects the owner creates in `app` are auto-granted to aes_app.
    ALTER DEFAULT PRIVILEGES FOR ROLE aes IN SCHEMA app
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aes_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE aes IN SCHEMA app
      GRANT USAGE, SELECT ON SEQUENCES TO aes_app;
    ALTER DEFAULT PRIVILEGES FOR ROLE aes IN SCHEMA app
      GRANT EXECUTE ON FUNCTIONS TO aes_app;
  END IF;
END $$;
