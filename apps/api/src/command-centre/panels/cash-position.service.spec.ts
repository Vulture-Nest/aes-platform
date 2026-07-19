import { Prisma } from '@prisma/client';
import { RateType } from '../../reference/exchange-rates/rate-type.enum';
import { CashPositionService } from './cash-position.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);
const ASOF = new Date('2026-07-19T00:00:00.000Z');
const daysAgo = (n: number) => new Date(ASOF.getTime() - n * 24 * 60 * 60 * 1000);

function makeService() {
  const ledger = {
    cashPosition: jest.fn().mockResolvedValue({ accounts: [], totals: { USD: 0, ZWG: 0 } }),
  };
  const exchangeRates = {
    rateAsOf: jest.fn(),
  };
  const prisma = {
    ledgerEntry: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const service = new CashPositionService(prisma as any, ledger as any, exchangeRates as any);
  return { service, ledger, exchangeRates, prisma };
}

describe('CashPositionService.compute', () => {
  it('computes USD-equivalent totals at official and street rates plus a 30/60/90 trend', async () => {
    const { service, ledger, exchangeRates, prisma } = makeService();

    ledger.cashPosition.mockResolvedValue({
      accounts: [
        { accountId: 'a1', name: 'USD Bank', type: 'BANK', currency: 'USD', balance: 1000 },
        { accountId: 'a2', name: 'ZWG Wallet', type: 'WALLET', currency: 'ZWG', balance: 26000 },
      ],
      totals: { USD: 1000, ZWG: 26000 },
    });

    // Official 13, street/parallel 26.
    exchangeRates.rateAsOf.mockImplementation((_pair: string, _date: Date, type: RateType) =>
      Promise.resolve({
        currencyPair: 'USD/ZWG',
        type,
        rate: type === RateType.PARALLEL ? '26' : '13',
        dateEffective: ASOF,
      }),
    );

    // Ledger entries across the windows (net = credit - debit):
    //  - within 30d: USD +500 (credit)
    //  - 30..60d:    ZWG net +260 (credit 260)
    //  - 60..90d:    USD -100 (debit 100)
    prisma.ledgerEntry.findMany.mockResolvedValue([
      { debit: dec(0), credit: dec(500), currency: 'USD', entryDate: daysAgo(5) },
      { debit: dec(0), credit: dec(260), currency: 'ZWG', entryDate: daysAgo(45) },
      { debit: dec(100), credit: dec(0), currency: 'USD', entryDate: daysAgo(75) },
    ]);

    const result = await service.compute({ asOf: ASOF });

    expect(result.panel).toBe('cash_position');
    expect(result.asOf).toBe(ASOF.toISOString());
    expect(result.accounts).toHaveLength(2);
    expect(result.totals).toEqual({ USD: 1000, ZWG: 26000 });

    // Official: 1000 + 26000/13 = 1000 + 2000 = 3000.
    expect(result.usdEquivalent.official.rate).toBe(13);
    expect(result.usdEquivalent.official.totalUsd).toBeCloseTo(3000, 6);
    // Street: 1000 + 26000/26 = 1000 + 1000 = 2000.
    expect(result.usdEquivalent.street.rate).toBe(26);
    expect(result.usdEquivalent.street.totalUsd).toBeCloseTo(2000, 6);

    // Query only fetched the widest window (90d) once.
    expect(prisma.ledgerEntry.findMany).toHaveBeenCalledTimes(1);

    const [w30, w60, w90] = result.trend;
    expect(w30.days).toBe(30);
    expect(w60.days).toBe(60);
    expect(w90.days).toBe(90);

    // 30d: only the USD +500 entry.
    expect(w30.net).toEqual({ USD: 500, ZWG: 0 });
    expect(w30.netUsdOfficial).toBeCloseTo(500, 6);

    // 60d: USD +500 and ZWG +260 (260/13 = 20 USD-equiv).
    expect(w60.net).toEqual({ USD: 500, ZWG: 260 });
    expect(w60.netUsdOfficial).toBeCloseTo(520, 6);

    // 90d: USD 500 - 100 = 400, ZWG +260 (20 USD-equiv) => 420.
    expect(w90.net).toEqual({ USD: 400, ZWG: 260 });
    expect(w90.netUsdOfficial).toBeCloseTo(420, 6);
  });

  it('handles empty data and missing rates without dividing by zero', async () => {
    const { service, exchangeRates, prisma } = makeService();

    // ledger.cashPosition defaults to empty; make rate lookups fail (none configured).
    exchangeRates.rateAsOf.mockRejectedValue(new Error('no rate'));

    const result = await service.compute({ asOf: ASOF });

    expect(result.accounts).toEqual([]);
    expect(result.totals).toEqual({ USD: 0, ZWG: 0 });

    // Missing rates -> rate 0 and no NaN/Infinity leakage.
    expect(result.usdEquivalent.official.rate).toBe(0);
    expect(result.usdEquivalent.official.totalUsd).toBe(0);
    expect(result.usdEquivalent.street.rate).toBe(0);
    expect(result.usdEquivalent.street.totalUsd).toBe(0);

    expect(result.trend).toHaveLength(3);
    for (const w of result.trend) {
      expect(w.net).toEqual({ USD: 0, ZWG: 0 });
      expect(w.netUsdOfficial).toBe(0);
      expect(Number.isFinite(w.netUsdOfficial)).toBe(true);
    }

    expect(prisma.ledgerEntry.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not convert ZWG when only a zero rate is available (guards divide-by-zero)', async () => {
    const { service, ledger, exchangeRates } = makeService();

    ledger.cashPosition.mockResolvedValue({
      accounts: [{ accountId: 'a2', name: 'ZWG', type: 'WALLET', currency: 'ZWG', balance: 5000 }],
      totals: { USD: 200, ZWG: 5000 },
    });
    exchangeRates.rateAsOf.mockResolvedValue({
      currencyPair: 'USD/ZWG',
      type: RateType.OFFICIAL,
      rate: '0',
      dateEffective: ASOF,
    });

    const result = await service.compute({ asOf: ASOF });

    // Rate 0 -> ZWG contributes nothing; only the USD portion remains.
    expect(result.usdEquivalent.official.totalUsd).toBe(200);
    expect(Number.isFinite(result.usdEquivalent.official.totalUsd)).toBe(true);
  });
});
