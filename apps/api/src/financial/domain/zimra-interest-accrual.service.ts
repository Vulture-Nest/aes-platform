import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StatutoryRatesService } from '../../reference/statutory-rates/statutory-rates.service';
import { ZimraReconciliationService } from './zimra-reconciliation.service';

/** Statutory key for the ZIMRA overdue-interest percentage (p.a.). */
const KEY_ZIMRA_INTEREST_PCT = 'zimra_interest_pct';
/** Fallback ZIMRA interest % p.a. when no statutory value is configured. */
const DEFAULT_ZIMRA_INTEREST_PCT = 25;

/** Prisma.Decimal | number | null -> number (never NaN). */
function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === 'number' ? value : Number(value);
}

/** Outcome of a ZIMRA accrual run. */
export interface ZimraAccrualRunResult {
  /** other_tax_debt rows refreshed. */
  otherTaxDebts: number;
  /** zimra_assessments rows refreshed. */
  assessments: number;
}

/**
 * ZimraInterestAccrualService — G9b nightly job.
 *
 * Persists/refreshes accrued statutory interest (Appendix A.5/A.6) on overdue
 * ZIMRA debt so the figure is not only computed on-read:
 *
 *   interest = principalOutstanding * ratePct/100 * daysOverdue/365
 *
 * - other_tax_debt: accrues on (principal - paidToDate), using the debt's own
 *   `ratePct` — mirrors the Debt & Interest Watch panel exactly.
 * - zimra_assessments: carry no own rate, so the statutory `zimra_interest_pct`
 *   is resolved (with a Zimbabwe default) and applied to the assessed amount —
 *   mirrors the Tax Exposure panel.
 *
 * The write is a plain field refresh (idempotent): each run overwrites
 * `accruedInterest` + `accruedInterestAt` with the value for `now`. Re-running on
 * the same day writes the same amount, so there is no accumulation/double-count;
 * the balance / total-due stay derived on read.
 */
@Injectable()
export class ZimraInterestAccrualService {
  private readonly logger = new Logger(ZimraInterestAccrualService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly zimra: ZimraReconciliationService,
    private readonly statutoryRates: StatutoryRatesService,
  ) {}

  /** Refresh accrued interest on all overdue ZIMRA debt as of `now`. */
  async accrueAll(now: Date = new Date()): Promise<ZimraAccrualRunResult> {
    const [otherTaxDebts, assessments] = await Promise.all([
      this.accrueOtherTaxDebts(now),
      this.accrueAssessments(now),
    ]);
    return { otherTaxDebts, assessments };
  }

  /**
   * other_tax_debt: accrue on the OUTSTANDING principal (principal - paidToDate)
   * using the debt's own ratePct. Returns the number of rows refreshed.
   */
  async accrueOtherTaxDebts(now: Date): Promise<number> {
    const debts = await this.prisma.otherTaxDebt.findMany();
    let refreshed = 0;
    for (const debt of debts) {
      const outstanding = Math.max(0, num(debt.principal) - num(debt.paidToDate));
      const { interest } = this.zimra.overdueInterest({
        booksAmount: outstanding,
        dueDate: debt.dueDate,
        today: now,
        ratePct: num(debt.ratePct),
      });
      await this.prisma.otherTaxDebt.update({
        where: { id: debt.id },
        data: {
          accruedInterest: new Prisma.Decimal(round2(interest)),
          accruedInterestAt: now,
        },
      });
      refreshed += 1;
    }
    if (refreshed > 0) {
      this.logger.log(`Refreshed accrued interest on ${refreshed} other-tax-debt row(s)`);
    }
    return refreshed;
  }

  /**
   * zimra_assessments: accrue on the assessed amount at the statutory
   * `zimra_interest_pct`. Returns the number of rows refreshed.
   */
  async accrueAssessments(now: Date): Promise<number> {
    const assessments = await this.prisma.zimraAssessment.findMany();
    if (assessments.length === 0) {
      return 0;
    }

    const ratePct = await this.resolveZimraRatePct(now);
    let refreshed = 0;
    for (const a of assessments) {
      const { interest } = this.zimra.overdueInterest({
        booksAmount: num(a.assessedAmount),
        dueDate: a.dueDate,
        today: now,
        ratePct,
      });
      await this.prisma.zimraAssessment.update({
        where: { id: a.id },
        data: {
          accruedInterest: new Prisma.Decimal(round2(interest)),
          accruedInterestAt: now,
        },
      });
      refreshed += 1;
    }
    this.logger.log(`Refreshed accrued interest on ${refreshed} ZIMRA assessment(s)`);
    return refreshed;
  }

  /** Statutory ZIMRA interest % p.a., falling back to the Zimbabwe default. Never throws. */
  private async resolveZimraRatePct(asOf: Date): Promise<number> {
    try {
      const row = await this.statutoryRates.valueAsOf(KEY_ZIMRA_INTEREST_PCT, asOf);
      const value = num(row.value);
      return value > 0 ? value : DEFAULT_ZIMRA_INTEREST_PCT;
    } catch {
      return DEFAULT_ZIMRA_INTEREST_PCT;
    }
  }
}

/** Round a monetary value to 2 dp. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
