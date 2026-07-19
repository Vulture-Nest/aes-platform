-- Convert the "Role" enum columns to plain text
-- (admin-configurable via the settings lookup catalog, category 'role').
-- Non-destructive: existing enum values are cast to their text representation,
-- so seeded rows (e.g. the SYS_ADMIN admin user, the FINANCE_DIRECTOR fd@aes.local)
-- keep their roles. The dependent unique index on user_site_roles is rebuilt
-- automatically by the in-place ALTER COLUMN ... TYPE cast.

-- AlterTable
ALTER TABLE "user_site_roles" ALTER COLUMN "role" TYPE TEXT USING "role"::text;

-- AlterTable
ALTER TABLE "approval_matrix" ALTER COLUMN "approver_role" TYPE TEXT USING "approver_role"::text;

-- AlterTable
ALTER TABLE "approvals" ALTER COLUMN "approver_role" TYPE TEXT USING "approver_role"::text;

-- DropEnum
DROP TYPE "Role";
