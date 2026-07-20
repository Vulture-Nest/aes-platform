import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PerformanceService } from '../../financial/domain/performance.service';
import { ExchangeRatesService } from '../../reference/exchange-rates/exchange-rates.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Command Centre — Performance (revenue & profit) panel.
 *
 * Surfaces the Appendix A operating-profit model against live data:
 *   income          = serviced order values ex VAT + contract claims ex VAT
 *                     (unserviced orders are NOT yet recognised as revenue)
 *   expenses        = order + general + overheads + loan interest
 *   operatingProfit = income - expenses
 *   margin          = operatingProfit / income
 *
 * Every row is normalised to a single reporting currency (USD by default) at the
 * effective FX rate as of the compute date; a foreign leg with no rate on record
 * contributes 0 rather than corrupting the total. Read-only.
 */
export interface PerformancePanelResult {
  panel: 'performance';
  currency: string;
  asOf: string;
  /** Value of the whole order book ex VAT (serviced + open) — the pipeline. */
  bookedOrderValue: number;
  /** Recognised revenue from serviced orders (ex VAT). */
  servicedOrderIncome: number;
  /** Recognised revenue from contract claims (ex VAT). */
  claimsIncome: number;
  /** income = servicedOrderIncome + claimsIncome. */
  income: number;
  /** Total expenses across the four buckets. */
  expenses: number;
  expenseBreakdown: { order: number; general: number; overheads: number; loanInterest: number };
  /** operatingProfit = income - expenses. */
  operatingProfit: number;
  /** operatingProfit / income, null when income is zero. */
  margin: number | null;
  orderCount: number;
  servicedOrderCount: number;
}

@Injectable()
export class PerformancePanelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly performance: PerformanceService,
  ) {}

  async compute(params?: { currency?: string; asOf?: Date }): Promise<PerformancePanelResult> {
    const currency = params?.currency ?? 'USD';
    const asOf = params?.asOf ?? new Date();

    const rateCache = new Map<string, number>();
    const toReporting = async (amount: number, from: string): Promise<number> => {
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

    const [orders, claims, orderExp, generalExp, overheads, loanInt] = await Promise.all([
      this.prisma.order.findMany({ select: { valueExVat: true, currency: true, serviced: true } }),
      this.prisma.contractClaim.findMany({ select: { amountExVat: true, currency: true } }),
      this.prisma.orderExpense.findMany({ select: { amount: true, currency: true } }),
      this.prisma.generalExpense.findMany({ select: { amount: true, currency: true } }),
      this.prisma.overhead.findMany({ select: { amount: true, currency: true } }),
      this.prisma.loanInterest.findMany({ select: { amount: true, currency: true } }),
    ]);

    let bookedOrderValue = 0;
    let servicedOrderCount = 0;
    const orderLines: { valueExVat: number; serviced: boolean }[] = [];
    for (const o of orders) {
      const value = await toReporting(this.num(o.valueExVat), o.currency);
      bookedOrderValue += value;
      if (o.serviced) servicedOrderCount += 1;
      orderLines.push({ valueExVat: value, serviced: o.serviced });
    }

    const claimLines: { amountExVat: number }[] = [];
    for (const c of claims) {
      claimLines.push({ amountExVat: await toReporting(this.num(c.amountExVat), c.currency) });
    }

    const sumConverted = async (rows: { amount: Prisma.Decimal; currency: string }[]) => {
      let total = 0;
      for (const r of rows) {
        total += await toReporting(this.num(r.amount), r.currency);
      }
      return total;
    };
    const expenseBreakdown = {
      order: await sumConverted(orderExp),
      general: await sumConverted(generalExp),
      overheads: await sumConverted(overheads),
      loanInterest: await sumConverted(loanInt),
    };

    const perf = this.performance.compute({
      orders: orderLines,
      claims: claimLines,
      expenses: expenseBreakdown,
    });

    return {
      panel: 'performance',
      currency,
      asOf: asOf.toISOString(),
      bookedOrderValue: this.round2(bookedOrderValue),
      servicedOrderIncome: perf.servicedOrderIncome,
      claimsIncome: perf.claimsIncome,
      income: perf.income,
      expenses: perf.expenses,
      expenseBreakdown: {
        order: this.round2(expenseBreakdown.order),
        general: this.round2(expenseBreakdown.general),
        overheads: this.round2(expenseBreakdown.overheads),
        loanInterest: this.round2(expenseBreakdown.loanInterest),
      },
      operatingProfit: perf.operatingProfit,
      margin: perf.margin,
      orderCount: orders.length,
      servicedOrderCount,
    };
  }

  /** Effective multiplier to convert `from` into `to`; 0 on any missing/invalid rate. */
  private async fxRate(from: string, to: string, date: Date): Promise<number> {
    if (from === to) {
      return 1;
    }
    try {
      const { rate } = await this.exchangeRates.rateAsOf(`${to}/${from}`, date);
      const value = Number(rate);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch {
      return 0;
    }
  }

  private num(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return typeof value === 'number' ? value : Number(value);
  }

  private round2(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded === 0 ? 0 : rounded;
  }
}
