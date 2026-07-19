-- Convert employees.pay_mode from enum "PayMode" to plain text
-- (admin-configurable via the settings lookup catalog, category 'pay_mode').
-- Non-destructive: existing enum values are cast to their text representation.

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "pay_mode" TYPE TEXT USING "pay_mode"::text;

-- DropEnum
DROP TYPE "PayMode";
