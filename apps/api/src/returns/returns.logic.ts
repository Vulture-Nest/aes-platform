import { Prisma } from '@prisma/client';

export type ReturnStatus = 'DUE' | 'OVERDUE' | 'PAID' | 'PARTIAL';

export interface ComputedReturnState {
  balance: number;
  status: ReturnStatus;
  daysToDeadline: number | null;
}

const toNum = (v: Prisma.Decimal | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : v.toNumber();
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole-day difference between the deadline and `now` (positive = days remaining). */
export function daysToDeadline(
  filingDeadline: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!filingDeadline) return null;
  const deadline = new Date(filingDeadline);
  if (Number.isNaN(deadline.getTime())) return null;
  const startOfToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startOfDeadline = Date.UTC(
    deadline.getUTCFullYear(),
    deadline.getUTCMonth(),
    deadline.getUTCDate(),
  );
  return Math.round((startOfDeadline - startOfToday) / MS_PER_DAY);
}

/**
 * Derive balance + status for a statutory return.
 * - PAID    when balance <= 0
 * - PARTIAL when 0 < paid < due
 * - OVERDUE when a balance remains and today is past the filing deadline
 * - DUE     otherwise
 */
export function computeReturnState(
  input: {
    amountDue: Prisma.Decimal | number;
    amountPaid: Prisma.Decimal | number;
    filingDeadline?: Date | string | null;
  },
  now: Date = new Date(),
): ComputedReturnState {
  const due = toNum(input.amountDue);
  const paid = toNum(input.amountPaid);
  const balance = Math.round((due - paid) * 100) / 100;
  const days = daysToDeadline(input.filingDeadline, now);

  let status: ReturnStatus;
  if (balance <= 0) {
    status = 'PAID';
  } else if (input.filingDeadline && days !== null && days < 0) {
    status = 'OVERDUE';
  } else if (paid > 0) {
    status = 'PARTIAL';
  } else {
    status = 'DUE';
  }

  return { balance, status, daysToDeadline: days };
}

/**
 * Standard ZIMRA-style statutory filing deadline: the 10th of the month following
 * the period. VAT (category 'C') is due by the 25th of the following month.
 */
export function defaultFilingDeadline(periodMonth: string, taxType?: string): Date {
  const [yearStr, monthStr] = periodMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr); // 1-12
  const day = taxType === 'VAT' ? 25 : 10;
  // Following month; JS Date month is 0-based, so `month` is already "next month".
  return new Date(Date.UTC(year, month, day, 0, 0, 0));
}
