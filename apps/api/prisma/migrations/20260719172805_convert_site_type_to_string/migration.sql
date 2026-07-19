-- Convert sites.type from enum "SiteType" to plain text (admin-configurable via
-- the settings lookup catalog, category 'site_type'). Non-destructive: the
-- existing enum values are cast to their text representation.

-- AlterTable
ALTER TABLE "sites" ALTER COLUMN "type" TYPE TEXT USING "type"::text;

-- DropEnum
DROP TYPE "SiteType";
