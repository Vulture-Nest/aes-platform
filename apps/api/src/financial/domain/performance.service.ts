import { Injectable } from '@nestjs/common';

/**
 * Appendix A — Performance (operating profit) domain math.
 *
 * PURE service: no Prisma, no I/O, no dependencies. All inputs are plain
 * typed values and all outputs are computed. Callers are responsible for
 * loading rows, converting Prisma.Decimal to number, and persisting results.
 *
 * Rules (Appendix A):
 *  - income   = serviced order values ex VAT + claims ex VAT.
 *               Unserviced orders are EXCLUDED from income.
 *  - expenses = order + general + overheads + loan interest.
 *  - operatingProfit = income - expenses.
 *  - margin   = income ? operatingProfit / income : null
 *               (null when income is zero — division is undefined).
 *  - pendingObligations = sum of approved-pending-funds amounts.
 *
 * Money is treated as a plain number here (single currency, already
 * normalised by the caller). Results are rounded to 2 decimal places to
 * mirror the Decimal(20,2) storage of the persisted figures.
 */

/** An order line considered for income. Only serviced orders contribute. */
export interface OrderIncomeLine {
  /** Order value excluding VAT (already FX-normalised by the caller). */
  valueExVat: number;
  /** Whether the order has been serviced (delivered/fulfilled). */
  serviced: boolean;
}

/** A claim line. Claims contribute to income ex VAT regardless of order state. */
export interface ClaimIncomeLine {
  /** Claim value excluding VAT. */
  amountExVat: number;
}

/** The four expense buckets that make up total expenses. */
export interface ExpenseBreakdown {
  /** Direct order/job costs. */
  order: number;
  /** General expenses. */
  general: number;
  /** Overheads. */
  overheads: number;
  /** Loan interest expense. */
  loanInterest: number;
}

/** An obligation that is approved but still awaiting funding. */
export interface PendingObligationLine {
  amount: number;
}

/** Fully-computed performance figures for a reporting window. */
export interface PerformanceResult {
  /** Serviced order income ex VAT (unserviced excluded). */
  servicedOrderIncome: number;
  /** Claims income ex VAT. */
  claimsIncome: number;
  /** Total income = servicedOrderIncome + claimsIncome. */
  income: number;
  /** Total expenses across the four buckets. */
  expenses: number;
  /** operatingProfit = income - expenses. */
  operatingProfit: number;
  /** margin = income ? operatingProfit / income : null. */
  margin: number | null;
}

@Injectable()
export class PerformanceService {
  /** Round to 2 decimal places (money), avoiding negative-zero. */
  private round2(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded === 0 ? 0 : rounded;
  }

  /** Round a ratio to 4 decimal places (margin precision). */
  private round4(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 10000) / 10000;
    return rounded === 0 ? 0 : rounded;
  }

  /**
   * Serviced order income ex VAT. Unserviced orders are excluded entirely.
   */
  servicedOrderIncome(orders: readonly OrderIncomeLine[]): number {
    const total = orders.reduce((sum, o) => (o.serviced ? sum + o.valueExVat : sum), 0);
    return this.round2(total);
  }

  /** Claims income ex VAT (all claims count). */
  claimsIncome(claims: readonly ClaimIncomeLine[]): number {
    const total = claims.reduce((sum, c) => sum + c.amountExVat, 0);
    return this.round2(total);
  }

  /** income = serviced order values ex VAT + claims ex VAT. */
  income(orders: readonly OrderIncomeLine[], claims: readonly ClaimIncomeLine[]): number {
    return this.round2(this.servicedOrderIncome(orders) + this.claimsIncome(claims));
  }

  /** expenses = order + general + overheads + loan interest. */
  expenses(breakdown: ExpenseBreakdown): number {
    return this.round2(
      breakdown.order + breakdown.general + breakdown.overheads + breakdown.loanInterest,
    );
  }

  /** operatingProfit = income - expenses. */
  operatingProfit(income: number, expenses: number): number {
    return this.round2(income - expenses);
  }

  /**
   * margin = operatingProfit / income, or null when income is zero
   * (the ratio is undefined). Rounded to 4 dp.
   */
  margin(income: number, operatingProfit: number): number | null {
    if (income === 0) {
      return null;
    }
    return this.round4(operatingProfit / income);
  }

  /**
   * Compute the full performance snapshot from raw lines.
   */
  compute(input: {
    orders: readonly OrderIncomeLine[];
    claims: readonly ClaimIncomeLine[];
    expenses: ExpenseBreakdown;
  }): PerformanceResult {
    const servicedOrderIncome = this.servicedOrderIncome(input.orders);
    const claimsIncome = this.claimsIncome(input.claims);
    const income = this.round2(servicedOrderIncome + claimsIncome);
    const expenses = this.expenses(input.expenses);
    const operatingProfit = this.operatingProfit(income, expenses);
    const margin = this.margin(income, operatingProfit);
    return {
      servicedOrderIncome,
      claimsIncome,
      income,
      expenses,
      operatingProfit,
      margin,
    };
  }

  /**
   * pendingObligations = sum of approved-pending-funds amounts passed in.
   */
  pendingObligations(obligations: readonly PendingObligationLine[]): number {
    const total = obligations.reduce((sum, o) => sum + o.amount, 0);
    return this.round2(total);
  }
}
