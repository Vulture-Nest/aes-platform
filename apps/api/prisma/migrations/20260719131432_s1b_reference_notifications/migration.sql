-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'ZWG');

-- CreateEnum
CREATE TYPE "RateType" AS ENUM ('OFFICIAL', 'PARALLEL', 'CLIENT_RATIO');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'WATCH', 'DANGER');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'PUSH', 'EMAIL', 'TEAMS');

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" UUID NOT NULL,
    "date_effective" TIMESTAMP(3) NOT NULL,
    "currency_pair" TEXT NOT NULL,
    "official_rate" DECIMAL(20,6) NOT NULL,
    "parallel_rate" DECIMAL(20,6),
    "source" TEXT,
    "entered_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "statutory_rates" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "currency" "Currency",
    "value" DECIMAL(20,6),
    "params" JSONB,
    "date_effective" TIMESTAMP(3) NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "statutory_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "thresholds" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "currency" "Currency",
    "value" DECIMAL(20,6),
    "params" JSONB,
    "date_effective" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "thresholds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delegation_rules" (
    "id" UUID NOT NULL,
    "approver_user_id" UUID NOT NULL,
    "delegate_user_id" UUID NOT NULL,
    "date_from" TIMESTAMP(3) NOT NULL,
    "date_to" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delegation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "template" TEXT NOT NULL,
    "payload" JSONB,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "subject_table" TEXT,
    "subject_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_preferences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "channel" "NotificationChannel" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exchange_rates_currency_pair_date_effective_idx" ON "exchange_rates"("currency_pair", "date_effective");

-- CreateIndex
CREATE INDEX "statutory_rates_key_currency_date_effective_idx" ON "statutory_rates"("key", "currency", "date_effective");

-- CreateIndex
CREATE INDEX "thresholds_key_currency_date_effective_idx" ON "thresholds"("key", "currency", "date_effective");

-- CreateIndex
CREATE INDEX "delegation_rules_approver_user_id_active_idx" ON "delegation_rules"("approver_user_id", "active");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE UNIQUE INDEX "notification_preferences_user_id_channel_key" ON "notification_preferences"("user_id", "channel");
