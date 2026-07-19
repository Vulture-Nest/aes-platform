-- CreateTable
CREATE TABLE "petty_cash_floats" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "custodian_user_id" UUID NOT NULL,
    "float_amount" DECIMAL(20,2) NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petty_cash_floats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "petty_cash_txns" (
    "id" UUID NOT NULL,
    "float_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DECIMAL(20,2) NOT NULL,
    "currency" "Currency" NOT NULL,
    "purpose" TEXT,
    "order_id" UUID,
    "receipt_key" TEXT,
    "achieved_rate" DECIMAL(20,6),
    "variance_vs_official" DECIMAL(20,6),
    "linked_txn_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "petty_cash_txns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "petty_cash_floats_site_id_currency_idx" ON "petty_cash_floats"("site_id", "currency");

-- CreateIndex
CREATE INDEX "petty_cash_floats_custodian_user_id_idx" ON "petty_cash_floats"("custodian_user_id");

-- CreateIndex
CREATE INDEX "petty_cash_txns_float_id_idx" ON "petty_cash_txns"("float_id");

-- CreateIndex
CREATE INDEX "petty_cash_txns_type_idx" ON "petty_cash_txns"("type");

-- CreateIndex
CREATE INDEX "petty_cash_txns_status_idx" ON "petty_cash_txns"("status");

-- AddForeignKey
ALTER TABLE "petty_cash_txns" ADD CONSTRAINT "petty_cash_txns_float_id_fkey" FOREIGN KEY ("float_id") REFERENCES "petty_cash_floats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
