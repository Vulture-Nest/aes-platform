/**
 * Shared workflow lifecycle (spec §S5). This is a *local* TS enum — it is NOT a Prisma
 * enum. Workflow modules (requisitions, disbursements, travel, etc.) persist their status
 * as a plain `String` column defaulting to `'DRAFT'`, and use these constants for
 * comparisons and transitions.
 *
 * Lifecycle:
 *   DRAFT -> SUBMITTED -> APPROVED | REJECTED | RETURNED
 *         -> (funds check) APPROVED_READY_TO_PAY | APPROVED_PENDING_FUNDS
 *         -> DISBURSED -> (travel only) RETIRED -> CLOSED
 *
 * Cross-cutting rule: APPROVE FIRST, FUND SECOND. Funds availability never blocks
 * approval; it only chooses READY_TO_PAY vs PENDING_FUNDS and drives escalation.
 */
export enum WorkflowStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED',
  APPROVED_READY_TO_PAY = 'APPROVED_READY_TO_PAY',
  APPROVED_PENDING_FUNDS = 'APPROVED_PENDING_FUNDS',
  DISBURSED = 'DISBURSED',
  RETIRED = 'RETIRED',
  CLOSED = 'CLOSED',
}
