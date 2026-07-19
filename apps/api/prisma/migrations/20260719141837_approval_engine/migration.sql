-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('SEQUENTIAL', 'PARALLEL', 'EITHER');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'RETURNED');

-- DropEnum
DROP TYPE "RateType";

-- CreateTable
CREATE TABLE "approval_matrix" (
    "id" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "min_amount" DECIMAL(20,2),
    "max_amount" DECIMAL(20,2),
    "currency" "Currency",
    "site_id" UUID,
    "step_order" INTEGER NOT NULL,
    "approver_role" "Role" NOT NULL,
    "mode" "ApprovalMode" NOT NULL DEFAULT 'SEQUENTIAL',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_matrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approval_chains" (
    "id" UUID NOT NULL,
    "module" TEXT NOT NULL,
    "subject_table" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "amount" DECIMAL(20,2),
    "currency" "Currency",
    "site_id" UUID,
    "requester_id" UUID NOT NULL,
    "status" "ApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approval_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" UUID NOT NULL,
    "chain_id" UUID NOT NULL,
    "step" INTEGER NOT NULL,
    "approver_role" "Role" NOT NULL,
    "assigned_user_id" UUID,
    "mode" "ApprovalMode" NOT NULL DEFAULT 'SEQUENTIAL',
    "decision" "ApprovalDecision",
    "decided_by_user_id" UUID,
    "decided_at" TIMESTAMP(3),
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "approval_matrix_module_active_idx" ON "approval_matrix"("module", "active");

-- CreateIndex
CREATE INDEX "approval_chains_subject_table_subject_id_idx" ON "approval_chains"("subject_table", "subject_id");

-- CreateIndex
CREATE INDEX "approval_chains_status_idx" ON "approval_chains"("status");

-- CreateIndex
CREATE INDEX "approvals_chain_id_idx" ON "approvals"("chain_id");

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "approval_chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
