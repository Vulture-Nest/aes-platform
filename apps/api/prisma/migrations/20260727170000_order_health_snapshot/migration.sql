-- G9c order-health snapshot + G9b ZIMRA interest accrual snapshot (additive, all nullable).
--
-- orders: persist the last OrderHealth state evaluated by the nightly recalc job so
-- transitions INTO a red state (OVERDUE_PAYMENT / OVERDUE_SERVICE) can be detected and
-- alerted exactly once instead of every night.
ALTER TABLE "orders" ADD COLUMN "last_health" TEXT;
ALTER TABLE "orders" ADD COLUMN "health_evaluated_at" TIMESTAMP(3);

-- other_tax_debt / zimra_assessments: persist accrued statutory overdue interest (A.5/A.6)
-- refreshed nightly, so the figure is not only computed on-read. Balance/total-due stay
-- derived; these are a persisted snapshot with its "as of" timestamp.
ALTER TABLE "other_tax_debt" ADD COLUMN "accrued_interest" DECIMAL(20,2);
ALTER TABLE "other_tax_debt" ADD COLUMN "accrued_interest_at" TIMESTAMP(3);

ALTER TABLE "zimra_assessments" ADD COLUMN "accrued_interest" DECIMAL(20,2);
ALTER TABLE "zimra_assessments" ADD COLUMN "accrued_interest_at" TIMESTAMP(3);
