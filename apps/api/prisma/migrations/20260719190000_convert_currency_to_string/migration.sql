-- Convert every "Currency" enum column to plain text
-- (admin-configurable via the settings lookup catalog, category 'currency').
-- Non-destructive: existing enum values are cast to their text representation via
-- ALTER COLUMN ... TYPE TEXT USING "<col>"::text, so seeded/live rows (orders,
-- accounts, exchange-rate-linked money, the seeded employee, etc.) keep their
-- 'USD'/'ZWG' values. Nullable columns are cast the same way (NULLs stay NULL).
-- This spans ~29 money columns across most tables; the enum type is dropped last.

-- AlterTable
ALTER TABLE "statutory_rates" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "thresholds" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "approval_matrix" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "approval_chains" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "contracts" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "contract_claims" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "order_receipts" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "order_expenses" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "general_expenses" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "overheads" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "loans" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "loan_repayments" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "loan_interest" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "accounts" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "ledger_entries" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "tax_ledger" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "other_tax_debt" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "zimra_assessments" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "requisitions" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "travel_rates" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "travel_requests" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "petty_cash_floats" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "petty_cash_txns" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "budgets" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "budget_lines" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "director_withdrawals" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- AlterTable
ALTER TABLE "employees" ALTER COLUMN "account_currency" TYPE TEXT USING "account_currency"::text;

-- AlterTable
ALTER TABLE "crm_opportunities" ALTER COLUMN "currency" TYPE TEXT USING "currency"::text;

-- DropEnum
DROP TYPE "Currency";
