-- CreateTable
CREATE TABLE "travel_rates" (
    "id" UUID NOT NULL,
    "grade" TEXT NOT NULL,
    "destination_class" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "daily_rate" DECIMAL(20,2) NOT NULL,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_requests" (
    "id" UUID NOT NULL,
    "destination" TEXT NOT NULL,
    "destination_class" TEXT,
    "date_from" TIMESTAMP(3) NOT NULL,
    "date_to" TIMESTAMP(3) NOT NULL,
    "grade" TEXT,
    "per_diem" DECIMAL(20,2) NOT NULL,
    "days" INTEGER NOT NULL,
    "advance_amount" DECIMAL(20,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "site_id" UUID,
    "requester_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "cash_snapshot" JSONB,
    "shortfall" DECIMAL(20,2),
    "disbursement_account_id" UUID,
    "disbursement_reference" TEXT,
    "disbursed_at" TIMESTAMP(3),
    "retirement_receipts_key" TEXT,
    "refund_due" DECIMAL(20,2),
    "refund_owed" DECIMAL(20,2),
    "retired_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "travel_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "travel_rates_grade_destination_class_currency_effective_dat_idx" ON "travel_rates"("grade", "destination_class", "currency", "effective_date");

-- CreateIndex
CREATE INDEX "travel_requests_status_idx" ON "travel_requests"("status");

-- CreateIndex
CREATE INDEX "travel_requests_requester_id_idx" ON "travel_requests"("requester_id");

-- CreateIndex
CREATE INDEX "travel_requests_site_id_idx" ON "travel_requests"("site_id");
