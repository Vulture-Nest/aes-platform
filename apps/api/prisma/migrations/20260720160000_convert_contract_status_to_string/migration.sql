-- Convert contracts.status from the ContractStatus enum to a plain string so it
-- can be validated against the admin-managed lookup catalog ('contract_status').
-- Non-destructive: drop the enum default, cast to text, re-add the text default,
-- then drop the now-unused enum type.
ALTER TABLE "contracts" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "contracts" ALTER COLUMN "status" TYPE TEXT USING "status"::text;
ALTER TABLE "contracts" ALTER COLUMN "status" SET DEFAULT 'UPCOMING';

DROP TYPE "ContractStatus";
