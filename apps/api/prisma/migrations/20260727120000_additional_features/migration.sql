-- Additional Features (Prompt 27) — schema foundation for 7 new feature areas
-- (BD/marketing, confidential boards, project WBS, statutory returns + WHT,
-- back-pay + acting allowances, monthly site reports + performance/RAG) plus the
-- multinational/entity dimension.
--
-- Structure of this migration:
--   1. New enums.
--   2. entity_id (and marketing attribution) columns on existing tables.
--   3. New tables, indexes and foreign keys (Prisma-generated diff).
--   4. Seed a single default entity (AES Zimbabwe) with a FIXED uuid and backfill
--      the new entity_id columns on existing rows so nothing is left orphaned.
--   5. GRANT CRUD on every new table to the non-privileged aes_app role (RLS is
--      enforced because the app connects as aes_app; without these grants the app
--      gets permission-denied). Non-site-scoped tables get GRANT only (RLS stays
--      off + no policy = app can read/write). Site-scoped new tables (projects,
--      site_report_periods, stores_withdrawals) additionally ENABLE/FORCE RLS and
--      attach the SAME site-isolation policy used by the existing site-scoped
--      tables (app.rls_visible(site_id)).
--
-- NOTE: this migration runs as the owner role (aes), which retains DDL rights and
-- bypasses RLS; the policies below only take effect at runtime when the app
-- connects as aes_app.

-- CreateEnum
CREATE TYPE "BoardVisibility" AS ENUM ('TEAM', 'DIRECTOR_CONFIDENTIAL');

-- CreateEnum
CREATE TYPE "ProjectNodeType" AS ENUM ('PHASE', 'TASK', 'SUBTASK');

-- CreateEnum
CREATE TYPE "WhtDirection" AS ENUM ('SUFFERED', 'PAYABLE');

-- CreateEnum
CREATE TYPE "ActingBasis" AS ENUM ('FIXED', 'PERCENT');

-- CreateEnum
CREATE TYPE "RagStatus" AS ENUM ('GREEN', 'AMBER', 'RED');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "entity_id" UUID;

-- AlterTable
ALTER TABLE "compliance_obligations" ADD COLUMN     "entity_id" UUID;

-- AlterTable
ALTER TABLE "contracts" ADD COLUMN     "entity_id" UUID;

-- AlterTable
ALTER TABLE "crm_opportunities" ADD COLUMN     "campaign_id" UUID,
ADD COLUMN     "entity_id" UUID,
ADD COLUMN     "response_id" UUID;

-- AlterTable
ALTER TABLE "employees" ADD COLUMN     "entity_id" UUID;

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "entity_id" UUID;

-- AlterTable
ALTER TABLE "other_tax_debt" ADD COLUMN     "entity_id" UUID;

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN     "entity_id" UUID;

-- AlterTable
ALTER TABLE "sites" ADD COLUMN     "entity_id" UUID;

-- AlterTable
ALTER TABLE "tax_ledger" ADD COLUMN     "entity_id" UUID;

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "base_currency" TEXT NOT NULL,
    "chart_of_accounts_ref" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Harare',
    "locale" TEXT NOT NULL DEFAULT 'en',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public_holidays" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "public_holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "audience" TEXT,
    "budget" DECIMAL(20,2),
    "currency" TEXT,
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "owner_user_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_channels" (
    "id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "channel_type" TEXT NOT NULL,
    "cost" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currency" TEXT,
    "tracking_link" TEXT,
    "flier_code" TEXT,
    "print_run_qty" INTEGER,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "channel_metrics" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "week_of" TIMESTAMP(3) NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "engagements" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "channel_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_responses" (
    "id" UUID NOT NULL,
    "campaign_id" UUID,
    "channel_id" UUID,
    "person_name" TEXT,
    "org_name" TEXT,
    "contact_email" TEXT,
    "contact_phone" TEXT,
    "received_at" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "how_heard" TEXT,
    "owner_user_id" UUID,
    "opportunity_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boards" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "BoardVisibility" NOT NULL DEFAULT 'TEAM',
    "owner_user_id" UUID,
    "project_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_members" (
    "id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_lists" (
    "id" UUID NOT NULL,
    "board_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "board_cards" (
    "id" UUID NOT NULL,
    "list_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "assignee_id" UUID,
    "due_date" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "board_cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_checklist_items" (
    "id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "text" TEXT NOT NULL,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "card_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_comments" (
    "id" UUID NOT NULL,
    "card_id" UUID NOT NULL,
    "author_id" UUID,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "site_id" UUID,
    "contract_id" UUID,
    "order_id" UUID,
    "owner_user_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "planned_start" TIMESTAMP(3),
    "planned_finish" TIMESTAMP(3),
    "actual_start" TIMESTAMP(3),
    "actual_finish" TIMESTAMP(3),
    "percent_complete" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_nodes" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "parent_id" UUID,
    "type" "ProjectNodeType" NOT NULL,
    "title" TEXT NOT NULL,
    "owner_user_id" UUID,
    "planned_start" TIMESTAMP(3),
    "planned_finish" TIMESTAMP(3),
    "actual_start" TIMESTAMP(3),
    "actual_finish" TIMESTAMP(3),
    "percent_complete" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "weight" DECIMAL(20,4) NOT NULL DEFAULT 1,
    "position" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_dependencies" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "predecessor_node_id" UUID NOT NULL,
    "successor_node_id" UUID NOT NULL,
    "dep_type" TEXT NOT NULL DEFAULT 'FS',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_dependencies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_node_notes" (
    "id" UUID NOT NULL,
    "node_id" UUID NOT NULL,
    "author_id" UUID,
    "body" TEXT NOT NULL,
    "attachment_key" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_node_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wbs_templates" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "name" TEXT NOT NULL,
    "job_type" TEXT,
    "structure" JSONB NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wbs_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statutory_returns" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "tax_type" TEXT NOT NULL,
    "period_month" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "amount_due" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "amount_paid" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "filing_deadline" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "source" TEXT,
    "source_ref" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "statutory_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "return_remittances" (
    "id" UUID NOT NULL,
    "return_id" UUID NOT NULL,
    "paid_at" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "reference" TEXT,
    "proof_attachment_key" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "return_remittances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wht_transactions" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "direction" "WhtDirection" NOT NULL,
    "counterparty" TEXT,
    "related_payment_ref" TEXT,
    "tax_base" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "rate" DECIMAL(20,6) NOT NULL DEFAULT 0,
    "amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "certificate_ref" TEXT,
    "certificate_received" BOOLEAN NOT NULL DEFAULT false,
    "tax_period" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wht_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wht_rates" (
    "id" UUID NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'ZW',
    "category" TEXT NOT NULL,
    "rate" DECIMAL(20,6) NOT NULL,
    "threshold_amount" DECIMAL(20,2),
    "effective_from" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wht_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "back_pay_batches" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "name" TEXT NOT NULL,
    "rate_effective_from" TIMESTAMP(3) NOT NULL,
    "gazetted_at" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approval_ref" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "back_pay_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "back_pay_lines" (
    "id" UUID NOT NULL,
    "batch_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "period_month" TEXT NOT NULL,
    "old_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "new_amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "difference" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "pensionable" BOOLEAN NOT NULL DEFAULT false,
    "nssa_able" BOOLEAN NOT NULL DEFAULT false,
    "workings" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "back_pay_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "acting_assignments" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "employee_id" UUID NOT NULL,
    "acting_position" TEXT NOT NULL,
    "acting_grade" TEXT,
    "date_from" TIMESTAMP(3) NOT NULL,
    "date_to" TIMESTAMP(3) NOT NULL,
    "basis" "ActingBasis" NOT NULL,
    "fixed_amount" DECIMAL(20,2),
    "currency" TEXT,
    "percent" DECIMAL(5,2),
    "min_qualifying_days" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "approval_ref" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acting_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_extra_earnings" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "run_id" UUID,
    "employee_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "period_month" TEXT,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "pensionable" BOOLEAN NOT NULL DEFAULT false,
    "nssa_able" BOOLEAN NOT NULL DEFAULT false,
    "source_table" TEXT,
    "source_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_extra_earnings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_report_periods" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "site_id" UUID NOT NULL,
    "contract_id" UUID,
    "period_month" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "deadline" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "submitted_by_user_id" UUID,
    "narrative" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_report_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_report_sections" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "section_key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "owner_user_id" UUID,
    "content" JSONB,
    "auto_populated" BOOLEAN NOT NULL DEFAULT false,
    "completed_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_report_sections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_kpis" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "contract_id" UUID,
    "site_id" UUID,
    "kpi_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT,
    "weight" DECIMAL(20,4) NOT NULL DEFAULT 1,
    "direction" TEXT NOT NULL DEFAULT 'HIGHER_BETTER',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_kpis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_kpi_targets" (
    "id" UUID NOT NULL,
    "kpi_id" UUID NOT NULL,
    "period_month" TEXT,
    "effective_from" TIMESTAMP(3),
    "target_value" DECIMAL(20,4) NOT NULL,
    "tolerance" DECIMAL(20,4),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_kpi_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "site_kpi_actuals" (
    "id" UUID NOT NULL,
    "kpi_id" UUID NOT NULL,
    "period_month" TEXT NOT NULL,
    "actual_value" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "rag" "RagStatus" NOT NULL DEFAULT 'GREEN',
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "site_kpi_actuals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppe_requirements" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "role" TEXT,
    "employee_id" UUID,
    "item_type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "lifespan_months" INTEGER,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ppe_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppe_issues" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "item_type" TEXT NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "size" TEXT,
    "replacement_due" TIMESTAMP(3),
    "condition" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ppe_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores_withdrawals" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "site_id" UUID NOT NULL,
    "item_type" TEXT NOT NULL,
    "description" TEXT,
    "quantity" DECIMAL(20,4) NOT NULL DEFAULT 0,
    "unit" TEXT,
    "value" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "vehicle_ref" TEXT,
    "drawn_at" TIMESTAMP(3) NOT NULL,
    "allocation" DECIMAL(20,4),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stores_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entities_name_key" ON "entities"("name");

-- CreateIndex
CREATE INDEX "public_holidays_entity_id_idx" ON "public_holidays"("entity_id");

-- CreateIndex
CREATE INDEX "campaigns_entity_id_idx" ON "campaigns"("entity_id");

-- CreateIndex
CREATE INDEX "campaign_channels_campaign_id_idx" ON "campaign_channels"("campaign_id");

-- CreateIndex
CREATE INDEX "channel_metrics_channel_id_idx" ON "channel_metrics"("channel_id");

-- CreateIndex
CREATE INDEX "campaign_responses_campaign_id_idx" ON "campaign_responses"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_responses_channel_id_idx" ON "campaign_responses"("channel_id");

-- CreateIndex
CREATE INDEX "boards_entity_id_idx" ON "boards"("entity_id");

-- CreateIndex
CREATE INDEX "boards_project_id_idx" ON "boards"("project_id");

-- CreateIndex
CREATE INDEX "board_members_board_id_idx" ON "board_members"("board_id");

-- CreateIndex
CREATE UNIQUE INDEX "board_members_board_id_user_id_key" ON "board_members"("board_id", "user_id");

-- CreateIndex
CREATE INDEX "board_lists_board_id_idx" ON "board_lists"("board_id");

-- CreateIndex
CREATE INDEX "board_cards_list_id_idx" ON "board_cards"("list_id");

-- CreateIndex
CREATE INDEX "card_checklist_items_card_id_idx" ON "card_checklist_items"("card_id");

-- CreateIndex
CREATE INDEX "card_comments_card_id_idx" ON "card_comments"("card_id");

-- CreateIndex
CREATE INDEX "projects_entity_id_idx" ON "projects"("entity_id");

-- CreateIndex
CREATE INDEX "projects_site_id_idx" ON "projects"("site_id");

-- CreateIndex
CREATE INDEX "project_nodes_project_id_idx" ON "project_nodes"("project_id");

-- CreateIndex
CREATE INDEX "project_nodes_parent_id_idx" ON "project_nodes"("parent_id");

-- CreateIndex
CREATE INDEX "project_dependencies_project_id_idx" ON "project_dependencies"("project_id");

-- CreateIndex
CREATE INDEX "project_node_notes_node_id_idx" ON "project_node_notes"("node_id");

-- CreateIndex
CREATE INDEX "wbs_templates_entity_id_idx" ON "wbs_templates"("entity_id");

-- CreateIndex
CREATE INDEX "statutory_returns_entity_id_idx" ON "statutory_returns"("entity_id");

-- CreateIndex
CREATE INDEX "statutory_returns_period_month_idx" ON "statutory_returns"("period_month");

-- CreateIndex
CREATE INDEX "statutory_returns_tax_type_period_month_idx" ON "statutory_returns"("tax_type", "period_month");

-- CreateIndex
CREATE INDEX "return_remittances_return_id_idx" ON "return_remittances"("return_id");

-- CreateIndex
CREATE INDEX "wht_transactions_entity_id_idx" ON "wht_transactions"("entity_id");

-- CreateIndex
CREATE INDEX "wht_rates_country_category_effective_from_idx" ON "wht_rates"("country", "category", "effective_from");

-- CreateIndex
CREATE INDEX "back_pay_batches_entity_id_idx" ON "back_pay_batches"("entity_id");

-- CreateIndex
CREATE INDEX "back_pay_lines_batch_id_idx" ON "back_pay_lines"("batch_id");

-- CreateIndex
CREATE INDEX "back_pay_lines_employee_id_idx" ON "back_pay_lines"("employee_id");

-- CreateIndex
CREATE INDEX "acting_assignments_entity_id_idx" ON "acting_assignments"("entity_id");

-- CreateIndex
CREATE INDEX "acting_assignments_employee_id_idx" ON "acting_assignments"("employee_id");

-- CreateIndex
CREATE INDEX "payroll_extra_earnings_entity_id_idx" ON "payroll_extra_earnings"("entity_id");

-- CreateIndex
CREATE INDEX "payroll_extra_earnings_run_id_idx" ON "payroll_extra_earnings"("run_id");

-- CreateIndex
CREATE INDEX "payroll_extra_earnings_employee_id_idx" ON "payroll_extra_earnings"("employee_id");

-- CreateIndex
CREATE INDEX "site_report_periods_entity_id_idx" ON "site_report_periods"("entity_id");

-- CreateIndex
CREATE INDEX "site_report_periods_site_id_idx" ON "site_report_periods"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "site_report_periods_site_id_period_month_key" ON "site_report_periods"("site_id", "period_month");

-- CreateIndex
CREATE INDEX "site_report_sections_report_id_idx" ON "site_report_sections"("report_id");

-- CreateIndex
CREATE INDEX "site_kpis_entity_id_idx" ON "site_kpis"("entity_id");

-- CreateIndex
CREATE INDEX "site_kpis_contract_id_idx" ON "site_kpis"("contract_id");

-- CreateIndex
CREATE INDEX "site_kpis_site_id_idx" ON "site_kpis"("site_id");

-- CreateIndex
CREATE INDEX "site_kpi_targets_kpi_id_idx" ON "site_kpi_targets"("kpi_id");

-- CreateIndex
CREATE INDEX "site_kpi_actuals_kpi_id_idx" ON "site_kpi_actuals"("kpi_id");

-- CreateIndex
CREATE INDEX "ppe_requirements_entity_id_idx" ON "ppe_requirements"("entity_id");

-- CreateIndex
CREATE INDEX "ppe_requirements_employee_id_idx" ON "ppe_requirements"("employee_id");

-- CreateIndex
CREATE INDEX "ppe_issues_employee_id_idx" ON "ppe_issues"("employee_id");

-- CreateIndex
CREATE INDEX "stores_withdrawals_entity_id_idx" ON "stores_withdrawals"("entity_id");

-- CreateIndex
CREATE INDEX "stores_withdrawals_site_id_idx" ON "stores_withdrawals"("site_id");

-- CreateIndex
CREATE INDEX "accounts_entity_id_idx" ON "accounts"("entity_id");

-- CreateIndex
CREATE INDEX "compliance_obligations_entity_id_idx" ON "compliance_obligations"("entity_id");

-- CreateIndex
CREATE INDEX "contracts_entity_id_idx" ON "contracts"("entity_id");

-- CreateIndex
CREATE INDEX "crm_opportunities_entity_id_idx" ON "crm_opportunities"("entity_id");

-- CreateIndex
CREATE INDEX "employees_entity_id_idx" ON "employees"("entity_id");

-- CreateIndex
CREATE INDEX "orders_entity_id_idx" ON "orders"("entity_id");

-- CreateIndex
CREATE INDEX "other_tax_debt_entity_id_idx" ON "other_tax_debt"("entity_id");

-- CreateIndex
CREATE INDEX "payroll_runs_entity_id_idx" ON "payroll_runs"("entity_id");

-- CreateIndex
CREATE INDEX "sites_entity_id_idx" ON "sites"("entity_id");

-- CreateIndex
CREATE INDEX "tax_ledger_entity_id_idx" ON "tax_ledger"("entity_id");

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_ledger" ADD CONSTRAINT "tax_ledger_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "other_tax_debt" ADD CONSTRAINT "other_tax_debt_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_obligations" ADD CONSTRAINT "compliance_obligations_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_opportunities" ADD CONSTRAINT "crm_opportunities_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public_holidays" ADD CONSTRAINT "public_holidays_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_channels" ADD CONSTRAINT "campaign_channels_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "channel_metrics" ADD CONSTRAINT "channel_metrics_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "campaign_channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_responses" ADD CONSTRAINT "campaign_responses_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_responses" ADD CONSTRAINT "campaign_responses_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "campaign_channels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_members" ADD CONSTRAINT "board_members_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_lists" ADD CONSTRAINT "board_lists_board_id_fkey" FOREIGN KEY ("board_id") REFERENCES "boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "board_cards" ADD CONSTRAINT "board_cards_list_id_fkey" FOREIGN KEY ("list_id") REFERENCES "board_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_checklist_items" ADD CONSTRAINT "card_checklist_items_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "board_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_comments" ADD CONSTRAINT "card_comments_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "board_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_nodes" ADD CONSTRAINT "project_nodes_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_dependencies" ADD CONSTRAINT "project_dependencies_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_node_notes" ADD CONSTRAINT "project_node_notes_node_id_fkey" FOREIGN KEY ("node_id") REFERENCES "project_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_remittances" ADD CONSTRAINT "return_remittances_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "statutory_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "back_pay_lines" ADD CONSTRAINT "back_pay_lines_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "back_pay_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_report_sections" ADD CONSTRAINT "site_report_sections_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "site_report_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_kpi_targets" ADD CONSTRAINT "site_kpi_targets_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "site_kpis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "site_kpi_actuals" ADD CONSTRAINT "site_kpi_actuals_kpi_id_fkey" FOREIGN KEY ("kpi_id") REFERENCES "site_kpis"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Default entity + backfill of existing rows.
-- A single default operating entity (AES Zimbabwe). Fixed uuid literal so both a
-- fresh DB (this migration) and the current DB converge on the same id, and the
-- idempotent seed can reference it. Existing financial/HR rows are stamped with it.
-- ---------------------------------------------------------------------------
INSERT INTO "entities" ("id", "name", "country", "base_currency", "timezone", "locale", "active", "created_at", "updated_at")
VALUES ('00000000-0000-0000-0000-0000000000e1', 'AES Zimbabwe', 'ZW', 'USD', 'Africa/Harare', 'en', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

UPDATE "sites"                  SET "entity_id" = '00000000-0000-0000-0000-0000000000e1' WHERE "entity_id" IS NULL;
UPDATE "employees"             SET "entity_id" = '00000000-0000-0000-0000-0000000000e1' WHERE "entity_id" IS NULL;
UPDATE "orders"                SET "entity_id" = '00000000-0000-0000-0000-0000000000e1' WHERE "entity_id" IS NULL;
UPDATE "contracts"             SET "entity_id" = '00000000-0000-0000-0000-0000000000e1' WHERE "entity_id" IS NULL;
UPDATE "accounts"              SET "entity_id" = '00000000-0000-0000-0000-0000000000e1' WHERE "entity_id" IS NULL;
UPDATE "payroll_runs"          SET "entity_id" = '00000000-0000-0000-0000-0000000000e1' WHERE "entity_id" IS NULL;
UPDATE "tax_ledger"            SET "entity_id" = '00000000-0000-0000-0000-0000000000e1' WHERE "entity_id" IS NULL;
UPDATE "other_tax_debt"        SET "entity_id" = '00000000-0000-0000-0000-0000000000e1' WHERE "entity_id" IS NULL;
UPDATE "compliance_obligations" SET "entity_id" = '00000000-0000-0000-0000-0000000000e1' WHERE "entity_id" IS NULL;
UPDATE "crm_opportunities"     SET "entity_id" = '00000000-0000-0000-0000-0000000000e1' WHERE "entity_id" IS NULL;

-- ---------------------------------------------------------------------------
-- GRANTs — the app connects as the non-privileged aes_app role, so every new
-- table must be explicitly granted (the aes_app_role.sql default privileges only
-- cover objects created by the owner AFTER that script ran; we grant here
-- explicitly to be safe and self-contained). UUID PKs -> no sequences to grant.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  new_tables text[] := ARRAY[
    -- entity dimension
    'entities',
    'public_holidays',
    -- A) BD / marketing
    'campaigns',
    'campaign_channels',
    'channel_metrics',
    'campaign_responses',
    -- B) confidential boards
    'boards',
    'board_members',
    'board_lists',
    'board_cards',
    'card_checklist_items',
    'card_comments',
    -- C) project WBS
    'projects',
    'project_nodes',
    'project_dependencies',
    'project_node_notes',
    'wbs_templates',
    -- D) statutory returns + WHT
    'statutory_returns',
    'return_remittances',
    'wht_transactions',
    'wht_rates',
    -- E) back-pay + acting
    'back_pay_batches',
    'back_pay_lines',
    'acting_assignments',
    'payroll_extra_earnings',
    -- F) site reports + performance/RAG
    'site_report_periods',
    'site_report_sections',
    'site_kpis',
    'site_kpi_targets',
    'site_kpi_actuals',
    'ppe_requirements',
    'ppe_issues',
    'stores_withdrawals'
  ];
BEGIN
  FOREACH t IN ARRAY new_tables LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO aes_app', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Row-Level Security for the genuinely SITE-SCOPED new tables. Same pattern as
-- the existing row_level_security migration: ENABLE + FORCE RLS and attach the
-- symmetric site-isolation policy that reads app.site_ids / app.bypass_rls GUCs
-- via app.rls_visible(site_id). NULL site_id rows are global/visible-to-all.
-- (projects.site_id is nullable, so global-scoped projects are visible to all.)
-- The other new tables are NON-site-scoped and deliberately keep RLS OFF.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t text;
  site_scoped_tables text[] := ARRAY[
    'projects',
    'site_report_periods',
    'stores_withdrawals'
  ];
BEGIN
  FOREACH t IN ARRAY site_scoped_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS rls_site_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY rls_site_isolation ON %I USING (app.rls_visible(site_id)) WITH CHECK (app.rls_visible(site_id))',
      t
    );
  END LOOP;
END $$;
