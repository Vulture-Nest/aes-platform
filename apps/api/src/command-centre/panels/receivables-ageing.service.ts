import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  OrderFinancialsService,
  RateSettings,
} from '../../financial/domain/order-financials.service';
import { ExchangeRatesService } from '../../reference/exchange-rates/exchange-rates.service';
import { ThresholdsService } from '../../reference/thresholds/thresholds.service';
import { PrismaService } from '../../prisma/prisma.service';

/** ms in one day — used for ageing arithmetic. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Statutory key for the standard VAT rate (percentage, e.g. 15 for 15%). */
const VAT_RATE_KEY = 'vat_standard';
/** Fallback VAT percentage when no statutory value is configured. */
const DEFAULT_VAT_PCT = 15;

/** Threshold key for the overdue cutoff in days. */
const OVERDUE_DAYS_KEY = 'receivables_overdue_days';
/** Fallback overdue cutoff (days past the reference date) when unconfigured. */
const DEFAULT_OVERDUE_DAYS = 30;

/** The four fixed ageing buckets, in evaluation order. */
export type AgeBucketKey = '0-30' | '31-60' | '61-90' | '90+';

/** Prisma.Decimal | number | null | undefined -> number (never NaN). */
function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === 'number' ? value : Number(value);
}

/** Round a monetary value to 2 dp, avoiding -0. */
function round2(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/** Optional inputs to {@link ReceivablesAgeingService.compute}. */
export interface ReceivablesAgeingParams {
  /** Reference "today" for ageing. Defaults to now. */
  asOf?: Date;
}

/** One outstanding order line within a client's ageing breakdown. */
export interface AgeingOrderLine {
  orderId: string;
  reference: string;
  currency: string;
  /** Order value including VAT. */
  totalInclVat: number;
  /** Total received against the order (in the order currency). */
  received: number;
  /** totalInclVat - received (always > 0 for a line to be included). */
  outstanding: number;
  /** Age in days from closingDate (or createdAt when unset) to the reference date. */
  ageDays: number;
  /** The bucket this line falls into. */
  bucket: AgeBucketKey;
  /** Whether the line is past the overdue cutoff. */
  overdue: boolean;
}

/** Per-currency outstanding split across the four buckets. */
export interface AgeingBuckets {
  '0-30': number;
  '31-60': number;
  '61-90': number;
  '90+': number;
}

/** Ageing rollup for a single client. */
export interface ClientAgeing {
  clientId: string;
  clientName: string;
  currency: string;
  /** Total outstanding for this client in this currency. */
  totalOutstanding: number;
  /** Outstanding split by bucket. */
  buckets: AgeingBuckets;
  /** Outstanding that is past the overdue cutoff. */
  overdueOutstanding: number;
  /** The individual outstanding order lines. */
  lines: AgeingOrderLine[];
}

/** The full typed panel result. */
export interface ReceivablesAgeingResult {
  asOf: string;
  /** Per (client, currency) ageing rollups, most-outstanding first. */
  clients: ClientAgeing[];
  /** Grand totals per currency. */
  totalsByCurrency: Record<string, number>;
  /** Grand totals per bucket, per currency. */
  bucketsByCurrency: Record<string, AgeingBuckets>;
  /** Total overdue outstanding per currency. */
  overdueByCurrency: Record<string, number>;
  /**
   * A single USD-equivalent headline of all outstanding. ZWG is converted at the
   * official ZWG/USD rate as of the reference date; null when that rate is missing.
   */
  totalOutstandingUsd: number | null;
  /** Number of outstanding order lines across all clients. */
  orderCount: number;
}

/** An order row with its receipts, as loaded from Prisma. */
type OrderWithReceipts = Prisma.OrderGetPayload<{
  include: { receipts: true; client: true };
}>;

/**
 * ReceivablesAgeingService — Command Centre Panel 5 (Receivables ageing).
 *
 * Read-only. For every order it computes outstanding = total (incl VAT) minus
 * receipts (via {@link OrderFinancialsService}), ages each outstanding order by
 * its closing date (falling back to creation date) into 0-30 / 31-60 / 61-90 /
 * 90+ day buckets, flags lines past the overdue cutoff, and rolls the result up
 * per client and per currency. A single USD-equivalent headline is produced by
 * converting ZWG at the official rate.
 *
 * All FX/VAT/threshold parameters are resolved once up front so the per-order
 * loop stays pure. Empty data and divide-by-zero are handled throughout.
 */
@Injectable()
export class ReceivablesAgeingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orderFinancials: OrderFinancialsService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly thresholds: ThresholdsService,
  ) {}

  /** Compute the receivables ageing panel. */
  async compute(params?: ReceivablesAgeingParams): Promise<ReceivablesAgeingResult> {
    const asOf = params?.asOf ?? new Date();

    const [orders, vatPct, overdueDays] = await Promise.all([
      this.prisma.order.findMany({
        include: { receipts: true, client: true },
      }) as Promise<OrderWithReceipts[]>,
      this.resolveVatPct(asOf),
      this.resolveOverdueDays(),
    ]);

    // (clientId + currency) -> rollup. Orders of different currencies for the
    // same client are reported as separate rows so figures never mix bases.
    const rollups = new Map<string, ClientAgeing>();

    for (const order of orders) {
      const line = this.buildLine(order, vatPct, overdueDays, asOf);
      if (!line) {
        continue;
      }
      this.accumulate(rollups, order, line);
    }

    const clients = [...rollups.values()].sort((a, b) => b.totalOutstanding - a.totalOutstanding);

    const totalsByCurrency = this.emptyCurrencyMap();
    const overdueByCurrency = this.emptyCurrencyMap();
    const bucketsByCurrency: Record<string, AgeingBuckets> = {
      ['USD']: this.emptyBuckets(),
      ['ZWG']: this.emptyBuckets(),
    };
    let orderCount = 0;

    for (const client of clients) {
      const cur = client.currency;
      // Currencies are admin-configurable, so lazily initialise any currency
      // beyond the USD/ZWG defaults (e.g. ZAR) instead of assuming a fixed set.
      if (totalsByCurrency[cur] === undefined) totalsByCurrency[cur] = 0;
      if (overdueByCurrency[cur] === undefined) overdueByCurrency[cur] = 0;
      if (!bucketsByCurrency[cur]) bucketsByCurrency[cur] = this.emptyBuckets();

      totalsByCurrency[cur] = round2(totalsByCurrency[cur] + client.totalOutstanding);
      overdueByCurrency[cur] = round2(overdueByCurrency[cur] + client.overdueOutstanding);
      this.addBuckets(bucketsByCurrency[cur], client.buckets);
      orderCount += client.lines.length;
    }

    const totalOutstandingUsd = await this.consolidateUsd(totalsByCurrency, asOf);

    return {
      asOf: asOf.toISOString(),
      clients,
      totalsByCurrency,
      bucketsByCurrency,
      overdueByCurrency,
      totalOutstandingUsd,
      orderCount,
    };
  }

  /**
   * Build the outstanding line for one order, or null when nothing is owed.
   * Receipts are summed in the order's own currency (the panel keeps each order
   * in its native base); the ZWG receipt leg is left at zero so no implicit FX
   * happens inside {@link OrderFinancialsService}.
   */
  private buildLine(
    order: OrderWithReceipts,
    vatPct: number,
    overdueDays: number,
    asOf: Date,
  ): AgeingOrderLine | null {
    const received = order.receipts
      .filter((r) => r.currency === order.currency)
      .reduce((sum, r) => sum + num(r.amount), 0);

    // Rates are irrelevant here (both receipt legs are USD-side); use 1:1 so the
    // ZWG divisor never triggers, and pass received as the USD leg.
    const rates: RateSettings = { officialRate: 1, streetRate: 1 };
    const financials = this.orderFinancials.compute({
      order: {
        valueExVat: num(order.valueExVat),
        vatRatePct: vatPct,
        closingDate: order.closingDate,
        serviced: order.serviced,
      },
      receipts: [{ amountUsd: received, amountZig: 0 }],
      expenses: [],
      rates,
      loanInterestTotal: 0,
    });

    const outstanding = financials.outstanding;
    if (outstanding <= 0) {
      return null;
    }

    const ageAnchor = order.closingDate ?? order.createdAt;
    const ageDays = Math.max(0, Math.floor((asOf.getTime() - ageAnchor.getTime()) / MS_PER_DAY));
    const bucket = this.bucketFor(ageDays);
    const overdue = ageDays > overdueDays;

    return {
      orderId: order.id,
      reference: order.reference,
      currency: order.currency,
      totalInclVat: financials.totalInclVat,
      received: round2(received),
      outstanding,
      ageDays,
      bucket,
      overdue,
    };
  }

  /** Fold a line into its (client, currency) rollup, creating it if needed. */
  private accumulate(
    rollups: Map<string, ClientAgeing>,
    order: OrderWithReceipts,
    line: AgeingOrderLine,
  ): void {
    const key = `${order.clientId}::${order.currency}`;
    let rollup = rollups.get(key);
    if (!rollup) {
      rollup = {
        clientId: order.clientId,
        clientName: order.client.name,
        currency: order.currency,
        totalOutstanding: 0,
        buckets: this.emptyBuckets(),
        overdueOutstanding: 0,
        lines: [],
      };
      rollups.set(key, rollup);
    }

    rollup.lines.push(line);
    rollup.totalOutstanding = round2(rollup.totalOutstanding + line.outstanding);
    rollup.buckets[line.bucket] = round2(rollup.buckets[line.bucket] + line.outstanding);
    if (line.overdue) {
      rollup.overdueOutstanding = round2(rollup.overdueOutstanding + line.outstanding);
    }
  }

  /** Map an age in days to its bucket. */
  private bucketFor(ageDays: number): AgeBucketKey {
    if (ageDays <= 30) {
      return '0-30';
    }
    if (ageDays <= 60) {
      return '31-60';
    }
    if (ageDays <= 90) {
      return '61-90';
    }
    return '90+';
  }

  /** Resolve the standard VAT percentage; fall back to the default on absence. */
  private async resolveVatPct(asOf: Date): Promise<number> {
    try {
      const row = await this.thresholds.current(VAT_RATE_KEY);
      const value = num(row.value);
      return value > 0 ? value : DEFAULT_VAT_PCT;
    } catch {
      // No statutory VAT configured — use the default rather than failing the panel.
      void asOf;
      return DEFAULT_VAT_PCT;
    }
  }

  /** Resolve the overdue cutoff in days; fall back to the default on absence. */
  private async resolveOverdueDays(): Promise<number> {
    try {
      const row = await this.thresholds.current(OVERDUE_DAYS_KEY);
      const value = num(row.value);
      return value > 0 ? value : DEFAULT_OVERDUE_DAYS;
    } catch {
      return DEFAULT_OVERDUE_DAYS;
    }
  }

  /**
   * Convert the per-currency totals into one USD headline. ZWG is divided by the
   * official ZWG/USD rate; returns null when that rate is unavailable or zero.
   */
  private async consolidateUsd(totals: Record<string, number>, asOf: Date): Promise<number | null> {
    let total = totals['USD'] ?? 0;
    // Convert every non-USD currency via its <CUR>/USD official rate. If any
    // required rate is missing the headline can't be trusted, so return null.
    for (const [currency, amount] of Object.entries(totals)) {
      if (currency === 'USD' || amount === 0) {
        continue;
      }
      try {
        const { rate } = await this.exchangeRates.rateAsOf(`${currency}/USD`, asOf);
        const rateNum = Number(rate);
        if (!Number.isFinite(rateNum) || rateNum <= 0) {
          return null;
        }
        total += amount * rateNum;
      } catch {
        return null;
      }
    }
    return round2(total);
  }

  /** A fresh zeroed per-currency total map. */
  private emptyCurrencyMap(): Record<string, number> {
    return { ['USD']: 0, ['ZWG']: 0 };
  }

  /** A fresh zeroed bucket set. */
  private emptyBuckets(): AgeingBuckets {
    return { '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 };
  }

  /** Add one bucket set into another in place, rounding each total. */
  private addBuckets(target: AgeingBuckets, source: AgeingBuckets): void {
    target['0-30'] = round2(target['0-30'] + source['0-30']);
    target['31-60'] = round2(target['31-60'] + source['31-60']);
    target['61-90'] = round2(target['61-90'] + source['61-90']);
    target['90+'] = round2(target['90+'] + source['90+']);
  }
}
