-- CreateTable
CREATE TABLE "lookup_values" (
    "id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lookup_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lookup_values_category_active_idx" ON "lookup_values"("category", "active");

-- CreateIndex
CREATE UNIQUE INDEX "lookup_values_category_code_key" ON "lookup_values"("category", "code");
