import { Prisma } from '@prisma/client';
import { CoverageService } from './coverage.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

function makeService() {
  const prisma = {
    order: { findMany: jest.fn().mockResolvedValue([]) },
    overhead: { findMany: jest.fn().mockResolvedValue([]) },
    requisition: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const exchangeRates = {
    // Default: USD/ZWG = 20 ZWG per 1 USD (only consulted for foreign legs).
    rateAsOf: jest.fn().mockResolvedValue({
      currencyPair: 'USD/ZWG',
      type: 'OFFICIAL',
      rate: '20',
      dateEffective: new Date('2026-07-19'),
    }),
  };
  const service = new CoverageService(prisma as any, exchangeRates as any);
  return { service, prisma, exchangeRates };
}

describe('CoverageService.compute', () => {
  it('returns zeros and a null ratio for empty data (no divide-by-zero)', async () => {
    const { service, exchangeRates } = makeService();

    const result = await service.compute({ asOf: new Date('2026-07-19') });

    expect(result.expectedIn).toBe(0);
    expect(result.expectedOut).toBe(0);
    expect(result.coverageRatio).toBeNull();
    expect(result.outstandingOrderCount).toBe(0);
    expect(result.payrollAvailable).toBe(false);
    expect(result.outflowBreakdown).toEqual({ overheads: 0, requisitions: 0, payroll: 0 });
    expect(result.panel).toBe('orders_vs_payroll_expenses');
    expect(result.currency).toBe('USD');
    // No foreign legs -> FX table never consulted.
    expect(exchangeRates.rateAsOf).not.toHaveBeenCalled();
  });

  it('computes expectedIn, expectedOut and the coverage ratio from same-currency rows', async () => {
    const { service, prisma } = makeService();
    prisma.order.findMany.mockResolvedValue([
      // Outstanding = 1000 - 400 = 600 (open, partially paid).
      { valueExVat: dec(1000), currency: 'USD', receipts: [{ amount: dec(400), currency: 'USD' }] },
      // Outstanding = 500 - 0 = 500 (open, unpaid).
      { valueExVat: dec(500), currency: 'USD', receipts: [] },
      // Fully paid -> contributes nothing (outstanding <= 0).
      { valueExVat: dec(300), currency: 'USD', receipts: [{ amount: dec(300), currency: 'USD' }] },
    ]);
    prisma.overhead.findMany.mockResolvedValue([
      { amount: dec(200), currency: 'USD' },
      { amount: dec(100), currency: 'USD' },
    ]);
    prisma.requisition.findMany.mockResolvedValue([{ amount: dec(400), currency: 'USD' }]);

    const result = await service.compute({ asOf: new Date('2026-07-19') });

    expect(result.expectedIn).toBe(1100); // 600 + 500
    expect(result.outstandingOrderCount).toBe(2);
    expect(result.outflowBreakdown).toEqual({ overheads: 300, requisitions: 400, payroll: 0 });
    expect(result.expectedOut).toBe(700); // 300 + 400 + 0
    expect(result.coverageRatio).toBeCloseTo(1100 / 700, 4);
  });

  it('only counts approved-undisbursed requisitions', async () => {
    const { service, prisma } = makeService();
    prisma.requisition.findMany.mockResolvedValue([{ amount: dec(250), currency: 'USD' }]);

    await service.compute({ asOf: new Date('2026-07-19') });

    expect(prisma.requisition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: { in: ['APPROVED_PENDING_FUNDS', 'APPROVED_READY_TO_PAY'] },
        },
      }),
    );
  });

  it('normalises foreign-currency rows to the reporting currency via the FX rate', async () => {
    const { service, prisma, exchangeRates } = makeService();
    // 20 ZWG per 1 USD; converting ZWG -> USD divides by 20 in the caller's
    // convention. The service applies the rate as a multiplier, so we return a
    // rate of 0.05 (= 1/20) for the USD-from-ZWG direction here.
    exchangeRates.rateAsOf.mockResolvedValue({
      currencyPair: 'USD/ZWG',
      type: 'OFFICIAL',
      rate: '0.05',
      dateEffective: new Date('2026-07-19'),
    });
    prisma.order.findMany.mockResolvedValue([
      // 2000 ZWG outstanding * 0.05 = 100 USD.
      { valueExVat: dec(2000), currency: 'ZWG', receipts: [] },
    ]);

    const result = await service.compute({ currency: 'USD' as any, asOf: new Date('2026-07-19') });

    expect(exchangeRates.rateAsOf).toHaveBeenCalledWith('USD/ZWG', new Date('2026-07-19'));
    expect(result.expectedIn).toBe(100);
    expect(result.expectedOut).toBe(0);
    expect(result.coverageRatio).toBeNull();
  });

  it('treats a foreign leg as zero when no FX rate is on record (no NaN/Infinity)', async () => {
    const { service, prisma, exchangeRates } = makeService();
    exchangeRates.rateAsOf.mockRejectedValue(new Error('no rate on record'));
    prisma.order.findMany.mockResolvedValue([
      { valueExVat: dec(5000), currency: 'ZWG', receipts: [] },
    ]);
    prisma.overhead.findMany.mockResolvedValue([{ amount: dec(100), currency: 'USD' }]);

    const result = await service.compute({ asOf: new Date('2026-07-19') });

    expect(result.expectedIn).toBe(0); // foreign leg dropped to 0
    expect(result.outstandingOrderCount).toBe(0);
    expect(result.expectedOut).toBe(100);
    expect(result.coverageRatio).toBe(0);
  });

  it('defaults asOf to now and currency to USD when no params are given', async () => {
    const { service } = makeService();

    const result = await service.compute();

    expect(result.currency).toBe('USD');
    expect(typeof result.asOf).toBe('string');
    expect(Number.isNaN(Date.parse(result.asOf))).toBe(false);
  });
});
