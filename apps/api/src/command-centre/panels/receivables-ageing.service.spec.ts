import { Prisma } from '@prisma/client';
import { OrderFinancialsService } from '../../financial/domain/order-financials.service';
import { ReceivablesAgeingService } from './receivables-ageing.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

/** Reference "today" used across the suite. */
const ASOF = new Date('2026-07-19T00:00:00.000Z');

/** Build an order (with receipts + client) N days before ASOF via closingDate. */
function order(opts: {
  id: string;
  clientId?: string;
  clientName?: string;
  reference?: string;
  valueExVat: number;
  currency?: string;
  daysAgo: number;
  receipts?: { amount: number; currency?: string }[];
  serviced?: boolean;
}) {
  const currency = opts.currency ?? 'USD';
  const closingDate = new Date(ASOF.getTime() - opts.daysAgo * 24 * 60 * 60 * 1000);
  return {
    id: opts.id,
    clientId: opts.clientId ?? 'client-1',
    reference: opts.reference ?? `ORD-${opts.id}`,
    valueExVat: dec(opts.valueExVat),
    currency,
    closingDate,
    serviced: opts.serviced ?? true,
    createdAt: closingDate,
    client: { id: opts.clientId ?? 'client-1', name: opts.clientName ?? 'Acme Ltd' },
    receipts: (opts.receipts ?? []).map((r, i) => ({
      id: `${opts.id}-r${i}`,
      orderId: opts.id,
      amount: dec(r.amount),
      currency: r.currency ?? currency,
    })),
  };
}

function makeService(orders: any[]) {
  const prisma = {
    order: { findMany: jest.fn().mockResolvedValue(orders) },
  };
  const exchangeRates = {
    // 1 ZWG = 0.04 USD by default (only used when ZWG totals are present).
    rateAsOf: jest.fn().mockResolvedValue({ rate: '0.04' }),
  };
  const thresholds = {
    // Default: no configured thresholds -> service falls back to VAT 15 / overdue 30.
    current: jest.fn().mockRejectedValue(new Error('not configured')),
  };
  const financials = new OrderFinancialsService();
  const service = new ReceivablesAgeingService(
    prisma as any,
    financials,
    exchangeRates as any,
    thresholds as any,
  );
  return { service, prisma, exchangeRates, thresholds };
}

describe('ReceivablesAgeingService.compute', () => {
  it('returns an empty result when there are no orders', async () => {
    const { service, exchangeRates } = makeService([]);

    const result = await service.compute({ asOf: ASOF });

    expect(result.clients).toEqual([]);
    expect(result.orderCount).toBe(0);
    expect(result.totalsByCurrency).toEqual({ USD: 0, ZWG: 0 });
    expect(result.overdueByCurrency).toEqual({ USD: 0, ZWG: 0 });
    expect(result.bucketsByCurrency.USD).toEqual({ '0-30': 0, '31-60': 0, '61-90': 0, '90+': 0 });
    // No ZWG present -> USD headline equals USD total (0), no FX lookup.
    expect(result.totalOutstandingUsd).toBe(0);
    expect(exchangeRates.rateAsOf).not.toHaveBeenCalled();
    expect(result.asOf).toBe(ASOF.toISOString());
  });

  it('computes outstanding (total incl VAT - receipts), buckets by age, and flags overdue', async () => {
    // Order A: value 1000 ex VAT -> incl VAT (15%) 1150; received 150 -> outstanding 1000.
    //   Aged 10 days -> bucket 0-30, not overdue (>30).
    // Order B: value 2000 ex VAT -> incl VAT 2300; no receipts -> outstanding 2300.
    //   Aged 95 days -> bucket 90+, overdue.
    const { service, thresholds } = makeService([
      order({ id: 'A', valueExVat: 1000, daysAgo: 10, receipts: [{ amount: 150 }] }),
      order({ id: 'B', valueExVat: 2000, daysAgo: 95 }),
    ]);

    const result = await service.compute({ asOf: ASOF });

    // Both fall under the same client + currency -> one rollup row.
    expect(result.clients).toHaveLength(1);
    const client = result.clients[0];
    expect(client.clientId).toBe('client-1');
    expect(client.currency).toBe('USD');
    expect(client.totalOutstanding).toBe(3300);
    expect(client.overdueOutstanding).toBe(2300);
    expect(client.buckets).toEqual({ '0-30': 1000, '31-60': 0, '61-90': 0, '90+': 2300 });

    const lineA = client.lines.find((l) => l.orderId === 'A')!;
    expect(lineA.totalInclVat).toBe(1150);
    expect(lineA.received).toBe(150);
    expect(lineA.outstanding).toBe(1000);
    expect(lineA.bucket).toBe('0-30');
    expect(lineA.overdue).toBe(false);

    const lineB = client.lines.find((l) => l.orderId === 'B')!;
    expect(lineB.outstanding).toBe(2300);
    expect(lineB.bucket).toBe('90+');
    expect(lineB.overdue).toBe(true);

    expect(result.totalsByCurrency.USD).toBe(3300);
    expect(result.overdueByCurrency.USD).toBe(2300);
    expect(result.bucketsByCurrency.USD).toEqual({
      '0-30': 1000,
      '31-60': 0,
      '61-90': 0,
      '90+': 2300,
    });
    expect(result.orderCount).toBe(2);
    // No ZWG -> USD headline equals the USD total.
    expect(result.totalOutstandingUsd).toBe(3300);
    // Threshold lookups were attempted (VAT + overdue days) and fell back.
    expect(thresholds.current).toHaveBeenCalled();
  });

  it('excludes fully-paid orders and separates clients/currencies, sorting by outstanding', async () => {
    const { service } = makeService([
      // Fully paid: 100 ex VAT -> 115 incl; received 115 -> outstanding 0 -> excluded.
      order({ id: 'PAID', valueExVat: 100, daysAgo: 5, receipts: [{ amount: 115 }] }),
      // Client 2, smaller outstanding.
      order({
        id: 'C2',
        clientId: 'client-2',
        clientName: 'Beta Co',
        valueExVat: 200,
        daysAgo: 45,
      }),
      // Client 1, larger outstanding.
      order({
        id: 'C1',
        clientId: 'client-1',
        clientName: 'Acme Ltd',
        valueExVat: 1000,
        daysAgo: 70,
      }),
    ]);

    const result = await service.compute({ asOf: ASOF });

    // PAID order dropped; two client rows remain, largest first.
    expect(result.clients).toHaveLength(2);
    expect(result.clients[0].clientId).toBe('client-1');
    expect(result.clients[0].totalOutstanding).toBe(1150);
    expect(result.clients[0].buckets['61-90']).toBe(1150);
    expect(result.clients[1].clientId).toBe('client-2');
    expect(result.clients[1].totalOutstanding).toBe(230);
    expect(result.clients[1].buckets['31-60']).toBe(230);
    expect(result.orderCount).toBe(2);
  });

  it('consolidates ZWG outstanding into a USD headline via the official rate', async () => {
    const { service, exchangeRates } = makeService([
      order({ id: 'U', valueExVat: 1000, daysAgo: 10 }), // USD 1150 outstanding
      order({ id: 'Z', valueExVat: 1000, currency: 'ZWG', daysAgo: 10 }), // ZWG 1150
    ]);

    const result = await service.compute({ asOf: ASOF });

    // USD 1150 + ZWG 1150 * 0.04 = 1150 + 46 = 1196.
    expect(exchangeRates.rateAsOf).toHaveBeenCalledWith('ZWG/USD', ASOF);
    expect(result.totalsByCurrency).toEqual({ USD: 1150, ZWG: 1150 });
    expect(result.totalOutstandingUsd).toBe(1196);
  });

  it('returns a null USD headline when the ZWG rate is unavailable', async () => {
    const { service, exchangeRates } = makeService([
      order({ id: 'Z', valueExVat: 1000, currency: 'ZWG', daysAgo: 10 }),
    ]);
    exchangeRates.rateAsOf.mockRejectedValue(new Error('no rate'));

    const result = await service.compute({ asOf: ASOF });

    expect(result.totalsByCurrency.ZWG).toBe(1150);
    expect(result.totalOutstandingUsd).toBeNull();
  });
});
