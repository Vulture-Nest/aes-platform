-- CreateTable
CREATE TABLE "requisitions" (
    "id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "required_by_date" TIMESTAMP(3) NOT NULL,
    "order_id" UUID,
    "attachment_key" TEXT,
    "site_id" UUID,
    "requester_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "cash_snapshot" JSONB,
    "shortfall" DECIMAL(20,2),
    "disbursement_account_id" UUID,
    "disbursement_reference" TEXT,
    "disbursed_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "requisitions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "requisitions_status_idx" ON "requisitions"("status");

-- CreateIndex
CREATE INDEX "requisitions_requester_id_idx" ON "requisitions"("requester_id");

-- CreateIndex
CREATE INDEX "requisitions_site_id_idx" ON "requisitions"("site_id");
