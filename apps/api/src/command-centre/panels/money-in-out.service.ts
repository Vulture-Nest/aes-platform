import { Injectable } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ExchangeRatesService } from '../../reference/exchange-rates/exchange-rates.service';
import { RateType } from '../../reference/exchange-rates/rate-type.enum';

/**
 * Command Centre — Panel 2: Money in vs out.
 *
 * Read-only. Aggregates cash inflows and outflows over a reporting window and
 * groups them into time buckets (day / week / month), returning inflow, outflow
 * and net per bucket plus a grand total.
 *
 *   inflows  = order_receipts + contract_claims
 *   outflows = order_expenses + general_expenses + overheads
 *              + loan repayments + tax paid
 *
 * All money is normalised to a single reporting currency (default USD) via the
 * ExchangeRatesService so buckets sum across currencies. FX conversion failures
 * fall back to the raw amount (1:1) so a missing rate never crashes the panel.
 */

/** Bucketing granularity for the panel. Query-only enum (not persisted). */
export enum MoneyWindow {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

/** Params accepted by compute(). All optional. */
export interface MoneyInOutParams {
  /** Bucket granularity. Defaults to MONTH. */
  window?: MoneyWindow;
  /** Inclusive lower bound for all date filters. */
  from?: Date;
  /** Exclusive upper bound for all date filters. */
  to?: Date;
  /** Currency all amounts are normalised to. Defaults to USD. */
  currency?: Currency;
}

/** One time bucket with its inflow / outflow / net figures. */
export interface MoneyBucket {
  /** Canonical bucket key: YYYY-MM-DD (day), YYYY-Www (week) or YYYY-MM (month). */
  bucket: string;
  inflow: number;
  outflow: number;
  /** net = inflow - outflow. */
  net: number;
}

/** Full panel result. */
export interface MoneyInOutResult {
  window: MoneyWindow;
  currency: Currency;
  buckets: MoneyBucket[];
  totals: {
    inflow: number;
    outflow: number;
    net: number;
  };
}

/** A single dated money movement, pre-normalisation. */
interface Movement {
  date: Date;
  amount: number;
  currency: Currency;
}

/** ms in one day — used for ISO-week bucketing. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class MoneyInOutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  /** Prisma.Decimal | number | null | undefined -> number (0 when nullish). */
  private num(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return typeof value === 'number' ? value : value.toNumber();
  }

  /** Round to 2 dp (money), avoiding negative-zero. */
  private round2(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded === 0 ? 0 : rounded;
  }

  /** Build a `{ gte?, lt? }` date filter, or undefined when neither bound is set. */
  private dateFilter(from?: Date, to?: Date): { gte?: Date; lt?: Date } | undefined {
    if (!from && !to) {
      return undefined;
    }
    const filter: { gte?: Date; lt?: Date } = {};
    if (from) {
      filter.gte = from;
    }
    if (to) {
      filter.lt = to;
    }
    return filter;
  }

  /**
   * Convert `amount` from `currency` into `target` using the rate effective on
   * `date`. Same currency is 1:1. A missing/invalid rate falls back to 1:1 so the
   * panel degrades gracefully rather than throwing.
   */
  private async convert(
    amount: number,
    currency: Currency,
    target: Currency,
    date: Date,
  ): Promise<number> {
    if (amount === 0 || currency === target) {
      return amount;
    }
    const pair = `${currency}${target}`;
    try {
      const { rate } = await this.exchangeRates.rateAsOf(pair, date, RateType.OFFICIAL);
      const parsed = Number(rate);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return amount;
      }
      return amount * parsed;
    } catch {
      // No rate on file for this pair/date — degrade to 1:1.
      return amount;
    }
  }

  /** Assign a canonical bucket key to a date for the requested window. */
  private bucketKey(date: Date, window: MoneyWindow): string {
    const y = date.getUTCFullYear();
    const m = `${date.getUTCMonth() + 1}`.padStart(2, '0');
    if (window === MoneyWindow.MONTH) {
      return `${y}-${m}`;
    }
    if (window === MoneyWindow.DAY) {
      const d = `${date.getUTCDate()}`.padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    // ISO-week (window === WEEK): YYYY-Www.
    return this.isoWeekKey(date);
  }

  /** ISO-8601 week key (YYYY-Www) for a date, computed in UTC. */
  private isoWeekKey(date: Date): string {
    // Copy to a UTC midnight to avoid TZ drift.
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    // ISO weeks start Monday; shift to the Thursday of this week.
    const dayNum = (d.getUTCDay() + 6) % 7; // Mon=0 .. Sun=6
    d.setUTCDate(d.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
    firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
    const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * MS_PER_DAY));
    return `${d.getUTCFullYear()}-W${`${week}`.padStart(2, '0')}`;
  }

  /**
   * Compute the panel. Loads inflow/outflow movements within the window, converts
   * each to the reporting currency, groups by bucket and returns per-bucket +
   * grand-total figures.
   */
  async compute(params: MoneyInOutParams = {}): Promise<MoneyInOutResult> {
    const window = params.window ?? MoneyWindow.MONTH;
    const target = params.currency ?? Currency.USD;
    const { from, to } = params;

    const [inflows, outflows] = await Promise.all([
      this.loadInflows(from, to),
      this.loadOutflows(from, to),
    ]);

    // Accumulate per-bucket inflow/outflow after FX normalisation.
    const byBucket = new Map<string, { inflow: number; outflow: number }>();

    const apply = async (movements: Movement[], side: 'inflow' | 'outflow') => {
      for (const mv of movements) {
        const converted = await this.convert(mv.amount, mv.currency, target, mv.date);
        const key = this.bucketKey(mv.date, window);
        const cell = byBucket.get(key) ?? { inflow: 0, outflow: 0 };
        cell[side] += converted;
        byBucket.set(key, cell);
      }
    };

    await apply(inflows, 'inflow');
    await apply(outflows, 'outflow');

    // Deterministic ordering by bucket key (keys are lexically sortable).
    const buckets: MoneyBucket[] = [...byBucket.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([bucket, cell]) => {
        const inflow = this.round2(cell.inflow);
        const outflow = this.round2(cell.outflow);
        return { bucket, inflow, outflow, net: this.round2(inflow - outflow) };
      });

    const totalInflow = this.round2(buckets.reduce((s, b) => s + b.inflow, 0));
    const totalOutflow = this.round2(buckets.reduce((s, b) => s + b.outflow, 0));

    return {
      window,
      currency: target,
      buckets,
      totals: {
        inflow: totalInflow,
        outflow: totalOutflow,
        net: this.round2(totalInflow - totalOutflow),
      },
    };
  }

  /** inflows = order_receipts + contract_claims. */
  private async loadInflows(from?: Date, to?: Date): Promise<Movement[]> {
    const [receipts, claims] = await Promise.all([
      this.prisma.orderReceipt.findMany({
        where: { receivedDate: this.dateFilter(from, to) },
        select: { amount: true, currency: true, receivedDate: true },
      }),
      this.prisma.contractClaim.findMany({
        where: { claimDate: this.dateFilter(from, to) },
        select: { amountExVat: true, currency: true, claimDate: true },
      }),
    ]);

    return [
      ...receipts.map((r) => ({
        date: r.receivedDate,
        amount: this.num(r.amount),
        currency: r.currency,
      })),
      ...claims.map((c) => ({
        date: c.claimDate,
        amount: this.num(c.amountExVat),
        currency: c.currency,
      })),
    ];
  }

  /**
   * outflows = order_expenses + general_expenses + overheads
   *            + loan repayments + tax paid.
   *
   * order_expenses and overheads have no dedicated event date, so they are dated
   * by createdAt. tax paid uses tax_ledger.amount_paid dated by updatedAt (when
   * the payment was recorded). Zero tax-paid rows are skipped.
   */
  private async loadOutflows(from?: Date, to?: Date): Promise<Movement[]> {
    const [orderExpenses, generalExpenses, overheads, repayments, taxLedger] = await Promise.all([
      this.prisma.orderExpense.findMany({
        where: { createdAt: this.dateFilter(from, to) },
        select: { amount: true, currency: true, createdAt: true },
      }),
      this.prisma.generalExpense.findMany({
        where: { expenseDate: this.dateFilter(from, to) },
        select: { amount: true, currency: true, expenseDate: true },
      }),
      this.prisma.overhead.findMany({
        where: { createdAt: this.dateFilter(from, to) },
        select: { amount: true, currency: true, createdAt: true },
      }),
      this.prisma.loanRepayment.findMany({
        where: { repaidDate: this.dateFilter(from, to) },
        select: { amount: true, currency: true, repaidDate: true },
      }),
      this.prisma.taxLedger.findMany({
        where: { updatedAt: this.dateFilter(from, to) },
        select: { amountPaid: true, currency: true, updatedAt: true },
      }),
    ]);

    return [
      ...orderExpenses.map((e) => ({
        date: e.createdAt,
        amount: this.num(e.amount),
        currency: e.currency,
      })),
      ...generalExpenses.map((e) => ({
        date: e.expenseDate,
        amount: this.num(e.amount),
        currency: e.currency,
      })),
      ...overheads.map((o) => ({
        date: o.createdAt,
        amount: this.num(o.amount),
        currency: o.currency,
      })),
      ...repayments.map((r) => ({
        date: r.repaidDate,
        amount: this.num(r.amount),
        currency: r.currency,
      })),
      ...taxLedger
        .map((t) => ({
          date: t.updatedAt,
          amount: this.num(t.amountPaid),
          currency: t.currency,
        }))
        .filter((m) => m.amount > 0),
    ];
  }
}
