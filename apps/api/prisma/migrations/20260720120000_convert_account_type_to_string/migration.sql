-- Convert accounts.type from the AccountType enum to a plain string so it can be
-- validated against the admin-managed lookup catalog (category 'account_type').
-- Non-destructive: cast existing values to text, then drop the now-unused enum type.
ALTER TABLE "accounts" ALTER COLUMN "type" TYPE TEXT USING "type"::text;

DROP TYPE "AccountType";
