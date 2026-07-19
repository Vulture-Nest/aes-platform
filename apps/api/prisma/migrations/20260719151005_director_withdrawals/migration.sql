-- CreateTable
CREATE TABLE "director_withdrawals" (
    "id" UUID NOT NULL,
    "director_user_id" UUID NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "destination_account" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "transfer_method" TEXT,
    "transfer_reference" TEXT,
    "completed_by_user_id" UUID,
    "completed_at" TIMESTAMP(3),
    "ledger_posted_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "director_withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "director_withdrawals_status_idx" ON "director_withdrawals"("status");

-- CreateIndex
CREATE INDEX "director_withdrawals_director_user_id_idx" ON "director_withdrawals"("director_user_id");
