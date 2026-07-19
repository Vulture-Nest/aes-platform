import { Currency, Prisma } from '@prisma/client';
import { MoneyInOutService, MoneyWindow } from './money-in-out.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

/** Build a service with fully-mocked Prisma + ExchangeRates. */
function makeService() {
  const prisma = {
    orderReceipt: { findMany: jest.fn().mockResolvedValue([]) },
    contractClaim: { findMany: jest.fn().mockResolvedValue([]) },
    orderExpense: { findMany: jest.fn().mockResolvedValue([]) },
    generalExpense: { findMany: jest.fn().mockResolvedValue([]) },
    overhead: { findMany: jest.fn().mockResolvedValue([]) },
    loanRepayment: { findMany: jest.fn().mockResolvedValue([]) },
    taxLedger: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const exchangeRates = {
    // Default: 1 ZWG -> 0.04 USD; other pairs handled per-test.
    rateAsOf: jest.fn().mockResolvedValue({ rate: '0.04' }),
  };
  const service = new MoneyInOutService(prisma as any, exchangeRates as any);
  return { service, prisma, exchangeRates };
}

describe('MoneyInOutService.compute', () => {
  it('returns an empty result with zero totals when there is no data', async () => {
    const { service } = makeService();

    const result = await service.compute();

    expect(result.window).toBe(MoneyWindow.MONTH);
    expect(result.currency).toBe(Currency.USD);
    expect(result.buckets).toEqual([]);
    expect(result.totals).toEqual({ inflow: 0, outflow: 0, net: 0 });
  });

  it('groups inflows and outflows by month and computes inflow/outflow/net per bucket', async () => {
    const { service, prisma, exchangeRates } = makeService();

    // Inflows: a receipt + a contract claim in Feb; a receipt in Mar (all USD).
    prisma.orderReceipt.findMany.mockResolvedValue([
      { amount: dec(1000), currency: Currency.USD, receivedDate: new Date('2026-02-10T00:00:00Z') },
      { amount: dec(500), currency: Currency.USD, receivedDate: new Date('2026-03-05T00:00:00Z') },
    ]);
    prisma.contractClaim.findMany.mockResolvedValue([
      {
        amountExVat: dec(300),
        currency: Currency.USD,
        claimDate: new Date('2026-02-20T00:00:00Z'),
      },
    ]);

    // Outflows across every source, all in Feb, all USD.
    prisma.orderExpense.findMany.mockResolvedValue([
      { amount: dec(200), currency: Currency.USD, createdAt: new Date('2026-02-11T00:00:00Z') },
    ]);
    prisma.generalExpense.findMany.mockResolvedValue([
      { amount: dec(100), currency: Currency.USD, expenseDate: new Date('2026-02-12T00:00:00Z') },
    ]);
    prisma.overhead.findMany.mockResolvedValue([
      { amount: dec(50), currency: Currency.USD, createdAt: new Date('2026-02-13T00:00:00Z') },
    ]);
    prisma.loanRepayment.findMany.mockResolvedValue([
      { amount: dec(150), currency: Currency.USD, repaidDate: new Date('2026-02-14T00:00:00Z') },
    ]);
    prisma.taxLedger.findMany.mockResolvedValue([
      { amountPaid: dec(80), currency: Currency.USD, updatedAt: new Date('2026-02-15T00:00:00Z') },
      // Zero-paid tax rows must be ignored.
      { amountPaid: dec(0), currency: Currency.USD, updatedAt: new Date('2026-02-16T00:00:00Z') },
    ]);

    const result = await service.compute({ window: MoneyWindow.MONTH });

    // Same-currency movements never hit the FX service.
    expect(exchangeRates.rateAsOf).not.toHaveBeenCalled();

    expect(result.buckets).toEqual([
      { bucket: '2026-02', inflow: 1300, outflow: 580, net: 720 },
      { bucket: '2026-03', inflow: 500, outflow: 0, net: 500 },
    ]);
    expect(result.totals).toEqual({ inflow: 1800, outflow: 580, net: 1220 });
  });

  it('normalises non-target currency movements via the exchange rate', async () => {
    const { service, prisma, exchangeRates } = makeService();
    // 2500 ZWG @ 0.04 => 100 USD inflow.
    prisma.orderReceipt.findMany.mockResolvedValue([
      { amount: dec(2500), currency: Currency.ZWG, receivedDate: new Date('2026-02-10T00:00:00Z') },
    ]);

    const result = await service.compute({ window: MoneyWindow.MONTH, currency: Currency.USD });

    expect(exchangeRates.rateAsOf).toHaveBeenCalledWith(
      'ZWGUSD',
      new Date('2026-02-10T00:00:00Z'),
      expect.anything(),
    );
    expect(result.buckets).toEqual([{ bucket: '2026-02', inflow: 100, outflow: 0, net: 100 }]);
  });

  it('falls back to 1:1 when the exchange rate lookup fails', async () => {
    const { service, prisma, exchangeRates } = makeService();
    exchangeRates.rateAsOf.mockRejectedValue(new Error('no rate on file'));
    prisma.orderReceipt.findMany.mockResolvedValue([
      { amount: dec(90), currency: Currency.ZWG, receivedDate: new Date('2026-02-10T00:00:00Z') },
    ]);

    const result = await service.compute();

    // Degrades to the raw amount rather than throwing.
    expect(result.totals.inflow).toBe(90);
  });

  it('buckets by day when window=day', async () => {
    const { service, prisma } = makeService();
    prisma.orderReceipt.findMany.mockResolvedValue([
      { amount: dec(10), currency: Currency.USD, receivedDate: new Date('2026-02-10T09:00:00Z') },
      { amount: dec(20), currency: Currency.USD, receivedDate: new Date('2026-02-10T18:00:00Z') },
      { amount: dec(5), currency: Currency.USD, receivedDate: new Date('2026-02-11T00:00:00Z') },
    ]);

    const result = await service.compute({ window: MoneyWindow.DAY });

    expect(result.buckets).toEqual([
      { bucket: '2026-02-10', inflow: 30, outflow: 0, net: 30 },
      { bucket: '2026-02-11', inflow: 5, outflow: 0, net: 5 },
    ]);
  });

  it('buckets by ISO week when window=week', async () => {
    const { service, prisma } = makeService();
    // 2026-02-10 is a Tuesday in ISO week 07.
    prisma.orderReceipt.findMany.mockResolvedValue([
      { amount: dec(40), currency: Currency.USD, receivedDate: new Date('2026-02-10T00:00:00Z') },
    ]);

    const result = await service.compute({ window: MoneyWindow.WEEK });

    expect(result.buckets).toEqual([{ bucket: '2026-W07', inflow: 40, outflow: 0, net: 40 }]);
  });

  it('passes the date window to every Prisma query when from/to are set', async () => {
    const { service, prisma } = makeService();
    const from = new Date('2026-02-01T00:00:00Z');
    const to = new Date('2026-03-01T00:00:00Z');

    await service.compute({ from, to });

    expect(prisma.orderReceipt.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { receivedDate: { gte: from, lt: to } } }),
    );
    expect(prisma.loanRepayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { repaidDate: { gte: from, lt: to } } }),
    );
  });
});
