-- Payroll correctness (Tier-1 gap close): per-currency PAYE, per-employee allowance/ratio
-- config, employee-side NEC/MIPF + voluntary deductions, and back-pay/acting feed-in.
-- Additive only: new nullable columns on already-granted tables (no new GRANTs required).

-- Employee: per-employee allowance + split-ratio + voluntary-deduction config.
ALTER TABLE "employees"
  ADD COLUMN "usd_split_pct"        DECIMAL(5,2),
  ADD COLUMN "ug_allowance_rate"    DECIMAL(20,4),
  ADD COLUMN "night_allowance_rate" DECIMAL(20,4),
  ADD COLUMN "cola_zwg"             DECIMAL(20,2),
  ADD COLUMN "other_allowances_usd" DECIMAL(20,2),
  ADD COLUMN "gratuity_usd"         DECIMAL(20,2),
  ADD COLUMN "nyaradzo_amount"      DECIMAL(20,2),
  ADD COLUMN "nyaradzo_currency"    TEXT,
  ADD COLUMN "other_deduction_usd"  DECIMAL(20,2),
  ADD COLUMN "other_deduction_zwg"  DECIMAL(20,2),
  ADD COLUMN "mipf_member"          BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "nec_member"           BOOLEAN NOT NULL DEFAULT false;

-- PayrollRun: per-employee ratio snapshot + snapshotted FX rate used for the PAYE cross-currency
-- taxable roll-up.
ALTER TABLE "payroll_runs"
  ADD COLUMN "per_employee_ratios" JSONB,
  ADD COLUMN "fx_rate"             DECIMAL(20,6);

-- PayrollLine: employee-side NEC/MIPF and the folded-in extra earnings.
ALTER TABLE "payroll_lines"
  ADD COLUMN "nec_ee"         DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "mipf_ee"        DECIMAL(20,2) NOT NULL DEFAULT 0,
  ADD COLUMN "extra_earnings" DECIMAL(20,2) NOT NULL DEFAULT 0;
