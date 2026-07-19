import { Injectable } from '@nestjs/common';

/**
 * OrderFinancials — PURE domain math for a single order.
 *
 * This service is intentionally self-contained: no Prisma, no I/O, no injected
 * dependencies. It takes plain typed inputs and returns computed results using
 * plain `number` math (never Prisma.Decimal). Rounding is applied only where the
 * spec calls for a monetary figure (2 decimal places).
 *
 * The `classic` strategy uses a single settings-provided rate pair (official /
 * street) for the whole order. The `improve` per-receipt-date strategy is NOT
 * implemented here — the `strategy` flag exists only to reserve the shape.
 */

/** Rate conversion strategy. Only CLASSIC is implemented. */
export enum RateStrategy {
  /** Single settings rate pair applied to the whole order. */
  CLASSIC = 'CLASSIC',
  /** Per-receipt-date rates — reserved, not implemented. */
  IMPROVE = 'IMPROVE',
}

/** The order header figures needed for the computation. */
export interface OrderInput {
  /** Order value excluding VAT (positive money amount). */
  valueExVat: number;
  /** VAT rate as a percentage, e.g. 15 for 15%. */
  vatRatePct: number;
  /** Closing date of the order (used by callers / IMPROVE mode only). */
  closingDate?: Date | null;
  /** Whether the order has been serviced. */
  serviced?: boolean;
}

/**
 * A receipt against the order. Amounts are split by the currency they were
 * actually received in: USD directly, ZWG ("zig") to be converted via a rate.
 */
export interface ReceiptInput {
  /** Amount received in USD. */
  amountUsd: number;
  /** Amount received in ZWG ("zig"). */
  amountZig: number;
}

/** An expense line against the order. */
export interface ExpenseInput {
  /** Expense amount excluding VAT. */
  amountExVat: number;
}

/** Settings-provided conversion rates (ZWG per 1 USD). */
export interface RateSettings {
  /** Official RBZ rate: ZWG per 1 USD. */
  officialRate: number;
  /** Street / parallel-market rate: ZWG per 1 USD. */
  streetRate: number;
}

/** Full input bundle for {@link OrderFinancialsService.compute}. */
export interface OrderFinancialsInput {
  order: OrderInput;
  receipts: ReceiptInput[];
  expenses: ExpenseInput[];
  rates: RateSettings;
  /** Total interest across loans linked to this order. */
  loanInterestTotal: number;
  /** Conversion strategy. Defaults to CLASSIC. */
  strategy?: RateStrategy;
}

/** Computed financial snapshot for an order. All money rounded to 2 dp. */
export interface OrderFinancialsResult {
  /** VAT amount = valueExVat * vatRatePct / 100. */
  vat: number;
  /** valueExVat + vat. */
  totalInclVat: number;
  /** Sum of expenses (ex VAT). */
  spentToDate: number;
  /** Received value using the official rate: usd + zig / officialRate. */
  receivedOfficial: number;
  /** Received value using the street rate: usd + zig / streetRate. */
  receivedStreet: number;
  /** totalInclVat - receivedOfficial (positive => still owed to us). */
  outstanding: number;
  /** valueExVat - spentToDate. */
  profitExVat: number;
  /** profitExVat - loanInterestTotal. */
  netProfit: number;
  /** netProfit / valueExVat, or null when valueExVat is zero. */
  margin: number | null;
}

@Injectable()
export class OrderFinancialsService {
  /** Round a monetary value to 2 decimal places, avoiding -0. */
  private round2(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded === 0 ? 0 : rounded;
  }

  /** Sum USD-denominated receipt legs plus ZWG legs converted at `rate`. */
  private receivedAt(receipts: ReceiptInput[], rate: number): number {
    let total = 0;
    for (const r of receipts) {
      total += r.amountUsd;
      if (r.amountZig !== 0) {
        // A zero or missing rate means the ZWG leg contributes nothing rather
        // than producing Infinity/NaN.
        total += rate > 0 ? r.amountZig / rate : 0;
      }
    }
    return total;
  }

  /**
   * Compute the full financial snapshot for an order.
   *
   * Only the CLASSIC strategy is implemented; any other strategy throws so the
   * unimplemented IMPROVE path can never silently return wrong numbers.
   */
  compute(input: OrderFinancialsInput): OrderFinancialsResult {
    const strategy = input.strategy ?? RateStrategy.CLASSIC;
    if (strategy !== RateStrategy.CLASSIC) {
      throw new Error(`OrderFinancials: strategy ${strategy} is not implemented`);
    }

    const { order, receipts, expenses, rates, loanInterestTotal } = input;

    const vat = this.round2((order.valueExVat * order.vatRatePct) / 100);
    const totalInclVat = this.round2(order.valueExVat + vat);

    const spentToDate = this.round2(expenses.reduce((sum, e) => sum + e.amountExVat, 0));

    const receivedOfficial = this.round2(this.receivedAt(receipts, rates.officialRate));
    const receivedStreet = this.round2(this.receivedAt(receipts, rates.streetRate));

    const outstanding = this.round2(totalInclVat - receivedOfficial);

    const profitExVat = this.round2(order.valueExVat - spentToDate);
    const netProfit = this.round2(profitExVat - loanInterestTotal);

    const margin = order.valueExVat !== 0 ? this.round2(netProfit / order.valueExVat) : null;

    return {
      vat,
      totalInclVat,
      spentToDate,
      receivedOfficial,
      receivedStreet,
      outstanding,
      profitExVat,
      netProfit,
      margin,
    };
  }
}
