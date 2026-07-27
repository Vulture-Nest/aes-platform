import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HealthVerdictPanelService } from '../command-centre/panels/health-verdict.service';
import { PerformancePanelService } from '../command-centre/panels/performance-panel.service';
import { LoanInterestService } from '../financial/domain/loan-interest.service';
import { PrismaService } from '../prisma/prisma.service';

/** One parity assertion: an expected figure vs the recomputed actual. */
export interface ParityCheck {
  name: string;
  expected: number;
  actual: number;
  delta: number;
  pass: boolean;
  /** Optional note explaining a definitional choice behind the expected value. */
  note?: string;
}

/** Result of the Appendix A.10 migration-parity rehearsal. */
export interface ParityResult {
  checks: ParityCheck[];
  verdict: string;
  verdictExpected: string;
  verdictPass: boolean;
  allPass: boolean;
  tolerance: number;
  /** The "as of" instant the figures were recomputed at (the workbook snapshot date). */
  asOf: string;
}

/**
 * Expected FinancialSummary figures the imported workbook should reproduce (from the
 * workbook's own FinancialSummary + Tax sheets). Parity passes when the live services
 * recompute each to within $1.
 */
const EXPECTED = {
  cashReceived: 52463.42,
  outstandingReceivables: 113972.08,
  operatingProfitExVat: 90250,
  netProfitAfterLoans: 76195.71,
  totalTaxLiability: 52062.83,
  loanBalance: 44054.29,
} as const;

const EXPECTED_VERDICT = 'ACT';
const TOLERANCE = 1;

/**
 * The workbook's snapshot date (FinancialSummary "As at" / RptDate). Time-dependent
 * figures — loan interest accrual and overdue tax-debt interest — must be recomputed
 * as of THIS instant to reproduce the spreadsheet, since accrual grows daily.
 */
const WORKBOOK_AS_OF = new Date('2026-07-24T00:00:00.000Z');

/**
 * Migration-parity checker (spec Appendix A.10). Recomputes each FinancialSummary
 * headline the way that sheet defines it and asserts it reproduces the workbook to
 * within $1, as of the workbook's own snapshot date.
 *
 * Cash received, receivables, tax liability, loan balance and the verdict come from
 * the SAME Command Centre health-verdict panel the executive dashboard uses. Operating
 * profit ex VAT and net profit after loans are the workbook's ORDER-CENTRIC figures
 * (order value ex VAT − order expenses, then less loan interest) — a different measure
 * from the app's holistic Performance panel (which folds in contract income + overheads);
 * they are computed here from order data so the rehearsal reproduces the sheet rather
 * than redefining the target.
 */
@Injectable()
export class ParityService {
  constructor(
    private readonly healthVerdict: HealthVerdictPanelService,
    private readonly performance: PerformancePanelService,
    private readonly prisma: PrismaService,
    private readonly loanInterest: LoanInterestService,
  ) {}

  async check(asOf: Date = WORKBOOK_AS_OF): Promise<ParityResult> {
    const health = await this.healthVerdict.compute({ asOf });

    const { operatingProfitExVat, netProfitAfterLoans } = await this.orderCentricProfit(asOf);

    const checks: ParityCheck[] = [
      this.mk('Cash received (orders)', EXPECTED.cashReceived, health.drivers.totalCashReceived),
      this.mk('Outstanding receivables', EXPECTED.outstandingReceivables, health.drivers.receivables),
      this.mk('Operating profit ex VAT', EXPECTED.operatingProfitExVat, operatingProfitExVat, {
        note:
          'Workbook FinancialSummary definition: order-centric (Σ order value ex VAT − Σ order ' +
          'expenses). The app Performance panel reports a broader, holistic operating profit that ' +
          'also recognises contract income and overheads — a different measure by design.',
      }),
      this.mk('Net profit after loans', EXPECTED.netProfitAfterLoans, netProfitAfterLoans, {
        note: 'Operating profit ex VAT less total loan interest accrued as of the snapshot date.',
      }),
      this.mk('Total tax liability', EXPECTED.totalTaxLiability, health.drivers.taxLiability),
      this.mk('Loan balance', EXPECTED.loanBalance, health.drivers.loanBalance),
    ];

    const verdictPass = health.verdict === EXPECTED_VERDICT;
    const allPass = verdictPass && checks.every((c) => c.pass);

    return {
      checks,
      verdict: health.verdict,
      verdictExpected: EXPECTED_VERDICT,
      verdictPass,
      allPass,
      tolerance: TOLERANCE,
      asOf: asOf.toISOString(),
    };
  }

  /**
   * The workbook's order-centric operating profit (ex VAT) and net profit after
   * loans, recomputed from live order data as of `asOf`:
   *   operatingProfitExVat = Σ order value ex VAT − Σ order expenses
   *   netProfitAfterLoans  = operatingProfitExVat − Σ loan interest accrued
   * Loan interest is accrued on the fly (flat weekly rate) so the figure tracks the
   * snapshot date rather than depending on the nightly accrual table.
   */
  private async orderCentricProfit(
    asOf: Date,
  ): Promise<{ operatingProfitExVat: number; netProfitAfterLoans: number }> {
    const [orders, orderExpenses, loans] = await Promise.all([
      this.prisma.order.findMany({ select: { valueExVat: true } }),
      this.prisma.orderExpense.findMany({ select: { amount: true } }),
      this.prisma.loan.findMany({
        where: { status: 'ACTIVE' },
        select: { principal: true, weeklyRatePct: true, startDate: true },
      }),
    ]);

    const orderValue = orders.reduce((sum, o) => sum + this.num(o.valueExVat), 0);
    const orderExpense = orderExpenses.reduce((sum, e) => sum + this.num(e.amount), 0);
    const operatingProfitExVat = orderValue - orderExpense;

    const loanInterest = loans.reduce(
      (sum, l) =>
        sum +
        this.loanInterest.accruedInterest({
          principal: this.num(l.principal),
          weeklyRate: this.num(l.weeklyRatePct) / 100,
          startDate: l.startDate,
          asOfDate: asOf,
        }),
      0,
    );

    return {
      operatingProfitExVat: this.round2(operatingProfitExVat),
      netProfitAfterLoans: this.round2(operatingProfitExVat - loanInterest),
    };
  }

  private num(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return typeof value === 'number' ? value : Number(value);
  }

  private mk(name: string, expected: number, actual: number, extra?: { note?: string }): ParityCheck {
    const delta = this.round2(actual - expected);
    return {
      name,
      expected,
      actual: this.round2(actual),
      delta,
      pass: Math.abs(delta) <= TOLERANCE,
      ...(extra?.note ? { note: extra.note } : {}),
    };
  }

  private round2(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded === 0 ? 0 : rounded;
  }
}
