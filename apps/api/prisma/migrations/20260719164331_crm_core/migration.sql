-- CreateEnum
CREATE TYPE "InteractionType" AS ENUM ('CALL', 'VISIT', 'EMAIL', 'TENDER', 'MEETING');

-- CreateTable
CREATE TABLE "crm_organisations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "client_id" UUID,
    "industry" TEXT,
    "source" TEXT,
    "owner_user_id" UUID,
    "notes" TEXT,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_organisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_contacts" (
    "id" UUID NOT NULL,
    "organisation_id" UUID NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "owner_user_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crm_interactions" (
    "id" UUID NOT NULL,
    "organisation_id" UUID,
    "contact_id" UUID,
    "type" "InteractionType" NOT NULL,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "outcome" TEXT,
    "notes" TEXT,
    "by_user_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crm_interactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "crm_organisations_client_id_idx" ON "crm_organisations"("client_id");

-- CreateIndex
CREATE INDEX "crm_contacts_organisation_id_idx" ON "crm_contacts"("organisation_id");

-- CreateIndex
CREATE INDEX "crm_interactions_organisation_id_idx" ON "crm_interactions"("organisation_id");

-- CreateIndex
CREATE INDEX "crm_interactions_contact_id_idx" ON "crm_interactions"("contact_id");

-- AddForeignKey
ALTER TABLE "crm_contacts" ADD CONSTRAINT "crm_contacts_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "crm_organisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_organisation_id_fkey" FOREIGN KEY ("organisation_id") REFERENCES "crm_organisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "crm_interactions" ADD CONSTRAINT "crm_interactions_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "crm_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
