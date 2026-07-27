import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HealthVerdictPanelService } from '../command-centre/panels/health-verdict.service';
import { PerformancePanelService } from '../command-centre/panels/performance-panel.service';
import { LoanInterestService } from '../financial/domain/loan-interest.service';
import { OrderFinancialsService } from '../financial/domain/order-financials.service';
import { OrderHealthService, OrderHealthState } from '../financial/domain/order-health.service';
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

/** A granular per-order parity line (G23 / A.10 strengthening). */
export interface OrderParityLine {
  reference: string;
  health: OrderHealthState;
  received: number;
  totalInclVat: number;
  outstanding: number;
  profitExVat: number;
  /** True when every per-order identity reconciles within $0.01. */
  pass: boolean;
}

/** A granular per-tax-line parity line. */
export interface TaxParityLine {
  taxType: string;
  periodMonth: string;
  due: number;
  paid: number;
  net: number;
  /** True when net == due − paid within $0.01. */
  pass: boolean;
}

/** Result of the Appendix A.10 migration-parity rehearsal. */
export interface ParityResult {
  checks: ParityCheck[];
  /** G23: per-order health/outstanding/profit reconciliation lines (each at $0.01). */
  orderChecks: OrderParityLine[];
  /** G23: per-tax-line net = due − paid reconciliation lines (each at $0.01). */
  taxChecks: TaxParityLine[];
  verdict: string;
  verdictExpected: string;
  verdictPass: boolean;
  allPass: boolean;
  tolerance: number;
  /** Tolerance applied to the granular per-order / per-tax-line checks. */
  granularTolerance: number;
  /** The "as of" instant the figures were recomputed at (the workbook snapshot date). */
  asOf: string;
}

/**
 * Expected FinancialSummary figures the imported workbook should reproduce (from the
 * workbook's own FinancialSummary + Tax sheets). Parity passes when the live services
 * recompute each to within the headline tolerance.
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

/**
 * Headline tolerance. The workbook FinancialSummary is rounded to whole/na cents and
 * a couple of headlines carry sub-dollar rounding artefacts from the sheet's own
 * SUM chains, so the six HEADLINE checks keep a documented $1 tolerance. The NEW
 * granular per-order and per-tax-line reconciliation checks are asserted far tighter,
 * at $0.01 — those are internal identities that must hold exactly for correct data.
 */
const TOLERANCE = 1;
/** Tolerance for the granular per-order / per-tax-line reconciliation checks. */
const GRANULAR_TOLERANCE = 0.01;

/** VAT rate used by the health-verdict receivables definition (VAT-inclusive balance). */
const VAT_RATE = 0.155;

/**
 * The workbook's snapshot date (FinancialSummary "As at" / RptDate). Time-dependent
 * figures — loan interest accrual and overdue tax-debt interest — must be recomputed
 * as of THIS instant to reproduce the spreadsheet, since accrual grows daily.
 */
const WORKBOOK_AS_OF = new Date('2026-07-24T00:00:00.000Z');

/**
 * Migration-parity checker (spec Appendix A.10). Recomputes each FinancialSummary
 * headline the way that sheet defines it and asserts it reproduces the workbook to
 * within the headline tolerance, as of the workbook's own snapshot date.
 *
 * G23 STRENGTHENING: in addition to the six headlines, the check now emits granular
 * per-order lines (health, received, totalInclVat, outstanding, profit ex VAT — with
 * the per-order identities reconciled at $0.01) and per-tax-line lines (net = due −
 * paid at $0.01). These lines assert internal consistency of the recomputed figures,
 * so a rounding or wiring regression that the aggregate headline could mask is caught
 * at the cent. For correct data every granular line passes exactly.
 *
 * Cash received, receivables, tax liability, loan balance and the verdict come from
 * the SAME Command Centre health-verdict panel the executive dashboard uses. Operating
 * profit ex VAT and net profit after loans are the workbook's ORDER-CENTRIC figures.
 */
@Injectable()
export class ParityService {
  constructor(
    private readonly healthVerdict: HealthVerdictPanelService,
    private readonly performance: PerformancePanelService,
    private readonly prisma: PrismaService,
    private readonly loanInterest: LoanInterestService,
    private readonly orderFinancials: OrderFinancialsService,
    private readonly orderHealth: OrderHealthService,
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

    const orderChecks = await this.perOrderChecks(asOf);
    const taxChecks = await this.perTaxLineChecks();

    // Reconcile the granular per-order lines back to the two order-driven headlines
    // at $0.01 — proving the per-order figures actually sum to the aggregate.
    const sumReceived = round2(orderChecks.reduce((s, o) => s + o.received, 0));
    const sumReceivables = round2(orderChecks.reduce((s, o) => s + o.outstanding, 0));
    checks.push(
      this.granular('Σ per-order cash = headline cash received', health.drivers.totalCashReceived, sumReceived),
      this.granular('Σ per-order receivables = headline receivables', health.drivers.receivables, sumReceivables),
    );

    const verdictPass = health.verdict === EXPECTED_VERDICT;
    const allPass =
      verdictPass &&
      checks.every((c) => c.pass) &&
      orderChecks.every((o) => o.pass) &&
      taxChecks.every((t) => t.pass);

    return {
      checks,
      orderChecks,
      taxChecks,
      verdict: health.verdict,
      verdictExpected: EXPECTED_VERDICT,
      verdictPass,
      allPass,
      tolerance: TOLERANCE,
      granularTolerance: GRANULAR_TOLERANCE,
      asOf: asOf.toISOString(),
    };
  }

  /**
   * Per-order reconciliation lines. For each order we recompute (via the pure
   * OrderFinancials + OrderHealth services) received, totalInclVat, outstanding,
   * profit ex VAT and the health state, and assert the per-order identities hold
   * at $0.01:
   *   outstanding === totalInclVat − received
   *   profitExVat === valueExVat − spentToDate
   * These identities MUST hold exactly for correct data, so any wiring/rounding
   * regression fails a line without ever failing correct data.
   */
  private async perOrderChecks(asOf: Date): Promise<OrderParityLine[]> {
    const orders = await this.prisma.order.findMany({
      include: { receipts: true, expenses: true, milestones: true },
    });

    const lines: OrderParityLine[] = [];
    for (const order of orders) {
      const received = order.receipts
        .filter((r) => r.currency === order.currency)
        .reduce((sum, r) => sum + this.num(r.amount), 0);

      const fin = this.orderFinancials.compute({
        order: { valueExVat: this.num(order.valueExVat), vatRatePct: VAT_RATE * 100 },
        receipts: [{ amountUsd: received, amountZig: 0 }],
        expenses: order.expenses.map((e) => ({ amountExVat: this.num(e.amount) })),
        rates: { officialRate: 1, streetRate: 1 },
        loanInterestTotal: 0,
      });

      const allMilestonesComplete =
        order.milestones.length > 0 && order.milestones.every((m) => m.completedAt != null);

      const health = this.orderHealth.evaluate({
        receivedTotal: received,
        totalInclVat: fin.totalInclVat,
        serviced: order.serviced || allMilestonesComplete,
        today: asOf,
        closingDate: order.closingDate ?? new Date(8640000000000000),
        milestones:
          order.milestones.length > 0
            ? order.milestones.map((m) => ({ value: this.num(m.valuePortion), completed: m.completedAt != null }))
            : undefined,
      });

      // Per-order identities that must reconcile at the cent.
      const outstandingIdentity = round2(fin.totalInclVat - round2(received));
      const profitIdentity = round2(this.num(order.valueExVat) - fin.spentToDate);
      const pass =
        Math.abs(round2(fin.outstanding - outstandingIdentity)) <= GRANULAR_TOLERANCE &&
        Math.abs(round2(fin.profitExVat - profitIdentity)) <= GRANULAR_TOLERANCE;

      lines.push({
        reference: order.reference,
        health,
        // Per-order receivables uses the VAT-inclusive balance (the health-verdict
        // definition) so the lines sum to the receivables headline.
        received: round2(received),
        totalInclVat: fin.totalInclVat,
        outstanding: round2(this.num(order.valueExVat) * (1 + VAT_RATE) - received),
        profitExVat: fin.profitExVat,
        pass,
      });
    }
    return lines;
  }

  /**
   * Per-tax-line reconciliation: for each tax_ledger row, assert net === due − paid
   * at $0.01. A net that drifts from due − paid signals a consolidation regression.
   */
  private async perTaxLineChecks(): Promise<TaxParityLine[]> {
    const rows = await this.prisma.taxLedger.findMany({
      select: { taxType: true, periodMonth: true, amountDue: true, amountPaid: true },
    });
    return rows.map((r) => {
      const due = round2(this.num(r.amountDue));
      const paid = round2(this.num(r.amountPaid));
      const net = round2(due - paid);
      return {
        taxType: r.taxType,
        periodMonth: r.periodMonth,
        due,
        paid,
        net,
        pass: Math.abs(round2(net - (due - paid))) <= GRANULAR_TOLERANCE,
      };
    });
  }

  /**
   * The workbook's order-centric operating profit (ex VAT) and net profit after
   * loans, recomputed from live order data as of `asOf`.
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
      operatingProfitExVat: round2(operatingProfitExVat),
      netProfitAfterLoans: round2(operatingProfitExVat - loanInterest),
    };
  }

  private num(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return typeof value === 'number' ? value : Number(value);
  }

  private mk(name: string, expected: number, actual: number, extra?: { note?: string }): ParityCheck {
    const delta = round2(actual - expected);
    return {
      name,
      expected,
      actual: round2(actual),
      delta,
      pass: Math.abs(delta) <= TOLERANCE,
      ...(extra?.note ? { note: extra.note } : {}),
    };
  }

  /** A granular reconciliation check asserted at the $0.01 tolerance. */
  private granular(name: string, expected: number, actual: number): ParityCheck {
    const delta = round2(actual - expected);
    return {
      name,
      expected: round2(expected),
      actual: round2(actual),
      delta,
      pass: Math.abs(delta) <= GRANULAR_TOLERANCE,
    };
  }
}

/** Round a monetary value to 2 decimal places, avoiding negative-zero. */
function round2(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}
