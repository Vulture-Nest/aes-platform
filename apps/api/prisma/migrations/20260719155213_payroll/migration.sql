-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'CHECKED', 'APPROVED', 'PAID', 'LOCKED');

-- CreateTable
CREATE TABLE "payroll_runs" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "fx_rate_id" UUID,
    "client_ratio_snapshot" JSONB,
    "prepared_by_user_id" UUID,
    "approved_by_user_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_lines" (
    "id" UUID NOT NULL,
    "run_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "basic_usd" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "basic_zwg" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "cola" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "ug_allowance" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "night_allowance" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "other_allowances" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "gross" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "paye" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "aids_levy" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "nssa_ee" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "nssa_er" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "zimdef" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "nec" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "mipf" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "nyaradzo" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "other_deductions" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "net_usd" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "net_zwg" DECIMAL(20,2) NOT NULL DEFAULT 0,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payroll_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payroll_runs_site_id_idx" ON "payroll_runs"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_site_id_month_key" ON "payroll_runs"("site_id", "month");

-- CreateIndex
CREATE INDEX "payroll_lines_run_id_idx" ON "payroll_lines"("run_id");

-- CreateIndex
CREATE INDEX "payroll_lines_employee_id_idx" ON "payroll_lines"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_lines_run_id_employee_id_key" ON "payroll_lines"("run_id", "employee_id");

-- AddForeignKey
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
