import { Injectable } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { LedgerService } from '../../ledger/ledger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ExchangeRatesService } from '../../reference/exchange-rates/exchange-rates.service';
import { RateType } from '../../reference/exchange-rates/rate-type.enum';

/** Statuses that count as an unfunded, approved-but-not-yet-paid obligation. */
const PENDING_STATUS = 'APPROVED_PENDING_FUNDS';

/** The FX pair used to fold ZWG figures into a USD-equivalent combined view. */
const USD_ZWG_PAIR = 'USD/ZWG';

/** A single unfunded obligation line (requisition or travel advance). */
export interface ObligationLine {
  source: 'requisition' | 'travel';
  id: string;
  description: string;
  amount: number;
  currency: Currency;
  requiredByDate: string | null;
  overdue: boolean;
}

/** Per-currency roll-up of obligations vs available cash. */
export interface CurrencyObligationSummary {
  currency: Currency;
  count: number;
  obligations: number;
  availableCash: number;
  /** sum(amounts) - available cash, floored at 0 (a positive gap = unfunded shortfall). */
  unfundedGap: number;
}

/** The typed result returned by the panel. */
export interface PendingObligationsPanel {
  asOf: string;
  totals: {
    count: number;
    /** Per-currency obligation totals (no cross-currency mixing). */
    obligations: Record<Currency, number>;
    availableCash: Record<Currency, number>;
    unfundedGap: Record<Currency, number>;
  };
  byCurrency: CurrencyObligationSummary[];
  /**
   * Best-effort single-number view: every currency folded into USD at the official
   * USD/ZWG rate. `null` when no rate is configured (never throws).
   */
  usdEquivalent: {
    obligations: number;
    availableCash: number;
    unfundedGap: number;
    rateUsed: number | null;
  } | null;
  lines: ObligationLine[];
}

export interface PendingObligationsParams {
  /** Evaluation instant; defaults to now. Drives `overdue` and the FX rate lookup. */
  asOf?: Date;
}

/**
 * Command Centre — Panel 7: Pending obligations.
 *
 * Surfaces every requisition and travel advance sitting in APPROVED_PENDING_FUNDS
 * (approved on merit but not yet funded) with its requiredByDate and amount, and
 * computes the unfunded gap per currency: sum(amounts) - available cash from the
 * shared ledger. Read-only: no writes, no mutations, no audit.
 */
@Injectable()
export class PendingObligationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  private static num(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return typeof value === 'number' ? value : Number(value);
  }

  async compute(params?: PendingObligationsParams): Promise<PendingObligationsPanel> {
    const asOf = params?.asOf ?? new Date();

    const [requisitions, travel, cash] = await Promise.all([
      this.prisma.requisition.findMany({
        where: { status: PENDING_STATUS },
        orderBy: { requiredByDate: 'asc' },
      }),
      this.prisma.travelRequest.findMany({
        where: { status: PENDING_STATUS },
        orderBy: { dateFrom: 'asc' },
      }),
      this.ledger.cashPosition(),
    ]);

    const lines: ObligationLine[] = [];

    for (const r of requisitions) {
      const requiredBy = r.requiredByDate ?? null;
      lines.push({
        source: 'requisition',
        id: r.id,
        description: r.purpose,
        amount: PendingObligationsService.num(r.amount),
        currency: r.currency,
        requiredByDate: requiredBy ? requiredBy.toISOString() : null,
        overdue: requiredBy ? requiredBy.getTime() < asOf.getTime() : false,
      });
    }

    for (const t of travel) {
      // Travel advances are "required by" the trip start date.
      const requiredBy = t.dateFrom ?? null;
      lines.push({
        source: 'travel',
        id: t.id,
        description: `Travel advance: ${t.destination}`,
        amount: PendingObligationsService.num(t.advanceAmount),
        currency: t.currency,
        requiredByDate: requiredBy ? requiredBy.toISOString() : null,
        overdue: requiredBy ? requiredBy.getTime() < asOf.getTime() : false,
      });
    }

    // Overdue first, then earliest deadline, then largest amount.
    lines.sort((a, b) => {
      if (a.overdue !== b.overdue) {
        return a.overdue ? -1 : 1;
      }
      const at = a.requiredByDate ? Date.parse(a.requiredByDate) : Number.POSITIVE_INFINITY;
      const bt = b.requiredByDate ? Date.parse(b.requiredByDate) : Number.POSITIVE_INFINITY;
      if (at !== bt) {
        return at - bt;
      }
      return b.amount - a.amount;
    });

    const currencies: Currency[] = [Currency.USD, Currency.ZWG];

    const obligations: Record<Currency, number> = { [Currency.USD]: 0, [Currency.ZWG]: 0 };
    const counts: Record<Currency, number> = { [Currency.USD]: 0, [Currency.ZWG]: 0 };
    for (const line of lines) {
      obligations[line.currency] += line.amount;
      counts[line.currency] += 1;
    }

    const availableCash: Record<Currency, number> = {
      [Currency.USD]: cash.totals[Currency.USD] ?? 0,
      [Currency.ZWG]: cash.totals[Currency.ZWG] ?? 0,
    };

    const unfundedGap: Record<Currency, number> = {
      [Currency.USD]: Math.max(0, obligations[Currency.USD] - availableCash[Currency.USD]),
      [Currency.ZWG]: Math.max(0, obligations[Currency.ZWG] - availableCash[Currency.ZWG]),
    };

    const byCurrency: CurrencyObligationSummary[] = currencies.map((currency) => ({
      currency,
      count: counts[currency],
      obligations: obligations[currency],
      availableCash: availableCash[currency],
      unfundedGap: unfundedGap[currency],
    }));

    const usdEquivalent = await this.foldToUsd(obligations, availableCash, asOf);

    return {
      asOf: asOf.toISOString(),
      totals: {
        count: lines.length,
        obligations,
        availableCash,
        unfundedGap,
      },
      byCurrency,
      usdEquivalent,
      lines,
    };
  }

  /**
   * Fold ZWG figures into USD using the official USD/ZWG rate (ZWG-per-USD), so the
   * panel can show a single combined gap. Returns `null` when no rate is configured
   * or the rate is non-positive — never throws, so the panel degrades gracefully.
   */
  private async foldToUsd(
    obligations: Record<Currency, number>,
    availableCash: Record<Currency, number>,
    asOf: Date,
  ): Promise<PendingObligationsPanel['usdEquivalent']> {
    const zwgObligations = obligations[Currency.ZWG];
    const zwgCash = availableCash[Currency.ZWG];

    // No ZWG exposure at all — the USD figures already are the combined figures.
    if (zwgObligations === 0 && zwgCash === 0) {
      return {
        obligations: obligations[Currency.USD],
        availableCash: availableCash[Currency.USD],
        unfundedGap: Math.max(0, obligations[Currency.USD] - availableCash[Currency.USD]),
        rateUsed: null,
      };
    }

    let rate: number | null = null;
    try {
      const row = await this.exchangeRates.rateAsOf(USD_ZWG_PAIR, asOf, RateType.OFFICIAL);
      const parsed = Number(row.rate);
      rate = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    } catch {
      // No rate on/before asOf — cannot combine currencies; leave the folded view empty.
      rate = null;
    }

    if (rate === null) {
      return null;
    }

    // USD/ZWG rate is ZWG-per-USD, so USD = ZWG / rate. Guard against divide-by-zero
    // is covered by the rate > 0 check above.
    const zwgObligationsUsd = zwgObligations / rate;
    const zwgCashUsd = zwgCash / rate;

    const combinedObligations = obligations[Currency.USD] + zwgObligationsUsd;
    const combinedCash = availableCash[Currency.USD] + zwgCashUsd;

    return {
      obligations: combinedObligations,
      availableCash: combinedCash,
      unfundedGap: Math.max(0, combinedObligations - combinedCash),
      rateUsed: rate,
    };
  }
}
