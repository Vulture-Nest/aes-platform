-- Add an optional assignee to orders (the user who services it).
ALTER TABLE "orders" ADD COLUMN "assigned_user_id" UUID;
CREATE INDEX "orders_assigned_user_id_idx" ON "orders" ("assigned_user_id");
