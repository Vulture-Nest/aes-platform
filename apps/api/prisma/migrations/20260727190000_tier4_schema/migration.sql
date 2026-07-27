-- Tier-4 completeness schema sweep. Additive + nullable throughout (plus one
-- uniqueness index and two new tables). Safe to run on an already-migrated DB.
--
-- Contents:
--   G17 — missing spec §6 fields (nullable) on clients / orders / order_expenses /
--         contract_claims / overheads.
--   G18 — order_milestones table (partial servicing, Appendix B.2a).
--   G21 — she_records table (structured SHE capture, site-scoped → RLS + GRANT).
--   G25 — petty_cash_floats unique (site_id, currency).
--
-- The app connects as the non-privileged aes_app role, so both NEW tables get an
-- explicit GRANT, and the SITE-SCOPED she_records table gets the same RLS + policy
-- as the existing site-scoped tables (app.rls_visible(site_id)).

-- ---------------------------------------------------------------------------
-- G17 — missing spec §6 fields (all nullable / defaulted, additive).
-- ---------------------------------------------------------------------------
ALTER TABLE "clients" ADD COLUMN "vat_number" TEXT;
ALTER TABLE "clients" ADD COLUMN "payment_terms" TEXT;
ALTER TABLE "clients" ADD COLUMN "currency_ratio_default" DECIMAL(10,6);

ALTER TABLE "orders" ADD COLUMN "title" TEXT;
ALTER TABLE "orders" ADD COLUMN "issue_date" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "advance_payment" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "order_expenses" ADD COLUMN "category" TEXT;

ALTER TABLE "contract_claims" ADD COLUMN "vat_paid_to_date" DECIMAL(20,2);
ALTER TABLE "contract_claims" ADD COLUMN "received_date" TIMESTAMP(3);

ALTER TABLE "overheads" ADD COLUMN "paye_due" DECIMAL(20,2);
ALTER TABLE "overheads" ADD COLUMN "paye_paid" DECIMAL(20,2);

-- ---------------------------------------------------------------------------
-- G18 — order_milestones (partial servicing, Appendix B.2a). Cascade-deleted
-- with its order; indexed on order_id.
-- ---------------------------------------------------------------------------
CREATE TABLE "order_milestones" (
  "id"              UUID          NOT NULL,
  "order_id"        UUID          NOT NULL,
  "description"     TEXT          NOT NULL,
  "value_portion"   DECIMAL(20,2) NOT NULL DEFAULT 0,
  "percent_portion" DECIMAL(5,2),
  "completed_at"    TIMESTAMP(3),
  "created_by"      UUID,
  "created_at"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"      UUID,
  "updated_at"      TIMESTAMP(3)  NOT NULL,
  CONSTRAINT "order_milestones_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "order_milestones_order_id_idx" ON "order_milestones"("order_id");
ALTER TABLE "order_milestones"
  ADD CONSTRAINT "order_milestones_order_id_fkey"
  FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- G21 — she_records (structured SHE capture, site-scoped). Indexed on site_id.
-- ---------------------------------------------------------------------------
CREATE TABLE "she_records" (
  "id"                  UUID         NOT NULL,
  "entity_id"           UUID,
  "site_id"             UUID         NOT NULL,
  "type"                TEXT         NOT NULL,
  "title"               TEXT         NOT NULL,
  "description"         TEXT,
  "severity"            TEXT,
  "occurred_at"         TIMESTAMP(3) NOT NULL,
  "investigation"       TEXT,
  "lti"                 BOOLEAN      NOT NULL DEFAULT false,
  "status"              TEXT         NOT NULL DEFAULT 'OPEN',
  "reported_by_user_id" UUID,
  "created_by"          UUID,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by"          UUID,
  "updated_at"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "she_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "she_records_site_id_idx" ON "she_records"("site_id");

-- ---------------------------------------------------------------------------
-- G25 — petty_cash_floats: one float per (site, currency). The current DB holds
-- at most one float per (site, currency), so adding the unique index is safe;
-- the service's createFloat guard now rejects duplicates with a ConflictException.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX "petty_cash_floats_site_id_currency_key"
  ON "petty_cash_floats"("site_id", "currency");

-- ---------------------------------------------------------------------------
-- GRANTs — the app connects as the non-privileged aes_app role, so every new
-- table must be explicitly granted (UUID PKs → no sequences to grant).
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON "order_milestones" TO aes_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "she_records" TO aes_app;

-- ---------------------------------------------------------------------------
-- Row-Level Security for the SITE-SCOPED she_records table. Same pattern as the
-- row_level_security migration: ENABLE + FORCE RLS and attach the symmetric
-- site-isolation policy reading app.site_ids / app.bypass_rls via
-- app.rls_visible(site_id). NULL site_id rows would be global/visible-to-all,
-- but she_records.site_id is NOT NULL so every row is site-scoped.
-- order_milestones is NOT site-scoped (it inherits access via its order) and
-- deliberately keeps RLS OFF.
-- ---------------------------------------------------------------------------
ALTER TABLE "she_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "she_records" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rls_site_isolation ON "she_records";
CREATE POLICY rls_site_isolation ON "she_records"
  USING (app.rls_visible(site_id))
  WITH CHECK (app.rls_visible(site_id));
