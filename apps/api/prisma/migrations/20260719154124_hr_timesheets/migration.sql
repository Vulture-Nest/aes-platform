-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('PERMANENT', 'CONTRACT', 'CASUAL');

-- CreateEnum
CREATE TYPE "PayMode" AS ENUM ('CLIENT_RATIO', 'FIXED_SPLIT');

-- CreateEnum
CREATE TYPE "TimesheetPeriodStatus" AS ENUM ('OPEN', 'SITE_APPROVED', 'LOCKED');

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "works_no" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "national_id" TEXT,
    "nssa_no" TEXT,
    "grade" TEXT,
    "nec_class" TEXT,
    "occupation" TEXT,
    "site_id" UUID NOT NULL,
    "employment_type" "EmploymentType" NOT NULL,
    "pay_mode" "PayMode" NOT NULL,
    "fixed_usd_pct" DECIMAL(5,2),
    "hourly_rate" DECIMAL(20,4),
    "bank_name" TEXT,
    "bank_branch" TEXT,
    "account_no" TEXT,
    "account_currency" "Currency",
    "leave_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "user_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_periods" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "status" "TimesheetPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "approved_by_user_id" UUID,
    "locked_at" TIMESTAMP(3),
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "timesheet_entries" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "hours_normal" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "hours_ot15" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "hours_ot20" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "ug_shift" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "night_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "anomaly_flag" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "timesheet_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_works_no_key" ON "employees"("works_no");

-- CreateIndex
CREATE INDEX "employees_site_id_idx" ON "employees"("site_id");

-- CreateIndex
CREATE INDEX "timesheet_periods_site_id_idx" ON "timesheet_periods"("site_id");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_periods_site_id_month_key" ON "timesheet_periods"("site_id", "month");

-- CreateIndex
CREATE INDEX "timesheet_entries_period_id_idx" ON "timesheet_entries"("period_id");

-- CreateIndex
CREATE INDEX "timesheet_entries_employee_id_idx" ON "timesheet_entries"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "timesheet_entries_period_id_employee_id_date_key" ON "timesheet_entries"("period_id", "employee_id", "date");

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "timesheet_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "timesheet_entries" ADD CONSTRAINT "timesheet_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
