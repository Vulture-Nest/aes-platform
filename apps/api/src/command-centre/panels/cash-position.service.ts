import { Injectable } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { ExchangeRatesService } from '../../reference/exchange-rates/exchange-rates.service';
import { RateType } from '../../reference/exchange-rates/rate-type.enum';
import { LedgerService } from '../../ledger/ledger.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Currency pair used to convert ZWG balances into a USD equivalent. */
const USD_ZWG_PAIR = 'USD/ZWG';

/** Trend windows (in days) reported by the panel. */
const TREND_WINDOWS = [30, 60, 90] as const;

/** ms in one day — used for windowing ledger entries. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Prisma.Decimal | number | null | undefined -> number (guards nulls). */
function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === 'number' ? value : value.toNumber();
}

/** Parse an exchange-rate string; returns 0 when unparseable. */
function parseRate(rate: string | null | undefined): number {
  if (!rate) {
    return 0;
  }
  const n = Number(rate);
  return Number.isFinite(n) ? n : 0;
}

/** A single balance-trend window (net movement over the last `days`). */
export interface CashTrendWindow {
  /** Window length in days (30 / 60 / 90). */
  days: number;
  /** Net ledger movement (credit - debit) in the window, per currency. */
  net: Record<Currency, number>;
  /** USD-equivalent of the net movement at the OFFICIAL rate. */
  netUsdOfficial: number;
}

/** USD-equivalent roll-up of the current per-currency cash totals. */
export interface UsdEquivalent {
  /** The USD/ZWG rate used (as a number). 0 when no rate is available. */
  rate: number;
  /** Total cash expressed in USD using this rate. */
  totalUsd: number;
}

/** Parameters accepted by the cash-position panel. */
export interface CashPositionParams {
  /** "As of" instant for rate lookups + trend windows. Defaults to now. */
  asOf?: Date;
}

/** Typed result returned by the cash-position panel. */
export interface CashPositionPanelResult {
  panel: 'cash_position';
  asOf: string;
  /** Per-account balances from the ledger. */
  accounts: {
    accountId: string;
    name: string;
    type: string;
    currency: Currency;
    balance: number;
  }[];
  /** Raw per-currency cash totals (no conversion). */
  totals: Record<Currency, number>;
  /** USD-equivalent roll-up at both official and street (parallel) rates. */
  usdEquivalent: {
    official: UsdEquivalent;
    street: UsdEquivalent;
  };
  /** 30 / 60 / 90-day net balance trend from ledger_entries. */
  trend: CashTrendWindow[];
}

/**
 * Command Centre — Panel 1: Cash position.
 *
 * Read-only. Reads the current cash position from the shared ledger, adds USD-equivalent
 * roll-ups at the OFFICIAL and STREET (parallel) rates, and derives a 30/60/90-day net
 * balance trend directly from ledger_entries. Handles empty data and missing rates
 * gracefully (never divides by zero, never throws on absent rates).
 */
@Injectable()
export class CashPositionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  async compute(params: CashPositionParams = {}): Promise<CashPositionPanelResult> {
    const asOf = params.asOf ?? new Date();

    const position = await this.ledger.cashPosition();
    const totals: Record<Currency, number> = {
      [Currency.USD]: position.totals[Currency.USD] ?? 0,
      [Currency.ZWG]: position.totals[Currency.ZWG] ?? 0,
    };

    const officialRate = await this.rate(asOf, RateType.OFFICIAL);
    const streetRate = await this.rate(asOf, RateType.PARALLEL);

    const usdEquivalent = {
      official: this.toUsdEquivalent(totals, officialRate),
      street: this.toUsdEquivalent(totals, streetRate),
    };

    const trend = await this.buildTrend(asOf, officialRate);

    return {
      panel: 'cash_position',
      asOf: asOf.toISOString(),
      accounts: position.accounts,
      totals,
      usdEquivalent,
      trend,
    };
  }

  /** Look up the USD/ZWG rate for a basis; returns 0 when none is configured. */
  private async rate(asOf: Date, type: RateType): Promise<number> {
    try {
      const row = await this.exchangeRates.rateAsOf(USD_ZWG_PAIR, asOf, type);
      return parseRate(row.rate);
    } catch {
      // No rate on/before asOf — treat as unavailable rather than failing the panel.
      return 0;
    }
  }

  /**
   * USD-equivalent of the cash totals. USD is already in USD; ZWG is divided by the
   * USD/ZWG rate (guarded against divide-by-zero — a missing/zero rate contributes 0).
   */
  private toUsdEquivalent(totals: Record<Currency, number>, rate: number): UsdEquivalent {
    const usd = totals[Currency.USD] ?? 0;
    const zwg = totals[Currency.ZWG] ?? 0;
    const zwgInUsd = rate > 0 ? zwg / rate : 0;
    return { rate, totalUsd: usd + zwgInUsd };
  }

  /**
   * Net ledger movement (credit - debit) over each trend window, per currency, plus a
   * USD-equivalent of the net at the official rate. Entries are fetched once (the widest
   * 90-day window) and bucketed in memory.
   */
  private async buildTrend(asOf: Date, officialRate: number): Promise<CashTrendWindow[]> {
    const widest = Math.max(...TREND_WINDOWS);
    const earliest = new Date(asOf.getTime() - widest * MS_PER_DAY);

    const entries = await this.prisma.ledgerEntry.findMany({
      where: { entryDate: { gte: earliest, lte: asOf } },
      select: { debit: true, credit: true, currency: true, entryDate: true },
    });

    return TREND_WINDOWS.map((days) => {
      const windowStart = new Date(asOf.getTime() - days * MS_PER_DAY);
      const net: Record<Currency, number> = { [Currency.USD]: 0, [Currency.ZWG]: 0 };
      for (const e of entries) {
        if (e.entryDate < windowStart) {
          continue;
        }
        net[e.currency] += num(e.credit) - num(e.debit);
      }
      const zwgInUsd = officialRate > 0 ? net[Currency.ZWG] / officialRate : 0;
      return {
        days,
        net,
        netUsdOfficial: net[Currency.USD] + zwgInUsd,
      };
    });
  }
}
