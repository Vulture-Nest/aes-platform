-- CreateEnum
CREATE TYPE "OpportunityStage" AS ENUM ('CONTACT', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');

-- CreateTable
CREATE TABLE "crm_opportunities" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "organisation_id" UUID,
    "contact_id" UUID,
    "stage" "OpportunityStage" NOT NULL DEFAULT 'CONTACT',
    "estimated_value" DECIMAL(20,2),
    "currency" "Currency",
    "owner_user_id" UUID,
    "expected_close_date" TIMESTAMP(3),
    "won_at" TIMESTAMP(3),
    "lost_reason" TEXT,
    "converted_order_id" UUID,
    "converted_contract_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_opportunities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_opportunities_stage_idx" ON "crm_opportunities"("stage");

-- CreateIndex
CREATE INDEX "crm_opportunities_owner_user_id_idx" ON "crm_opportunities"("owner_user_id");
