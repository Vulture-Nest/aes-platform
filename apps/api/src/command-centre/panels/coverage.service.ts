import { Injectable } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExchangeRatesService } from '../../reference/exchange-rates/exchange-rates.service';

/**
 * Command Centre — Panel 4: Orders vs payroll & expenses (coverage).
 *
 * Headline question: does the money we still expect to collect (expected-in)
 * cover the money we are committed to pay out (expected-out)?
 *
 *   expected-in  = outstanding on open + serviced-unpaid orders
 *                  (per order: valueExVat - receipts, counted only when > 0).
 *   expected-out = committed overheads + approved (undisbursed) requisitions
 *                  (+ payroll when a payroll source exists, else 0).
 *   coverageRatio = expectedIn / expectedOut  (null when expectedOut == 0).
 *
 * All figures are normalised to a single reporting currency (USD by default)
 * using the effective FX rate as of the compute date. This service is READ-ONLY:
 * it never writes to the database.
 */

/** Requisition statuses that are approved but not yet paid out (pending obligations). */
const APPROVED_UNDISBURSED_STATUSES = ['APPROVED_PENDING_FUNDS', 'APPROVED_READY_TO_PAY'] as const;

/** Optional inputs to {@link CoverageService.compute}. */
export interface CoverageParams {
  /** Reporting currency to normalise to. Defaults to USD. */
  currency?: Currency;
  /** As-of date for FX conversion and the outstanding snapshot. Defaults to now. */
  asOf?: Date;
}

/** One expected-out bucket contributing to the committed outflow total. */
export interface CoverageOutflowBreakdown {
  /** Committed overheads. */
  overheads: number;
  /** Approved, undisbursed requisitions (pending obligations). */
  requisitions: number;
  /** Payroll commitment, or 0 when no payroll source is available. */
  payroll: number;
}

/** Typed result returned by {@link CoverageService.compute}. */
export interface CoveragePanelResult {
  /** Panel identifier (stable key for the front end). */
  panel: 'orders_vs_payroll_expenses';
  /** Reporting currency all figures are expressed in. */
  currency: Currency;
  /** Snapshot / FX as-of timestamp (ISO string). */
  asOf: string;
  /** Money we still expect to collect from outstanding orders. */
  expectedIn: number;
  /** Money we are committed to pay out. */
  expectedOut: number;
  /** Breakdown of the expected-out figure. */
  outflowBreakdown: CoverageOutflowBreakdown;
  /** Number of orders contributing to expected-in (outstanding > 0). */
  outstandingOrderCount: number;
  /** Whether a payroll source was available (payroll is 0 when false). */
  payrollAvailable: boolean;
  /** expectedIn / expectedOut, or null when expectedOut is 0 (undefined ratio). */
  coverageRatio: number | null;
}

@Injectable()
export class CoverageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  /**
   * Compute the coverage panel. Normalises every row to `currency` (USD by
   * default) at the effective FX rate as of `asOf`, guards divide-by-zero, and
   * handles empty data by returning zeros with a null ratio.
   */
  async compute(params?: CoverageParams): Promise<CoveragePanelResult> {
    const currency = params?.currency ?? Currency.USD;
    const asOf = params?.asOf ?? new Date();

    // Cache FX rates per source currency so we hit the rate table at most once
    // per foreign currency for the whole computation.
    const rateCache = new Map<Currency, number>();
    const toReporting = async (amount: number, from: Currency): Promise<number> => {
      if (amount === 0 || from === currency) {
        return amount;
      }
      let rate = rateCache.get(from);
      if (rate === undefined) {
        rate = await this.fxRate(from, currency, asOf);
        rateCache.set(from, rate);
      }
      return rate > 0 ? amount * rate : 0;
    };

    const [expectedIn, outstandingOrderCount] = await this.expectedIn(toReporting);
    const outflowBreakdown = await this.expectedOut(toReporting);
    const payrollAvailable = false;

    const expectedOut = this.round2(
      outflowBreakdown.overheads + outflowBreakdown.requisitions + outflowBreakdown.payroll,
    );

    const coverageRatio = expectedOut === 0 ? null : this.round4(expectedIn / expectedOut);

    return {
      panel: 'orders_vs_payroll_expenses',
      currency,
      asOf: asOf.toISOString(),
      expectedIn,
      expectedOut,
      outflowBreakdown,
      outstandingOrderCount,
      payrollAvailable,
      coverageRatio,
    };
  }

  /**
   * expected-in = sum of outstanding on open + serviced-unpaid orders.
   * Per order, outstanding = valueExVat - receipts; only positive balances count
   * (a fully-paid or overpaid order contributes nothing). Returns the total and
   * the count of contributing orders.
   */
  private async expectedIn(
    toReporting: (amount: number, from: Currency) => Promise<number>,
  ): Promise<[number, number]> {
    const orders = await this.prisma.order.findMany({
      include: { receipts: { select: { amount: true, currency: true } } },
    });

    let total = 0;
    let count = 0;
    for (const order of orders) {
      const value = await toReporting(this.num(order.valueExVat), order.currency);
      let received = 0;
      for (const receipt of order.receipts) {
        received += await toReporting(this.num(receipt.amount), receipt.currency);
      }
      const outstanding = value - received;
      if (outstanding > 0) {
        total += outstanding;
        count += 1;
      }
    }
    return [this.round2(total), count];
  }

  /**
   * expected-out = committed overheads + approved (undisbursed) requisitions
   * + payroll (0 when no payroll source exists).
   */
  private async expectedOut(
    toReporting: (amount: number, from: Currency) => Promise<number>,
  ): Promise<CoverageOutflowBreakdown> {
    const overheadRows = await this.prisma.overhead.findMany({
      select: { amount: true, currency: true },
    });
    let overheads = 0;
    for (const row of overheadRows) {
      overheads += await toReporting(this.num(row.amount), row.currency);
    }

    const requisitionRows = await this.prisma.requisition.findMany({
      where: { status: { in: [...APPROVED_UNDISBURSED_STATUSES] } },
      select: { amount: true, currency: true },
    });
    let requisitions = 0;
    for (const row of requisitionRows) {
      requisitions += await toReporting(this.num(row.amount), row.currency);
    }

    // Payroll: no payroll model exists in the schema yet, so this is 0 by
    // definition. The bucket is kept explicit so wiring a payroll source later
    // is a one-line change and the panel shape stays stable.
    const payroll = 0;

    return {
      overheads: this.round2(overheads),
      requisitions: this.round2(requisitions),
      payroll: this.round2(payroll),
    };
  }

  /**
   * Effective FX multiplier to convert `from` into `to` as of `date`.
   * Rates are quoted as units of the second currency per one unit of the first
   * ("USD/ZWG" => ZWG per 1 USD). To convert ZWG -> USD we divide by the USD/ZWG
   * rate; to convert USD -> ZWG we multiply. Returns 0 on any missing/invalid
   * rate so a foreign leg contributes nothing rather than NaN/Infinity.
   */
  private async fxRate(from: Currency, to: Currency, date: Date): Promise<number> {
    if (from === to) {
      return 1;
    }
    try {
      // Look up the pair in the canonical "TO/FROM"? We store as "USD/ZWG"
      // (ZWG per 1 USD). Convert FROM -> TO by locating that pair.
      const pair = `${to}/${from}`;
      const { rate } = await this.exchangeRates.rateAsOf(pair, date);
      const value = Number(rate);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      // No rate on record for this pair/date — treat the foreign leg as 0.
      return 0;
    }
  }

  /** Prisma.Decimal | number | null -> number. */
  private num(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return typeof value === 'number' ? value : Number(value);
  }

  /** Round to 2 decimal places (money), avoiding negative-zero. */
  private round2(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded === 0 ? 0 : rounded;
  }

  /** Round a ratio to 4 decimal places. */
  private round4(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 10000) / 10000;
    return rounded === 0 ? 0 : rounded;
  }
}
