/**
 * Engine-defined approval modes and modules.
 *
 * These are NOT admin-configurable: the approval engine has dedicated code paths
 * for exactly these values (mode orchestration, per-module status transitions).
 * They are exposed read-only so the frontend can render the dropdowns without
 * hardcoding the list — the backend stays the single source of truth.
 */
export const APPROVAL_MODES = [
  { value: 'SEQUENTIAL', label: 'Sequential — one step at a time' },
  { value: 'PARALLEL', label: 'Parallel — all approvers in a step' },
  { value: 'EITHER', label: 'Either — any one approver in a step' },
] as const;

export const APPROVAL_MODULES = [
  { value: 'requisition', label: 'Cash requisition' },
  { value: 'travel', label: 'Travel & allowances' },
  { value: 'petty_cash', label: 'Petty cash' },
  { value: 'budget', label: 'Budget' },
  { value: 'director_withdrawal', label: 'Director withdrawal' },
  { value: 'payroll_run', label: 'Payroll run' },
  { value: 'timesheet_period', label: 'Timesheet period' },
] as const;
