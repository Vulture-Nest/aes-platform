import { Prisma } from '@prisma/client';
import { PendingObligationsService } from './pending-obligations.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

function makeService() {
  const prisma = {
    requisition: { findMany: jest.fn().mockResolvedValue([]) },
    travelRequest: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const ledger = {
    cashPosition: jest.fn().mockResolvedValue({ accounts: [], totals: { USD: 0, ZWG: 0 } }),
  };
  const exchangeRates = {
    rateAsOf: jest.fn(),
  };
  const service = new PendingObligationsService(prisma as any, ledger as any, exchangeRates as any);
  return { service, prisma, ledger, exchangeRates };
}

describe('PendingObligationsService.compute', () => {
  it('queries only APPROVED_PENDING_FUNDS requisitions and travel requests', async () => {
    const { service, prisma } = makeService();

    await service.compute({ asOf: new Date('2026-07-19T00:00:00.000Z') });

    expect(prisma.requisition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'APPROVED_PENDING_FUNDS' } }),
    );
    expect(prisma.travelRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'APPROVED_PENDING_FUNDS' } }),
    );
  });

  it('sums obligations per currency and computes the unfunded gap vs available cash', async () => {
    const { service, prisma, ledger } = makeService();
    prisma.requisition.findMany.mockResolvedValue([
      {
        id: 'r1',
        purpose: 'Fuel',
        amount: dec(800),
        currency: 'USD',
        requiredByDate: new Date('2026-07-25T00:00:00.000Z'),
      },
      {
        id: 'r2',
        purpose: 'Spares',
        amount: dec(400),
        currency: 'USD',
        requiredByDate: new Date('2026-07-22T00:00:00.000Z'),
      },
    ]);
    prisma.travelRequest.findMany.mockResolvedValue([
      {
        id: 't1',
        destination: 'Bulawayo',
        advanceAmount: dec(300),
        currency: 'USD',
        dateFrom: new Date('2026-07-30T00:00:00.000Z'),
      },
    ]);
    // USD cash 500 -> gap = (800 + 400 + 300) - 500 = 1000.
    ledger.cashPosition.mockResolvedValue({ accounts: [], totals: { USD: 500, ZWG: 0 } });

    const result = await service.compute({ asOf: new Date('2026-07-19T00:00:00.000Z') });

    expect(result.totals.count).toBe(3);
    expect(result.totals.obligations.USD).toBe(1500);
    expect(result.totals.availableCash.USD).toBe(500);
    expect(result.totals.unfundedGap.USD).toBe(1000);

    const usd = result.byCurrency.find((c) => c.currency === 'USD');
    expect(usd).toEqual(
      expect.objectContaining({
        count: 3,
        obligations: 1500,
        availableCash: 500,
        unfundedGap: 1000,
      }),
    );
    // No ZWG exposure -> usdEquivalent uses USD figures directly, no rate lookup.
    expect(result.usdEquivalent).toEqual(
      expect.objectContaining({
        obligations: 1500,
        availableCash: 500,
        unfundedGap: 1000,
        rateUsed: null,
      }),
    );
  });

  it('floors the gap at zero when cash exceeds obligations', async () => {
    const { service, prisma, ledger } = makeService();
    prisma.requisition.findMany.mockResolvedValue([
      {
        id: 'r1',
        purpose: 'Fuel',
        amount: dec(200),
        currency: 'USD',
        requiredByDate: new Date('2026-07-25T00:00:00.000Z'),
      },
    ]);
    ledger.cashPosition.mockResolvedValue({ accounts: [], totals: { USD: 5000, ZWG: 0 } });

    const result = await service.compute({ asOf: new Date('2026-07-19T00:00:00.000Z') });

    expect(result.totals.unfundedGap.USD).toBe(0);
  });

  it('flags overdue lines and sorts overdue-first, then by deadline', async () => {
    const { service, prisma } = makeService();
    prisma.requisition.findMany.mockResolvedValue([
      {
        id: 'future',
        purpose: 'Future',
        amount: dec(100),
        currency: 'USD',
        requiredByDate: new Date('2026-08-01T00:00:00.000Z'),
      },
      {
        id: 'past',
        purpose: 'Overdue',
        amount: dec(100),
        currency: 'USD',
        requiredByDate: new Date('2026-07-01T00:00:00.000Z'),
      },
    ]);

    const result = await service.compute({ asOf: new Date('2026-07-19T00:00:00.000Z') });

    expect(result.lines[0].id).toBe('past');
    expect(result.lines[0].overdue).toBe(true);
    expect(result.lines[1].id).toBe('future');
    expect(result.lines[1].overdue).toBe(false);
    expect(result.lines[0].source).toBe('requisition');
  });

  it('folds ZWG obligations and cash into a USD-equivalent using the official rate', async () => {
    const { service, prisma, ledger, exchangeRates } = makeService();
    prisma.requisition.findMany.mockResolvedValue([
      {
        id: 'z1',
        purpose: 'ZWG fuel',
        amount: dec(3000),
        currency: 'ZWG',
        requiredByDate: new Date('2026-07-22T00:00:00.000Z'),
      },
      {
        id: 'u1',
        purpose: 'USD spares',
        amount: dec(1000),
        currency: 'USD',
        requiredByDate: new Date('2026-07-23T00:00:00.000Z'),
      },
    ]);
    ledger.cashPosition.mockResolvedValue({ accounts: [], totals: { USD: 200, ZWG: 600 } });
    // USD/ZWG = 30 ZWG per USD.
    exchangeRates.rateAsOf.mockResolvedValue({ rate: '30' });

    const result = await service.compute({ asOf: new Date('2026-07-19T00:00:00.000Z') });

    expect(exchangeRates.rateAsOf).toHaveBeenCalledWith(
      'USD/ZWG',
      new Date('2026-07-19T00:00:00.000Z'),
      expect.anything(),
    );
    // Per-currency figures stay separate.
    expect(result.totals.obligations.ZWG).toBe(3000);
    expect(result.totals.obligations.USD).toBe(1000);
    // Folded: obligations = 1000 + 3000/30 = 1100; cash = 200 + 600/30 = 220; gap = 880.
    expect(result.usdEquivalent).toEqual(
      expect.objectContaining({
        obligations: 1100,
        availableCash: 220,
        unfundedGap: 880,
        rateUsed: 30,
      }),
    );
  });

  it('returns null usdEquivalent when no FX rate is configured (never throws)', async () => {
    const { service, prisma, exchangeRates } = makeService();
    prisma.requisition.findMany.mockResolvedValue([
      {
        id: 'z1',
        purpose: 'ZWG fuel',
        amount: dec(3000),
        currency: 'ZWG',
        requiredByDate: new Date('2026-07-22T00:00:00.000Z'),
      },
    ]);
    exchangeRates.rateAsOf.mockRejectedValue(new Error('No exchange rate'));

    const result = await service.compute({ asOf: new Date('2026-07-19T00:00:00.000Z') });

    expect(result.totals.obligations.ZWG).toBe(3000);
    expect(result.usdEquivalent).toBeNull();
  });

  it('does not divide by zero when the configured rate is non-positive', async () => {
    const { service, prisma, exchangeRates } = makeService();
    prisma.requisition.findMany.mockResolvedValue([
      {
        id: 'z1',
        purpose: 'ZWG fuel',
        amount: dec(3000),
        currency: 'ZWG',
        requiredByDate: new Date('2026-07-22T00:00:00.000Z'),
      },
    ]);
    exchangeRates.rateAsOf.mockResolvedValue({ rate: '0' });

    const result = await service.compute({ asOf: new Date('2026-07-19T00:00:00.000Z') });

    expect(result.usdEquivalent).toBeNull();
  });

  it('handles empty data: zero counts, zero gaps, empty lines', async () => {
    const { service } = makeService();

    const result = await service.compute();

    expect(result.totals.count).toBe(0);
    expect(result.totals.obligations.USD).toBe(0);
    expect(result.totals.obligations.ZWG).toBe(0);
    expect(result.totals.unfundedGap.USD).toBe(0);
    expect(result.totals.unfundedGap.ZWG).toBe(0);
    expect(result.lines).toEqual([]);
    expect(result.byCurrency).toHaveLength(2);
    // No ZWG exposure -> folded view falls back to USD figures.
    expect(result.usdEquivalent).toEqual(
      expect.objectContaining({ obligations: 0, availableCash: 0, unfundedGap: 0, rateUsed: null }),
    );
    expect(typeof result.asOf).toBe('string');
  });
});
