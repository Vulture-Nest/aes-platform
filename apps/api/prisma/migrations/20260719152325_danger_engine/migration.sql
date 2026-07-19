-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WATCH', 'DANGER');

-- CreateTable
CREATE TABLE "danger_rules" (
    "id" UUID NOT NULL,
    "rule_key" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "danger_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "rule_key" TEXT NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "subject_table" TEXT,
    "subject_id" UUID,
    "message" TEXT NOT NULL,
    "payload" JSONB,
    "raised_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledged_by_user_id" UUID,
    "acknowledged_at" TIMESTAMP(3),
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "danger_rules_rule_key_key" ON "danger_rules"("rule_key");

-- CreateIndex
CREATE INDEX "alerts_rule_key_subject_id_resolved_at_idx" ON "alerts"("rule_key", "subject_id", "resolved_at");
