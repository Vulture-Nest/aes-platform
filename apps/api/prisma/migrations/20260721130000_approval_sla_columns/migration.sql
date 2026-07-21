-- Approval SLA timers: track when a step became active + reminder/escalation stamps.
ALTER TABLE "approvals"
  ADD COLUMN "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "reminded_at" TIMESTAMP(3),
  ADD COLUMN "escalated_at" TIMESTAMP(3);
