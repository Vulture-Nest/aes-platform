-- Statutory compliance calendar
CREATE TABLE "compliance_obligations" (
  "id" UUID NOT NULL,
  "head" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "period_month" TEXT NOT NULL,
  "site_id" UUID,
  "amount" DECIMAL(20,2) NOT NULL,
  "currency" TEXT NOT NULL,
  "due_date" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "source_table" TEXT,
  "source_id" UUID,
  "remittance_reference" TEXT,
  "remitted_by_user_id" UUID,
  "remitted_at" TIMESTAMP(3),
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_by" UUID,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "compliance_obligations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "compliance_obligations_status_due_date_idx" ON "compliance_obligations"("status", "due_date");
