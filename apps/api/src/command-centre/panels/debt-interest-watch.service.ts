import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { InterestMethod, LoanInterestService } from '../../financial/domain/loan-interest.service';
import { ZimraReconciliationService } from '../../financial/domain/zimra-reconciliation.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Milliseconds in one calendar day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Days in the weekly burn window. */
const DAYS_PER_WEEK = 7;
/** Debt-service horizon buckets, in days. */
const HORIZON_DAYS = [30, 60, 90] as const;

/** Prisma.Decimal | number | null -> number (safe, defaults to 0). */
function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === 'number' ? value : Number(value);
}

/** Round to 2 dp, guarding binary-float drift. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Optional inputs to the panel computation. */
export interface DebtInterestWatchParams {
  /** Reference "now" for accrual + horizon maths. Defaults to new Date(). */
  asOf?: Date;
}

/** Per-loan interest/burn line. */
export interface LoanDebtLine {
  loanId: string;
  lender: string;
  currency: string;
  /** Original loan principal. */
  principal: number;
  /** Principal repaid so far (USD-equivalent terms). */
  repaid: number;
  /** Accrued interest to `asOf`. */
  accruedInterest: number;
  /** principal + accrued - repaid (never below 0). */
  outstanding: number;
  /** dailyAccrual * 7 — interest cost per week. */
  weeklyBurn: number;
}

/** A single ZIMRA / other-tax debt line with any accruing interest. */
export interface ZimraDebtLine {
  source: 'other_tax_debt' | 'zimra_assessment';
  id: string;
  taxType: string;
  currency: string;
  /** Outstanding principal / assessed amount. */
  principal: number;
  /** Accrued overdue interest (0 for assessments without a rate). */
  accruedInterest: number;
  /** principal + accruedInterest. */
  total: number;
  /** Whole days overdue at `asOf` (0 if not yet due). */
  daysOverdue: number;
  dueDate: string;
}

/** Debt-service amount falling due within a rolling horizon. */
export interface DebtServiceBucket {
  /** Horizon width in days (30 / 60 / 90). */
  withinDays: number;
  /** Total principal + accrued interest due on or before the horizon. */
  amountDue: number;
  /** How many debt items fall in the bucket. */
  count: number;
}

/** Fully-typed result of the Debt & Interest Watch panel. */
export interface DebtInterestWatchResult {
  asOf: string;
  loans: {
    lines: LoanDebtLine[];
    totalPrincipal: number;
    totalAccruedInterest: number;
    totalOutstanding: number;
    /** Combined interest cost per week across active loans. */
    totalWeeklyBurn: number;
  };
  zimra: {
    lines: ZimraDebtLine[];
    totalPrincipal: number;
    totalAccruedInterest: number;
    totalDue: number;
  };
  /** Debt service (loans + ZIMRA) due within 30 / 60 / 90 days. */
  debtServiceDue: DebtServiceBucket[];
}

/**
 * Panel 3 — Debt & Interest Watch (Command Centre).
 *
 * Read-only aggregation over active loans and ZIMRA / other-tax debt:
 *  - per loan: principal, accrued interest, weekly interest burn, outstanding;
 *  - per ZIMRA / other-tax debt: principal, accruing overdue interest, total;
 *  - debt service (principal + accrued interest) falling due in 30 / 60 / 90 days.
 *
 * All monetary maths uses plain numbers (Prisma.Decimal -> Number). No writes.
 * Divide-by-zero and empty datasets are handled: empty inputs yield zeroed totals.
 */
@Injectable()
export class DebtInterestWatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly loanInterest: LoanInterestService,
    private readonly zimra: ZimraReconciliationService,
  ) {}

  async compute(params?: DebtInterestWatchParams): Promise<DebtInterestWatchResult> {
    const asOf = params?.asOf ?? new Date();

    const [loanBlock, zimraBlock] = await Promise.all([
      this.computeLoans(asOf),
      this.computeZimra(asOf),
    ]);

    const debtServiceDue = this.computeDebtService(asOf, loanBlock.lines, zimraBlock.lines);

    return {
      asOf: asOf.toISOString(),
      loans: loanBlock,
      zimra: zimraBlock,
      debtServiceDue,
    };
  }

  // ---------------------------------------------------------------------------
  // Loans: principal, accrued interest, weekly burn, outstanding.
  // ---------------------------------------------------------------------------
  private async computeLoans(asOf: Date): Promise<DebtInterestWatchResult['loans']> {
    const loans = await this.prisma.loan.findMany({
      where: { status: 'ACTIVE' },
      include: { repayments: { select: { amount: true } } },
    });

    const lines: LoanDebtLine[] = [];
    let totalPrincipal = 0;
    let totalAccruedInterest = 0;
    let totalOutstanding = 0;
    let totalWeeklyBurn = 0;

    for (const loan of loans) {
      const principal = num(loan.principal);
      const weeklyRate = num(loan.weeklyRatePct) / 100;
      const repaid = (loan.repayments ?? []).reduce((sum, r) => sum + num(r.amount), 0);
      const method =
        loan.interestMethod === 'REDUCING'
          ? InterestMethod.REDUCING_BALANCE
          : InterestMethod.FLAT_ON_PRINCIPAL;

      const result = this.loanInterest.compute({
        principal,
        weeklyRate,
        startDate: loan.startDate,
        asOfDate: asOf,
        repaidUsd: repaid,
        method,
        // For reducing balance, repayments shrink the accrual base.
        principalRepaidUsd: method === InterestMethod.REDUCING_BALANCE ? repaid : 0,
      });

      const weeklyBurn =
        this.loanInterest.dailyAccrual({
          principal,
          weeklyRate,
          method,
          principalRepaidUsd: method === InterestMethod.REDUCING_BALANCE ? repaid : 0,
        }) * DAYS_PER_WEEK;

      const accruedInterest = round2(result.accrued);
      const outstanding = round2(Math.max(0, result.balance));

      lines.push({
        loanId: loan.id,
        lender: loan.lender,
        currency: loan.currency,
        principal: round2(principal),
        repaid: round2(repaid),
        accruedInterest,
        outstanding,
        weeklyBurn: round2(weeklyBurn),
      });

      totalPrincipal += principal;
      totalAccruedInterest += accruedInterest;
      totalOutstanding += outstanding;
      totalWeeklyBurn += weeklyBurn;
    }

    return {
      lines,
      totalPrincipal: round2(totalPrincipal),
      totalAccruedInterest: round2(totalAccruedInterest),
      totalOutstanding: round2(totalOutstanding),
      totalWeeklyBurn: round2(totalWeeklyBurn),
    };
  }

  // ---------------------------------------------------------------------------
  // ZIMRA debt: other_tax_debt (with accruing interest) + zimra_assessments.
  // ---------------------------------------------------------------------------
  private async computeZimra(asOf: Date): Promise<DebtInterestWatchResult['zimra']> {
    const [otherDebts, assessments] = await Promise.all([
      this.prisma.otherTaxDebt.findMany(),
      this.prisma.zimraAssessment.findMany(),
    ]);

    const lines: ZimraDebtLine[] = [];
    let totalPrincipal = 0;
    let totalAccruedInterest = 0;

    for (const debt of otherDebts) {
      const principal = num(debt.principal);
      const { daysOverdue, interest } = this.zimra.overdueInterest({
        booksAmount: principal,
        dueDate: debt.dueDate,
        today: asOf,
        ratePct: num(debt.ratePct),
      });
      const accruedInterest = round2(interest);
      lines.push({
        source: 'other_tax_debt',
        id: debt.id,
        taxType: debt.taxType,
        currency: debt.currency,
        principal: round2(principal),
        accruedInterest,
        total: round2(principal + accruedInterest),
        daysOverdue,
        dueDate: debt.dueDate.toISOString(),
      });
      totalPrincipal += principal;
      totalAccruedInterest += accruedInterest;
    }

    for (const a of assessments) {
      const principal = num(a.assessedAmount);
      // Assessments carry no own interest rate; report days overdue only.
      const daysOverdue = this.zimra.daysOverdue(a.dueDate, asOf);
      lines.push({
        source: 'zimra_assessment',
        id: a.id,
        taxType: a.taxType,
        currency: a.currency,
        principal: round2(principal),
        accruedInterest: 0,
        total: round2(principal),
        daysOverdue,
        dueDate: a.dueDate.toISOString(),
      });
      totalPrincipal += principal;
    }

    return {
      lines,
      totalPrincipal: round2(totalPrincipal),
      totalAccruedInterest: round2(totalAccruedInterest),
      totalDue: round2(totalPrincipal + totalAccruedInterest),
    };
  }

  // ---------------------------------------------------------------------------
  // Debt service due in next 30 / 60 / 90 days.
  //   Loans: outstanding attributed to the loan's start date is already accrued,
  //     so their weekly burn projects forward — we treat the outstanding balance
  //     as due immediately (buckets are cumulative, so it lands in every horizon).
  //   ZIMRA / other-tax: total (principal + accrued) is due on its dueDate; it
  //     counts toward a horizon when dueDate <= asOf + horizon.
  //   Buckets are cumulative (30 ⊆ 60 ⊆ 90).
  // ---------------------------------------------------------------------------
  private computeDebtService(
    asOf: Date,
    loanLines: LoanDebtLine[],
    zimraLines: ZimraDebtLine[],
  ): DebtServiceBucket[] {
    return HORIZON_DAYS.map((withinDays) => {
      const cutoff = new Date(asOf.getTime() + withinDays * MS_PER_DAY);
      let amountDue = 0;
      let count = 0;

      // All outstanding loan balances are payable obligations within any horizon.
      for (const loan of loanLines) {
        if (loan.outstanding > 0) {
          amountDue += loan.outstanding;
          count += 1;
        }
      }

      // ZIMRA / other-tax items due on or before the horizon cutoff.
      for (const z of zimraLines) {
        if (z.total <= 0) {
          continue;
        }
        const due = new Date(z.dueDate);
        if (due.getTime() <= cutoff.getTime()) {
          amountDue += z.total;
          count += 1;
        }
      }

      return { withinDays, amountDue: round2(amountDue), count };
    });
  }
}
