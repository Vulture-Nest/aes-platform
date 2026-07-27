import { Injectable, Logger } from '@nestjs/common';
import { Loan, LoanStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { InterestMethod, LoanInterestService } from './loan-interest.service';

/** ms in one day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * A guard on how many days of back-accrual a single run will write for one loan.
 * A loan can only accrue from its start date onwards, but this caps the work a
 * cold-start (empty table) run does per loan so one pathological old loan can't
 * write tens of thousands of rows in a single pass; subsequent nightly runs
 * simply pick up where the previous run left off.
 */
const MAX_BACKFILL_DAYS = 3650;

/** Outcome of an accrual run. */
export interface LoanAccrualRunResult {
  /** Loans considered (active/unsettled). */
  loansConsidered: number;
  /** New per-day accrual rows written across all loans. */
  rowsWritten: number;
}

/**
 * LoanInterestAccrualService — G9a nightly job.
 *
 * Persists loan interest HISTORY into `loan_interest` as one idempotent row per
 * (loan, calendar day). The pure {@link LoanInterestService} already exposes the
 * per-day amount (`dailyAccrual`); this service is the thin I/O wrapper that
 * walks each active loan from the day after its last persisted accrual (or its
 * start date on a cold start) up to and including yesterday, and writes the
 * missing days.
 *
 * Idempotency: the `@@unique([loanId, accrualDate])` constraint plus a
 * `skipDuplicates` createMany means a re-run on the same day is a no-op — no
 * day is ever double-accrued. Balance / total-due stay DERIVED on read via
 * {@link LoanInterestService.compute}; this table is history only.
 *
 * Only whole, elapsed days are persisted (up to yesterday) so the "current" day
 * is never written before it has fully elapsed, keeping the persisted history
 * stable and equal to `dailyAccrual * fullDaysElapsed`.
 */
@Injectable()
export class LoanInterestAccrualService {
  private readonly logger = new Logger(LoanInterestAccrualService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly loanInterest: LoanInterestService,
  ) {}

  /**
   * Accrue interest for every active (unsettled) loan up to `now`.
   * Returns the number of loans considered and rows written.
   */
  async accrueAll(now: Date = new Date()): Promise<LoanAccrualRunResult> {
    const loans = await this.prisma.loan.findMany({ where: { status: LoanStatus.ACTIVE } });

    let rowsWritten = 0;
    for (const loan of loans) {
      rowsWritten += await this.accrueLoan(loan, now);
    }

    return { loansConsidered: loans.length, rowsWritten };
  }

  /**
   * Accrue the missing whole days for one loan. Returns the number of rows written.
   *
   * The accrual base is the loan principal (FLAT) — reducing-balance would need the
   * principal-repaid-to-date at each historical day; the flat method is the default
   * and matches the on-read {@link LoanInterestService.compute} default, so the
   * persisted history reconstructs the same total. A per-day row is written for
   * every day in [firstDay, lastDay] not already present.
   */
  async accrueLoan(loan: Loan, now: Date = new Date()): Promise<number> {
    const perDay = this.loanInterest.dailyAccrual({
      principal: Number(loan.principal),
      weeklyRate: this.weeklyRateFraction(loan),
      method: this.methodOf(loan),
    });

    // Nothing to accrue (zero principal / zero rate): don't write noise rows.
    if (perDay <= 0) {
      return 0;
    }

    const start = dayFloor(loan.startDate);
    const yesterday = addDays(dayFloor(now), -1);
    if (yesterday < start) {
      // Loan starts today or in the future: no full day has elapsed yet.
      return 0;
    }

    // Resume from the day after the last persisted accrual, else from the start.
    const last = await this.prisma.loanInterest.findFirst({
      where: { loanId: loan.id },
      orderBy: { accrualDate: 'desc' },
      select: { accrualDate: true },
    });
    let firstDay = last ? addDays(dayFloor(last.accrualDate), 1) : start;
    if (firstDay < start) {
      firstDay = start;
    }

    // Cap the very first (cold-start) backfill span.
    const maxFirst = addDays(yesterday, -(MAX_BACKFILL_DAYS - 1));
    if (firstDay < maxFirst) {
      firstDay = maxFirst;
    }

    const rows: Prisma.LoanInterestCreateManyInput[] = [];
    for (let d = firstDay; d <= yesterday; d = addDays(d, 1)) {
      rows.push({
        loanId: loan.id,
        accrualDate: d,
        amount: round2(perDay),
        currency: loan.currency,
      });
    }

    if (rows.length === 0) {
      return 0;
    }

    // skipDuplicates makes the write idempotent against the (loanId, accrualDate)
    // unique constraint, so overlapping/re-run windows never double-accrue.
    const res = await this.prisma.loanInterest.createMany({ data: rows, skipDuplicates: true });
    if (res.count > 0) {
      this.logger.log(`Loan ${loan.id}: accrued ${res.count} day(s) of interest`);
    }
    return res.count;
  }

  /** weekly_rate_pct is stored as a percentage; convert to the fraction the pure service expects. */
  private weeklyRateFraction(loan: Loan): number {
    return Number(loan.weeklyRatePct) / 100;
  }

  /** Map the Prisma loan-interest method enum onto the pure-service method. */
  private methodOf(loan: Loan): InterestMethod {
    return loan.interestMethod === 'REDUCING'
      ? InterestMethod.REDUCING_BALANCE
      : InterestMethod.FLAT_ON_PRINCIPAL;
  }
}

/** Truncate a date to UTC midnight so per-day rows land on stable @db.Date keys. */
function dayFloor(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** Add (possibly negative) whole days to a date. */
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * MS_PER_DAY);
}

/** Round a monetary value to 2 dp. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
