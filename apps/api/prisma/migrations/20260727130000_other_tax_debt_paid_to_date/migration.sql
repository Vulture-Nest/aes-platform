-- Track partial payments against brought-forward tax debt (workbook "Paid to Date").
ALTER TABLE "other_tax_debt" ADD COLUMN "paid_to_date" DECIMAL(20,2) NOT NULL DEFAULT 0;
