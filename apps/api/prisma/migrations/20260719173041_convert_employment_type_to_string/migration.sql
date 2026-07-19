-- Convert employees.employment_type from enum "EmploymentType" to plain text
-- (admin-configurable via the settings lookup catalog, category 'employment_type').
-- Non-destructive: the existing enum values are cast to their text representation.

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "employment_type" TYPE TEXT USING "employment_type"::text;

-- DropEnum
DROP TYPE "EmploymentType";
