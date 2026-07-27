import { Prisma } from '@prisma/client';
import { ReturnsService } from './returns.service';

const D = (n: number) => new Prisma.Decimal(n);

describe('ReturnsService', () => {
  const prisma = {
    statutoryReturn: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    returnRemittance: { create: jest.fn() },
    payrollRun: { findMany: jest.fn() },
    taxLedger: { findMany: jest.fn() },
  };
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new ReturnsService(prisma as any, audit as any);

  beforeEach(() => jest.clearAllMocks());

  it('post-from-payroll sums heads (NSSA = ee + er) and upserts idempotently', async () => {
    prisma.payrollRun.findMany.mockResolvedValue([
      {
        entityId: null,
        lines: [
          { paye: D(100), aidsLevy: D(3), nssaEe: D(10), nssaEr: D(20), zimdef: D(5), nec: D(2), mipf: D(1), nyaradzo: D(4) },
          { paye: D(50), aidsLevy: D(1.5), nssaEe: D(5), nssaEr: D(10), zimdef: D(2.5), nec: D(1), mipf: D(0.5), nyaradzo: D(2) },
        ],
      },
    ]);
    prisma.statutoryReturn.findFirst.mockResolvedValue(null);
    prisma.statutoryReturn.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: `${data.taxType}-id`, ...data }),
    );

    const res = await service.postFromPayroll({ period: '2026-07' }, 'actor');
    const byType = Object.fromEntries(res.returns.map((r: any) => [r.taxType, r.amountDue]));
    expect(byType.PAYE).toBe(150);
    expect(byType.AIDS_LEVY).toBe(4.5);
    expect(byType.NSSA).toBe(45); // (10+20)+(5+10)
    expect(byType.NYARADZO).toBe(6);
    // idempotent upsert path checked existence first
    expect(prisma.statutoryReturn.findFirst).toHaveBeenCalled();
  });

  it('derives the head list from a run\'s actual non-zero heads (data-driven per country)', async () => {
    // A run in another country that levies only PAYE + NSSA (no AIDS levy / ZIMDEF / NEC / MIPF /
    // NYARADZO): those zero heads must NOT be filed, while a ZW-shaped run keeps its full set.
    prisma.payrollRun.findMany.mockResolvedValue([
      {
        entityId: 'entity-xx',
        lines: [
          { paye: D(200), aidsLevy: D(0), nssaEe: D(15), nssaEr: D(15), zimdef: D(0), nec: D(0), mipf: D(0), nyaradzo: D(0) },
        ],
      },
    ]);
    prisma.statutoryReturn.findFirst.mockResolvedValue(null);
    prisma.statutoryReturn.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: `${data.taxType}-id`, ...data }),
    );

    const res = await service.postFromPayroll({ period: '2026-07' }, 'actor');
    const heads = res.returns.map((r: any) => r.taxType).sort();
    expect(heads).toEqual(['NSSA', 'PAYE']); // only the non-zero heads, nothing else
    expect(res.returns.find((r: any) => r.taxType === 'PAYE')!.amountDue).toBe(200);
    expect(res.returns.find((r: any) => r.taxType === 'NSSA')!.amountDue).toBe(30);
  });

  it('remit increments amountPaid and leaves PARTIAL when a balance remains', async () => {
    prisma.statutoryReturn.findUnique.mockResolvedValue({
      id: 'r1',
      amountDue: D(100),
      amountPaid: D(0),
      filingDeadline: new Date('2999-01-01T00:00:00.000Z'),
      status: 'DUE',
    });
    prisma.returnRemittance.create.mockResolvedValue({ id: 'rem1' });
    prisma.statutoryReturn.update.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'r1',
        amountDue: D(100),
        amountPaid: data.amountPaid,
        filingDeadline: new Date('2999-01-01T00:00:00.000Z'),
        status: data.status,
      }),
    );

    const res = await service.remit(
      'r1',
      { paidAt: '2026-07-15T00:00:00.000Z', amount: 40, currency: 'USD' },
      'actor',
    );
    expect(res.return.status).toBe('PARTIAL');
    expect(res.return.amountPaid).toBe(40);
    expect(res.return.balance).toBe(60);
    // amountPaid persisted as 40
    const updateArg = prisma.statutoryReturn.update.mock.calls[0][0];
    expect(Number(updateArg.data.amountPaid)).toBe(40);
  });

  it('remit that clears the balance marks the return PAID', async () => {
    prisma.statutoryReturn.findUnique.mockResolvedValue({
      id: 'r1',
      amountDue: D(100),
      amountPaid: D(60),
      filingDeadline: new Date('2999-01-01T00:00:00.000Z'),
      status: 'PARTIAL',
    });
    prisma.returnRemittance.create.mockResolvedValue({ id: 'rem2' });
    prisma.statutoryReturn.update.mockImplementation(({ data }: any) =>
      Promise.resolve({
        id: 'r1',
        amountDue: D(100),
        amountPaid: data.amountPaid,
        filingDeadline: new Date('2999-01-01T00:00:00.000Z'),
        status: data.status,
      }),
    );

    const res = await service.remit(
      'r1',
      { paidAt: '2026-07-15T00:00:00.000Z', amount: 40, currency: 'USD' },
      'actor',
    );
    expect(res.return.status).toBe('PAID');
    expect(res.return.balance).toBe(0);
  });

  it('post-vat nets due-paid per currency from the tax ledger (floored at 0)', async () => {
    prisma.taxLedger.findMany.mockResolvedValue([
      { currency: 'USD', amountDue: D(1000), amountPaid: D(200), entityId: null },
      { currency: 'USD', amountDue: D(0), amountPaid: D(50), entityId: null },
      { currency: 'ZWG', amountDue: D(300), amountPaid: D(0), entityId: null },
    ]);
    prisma.statutoryReturn.findFirst.mockResolvedValue(null);
    prisma.statutoryReturn.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: `${data.currency}-id`, ...data }),
    );

    const res = await service.postVat({ period: '2026-07' }, 'actor');
    const usd = res.returns.find((r: any) => r.currency === 'USD');
    const zwg = res.returns.find((r: any) => r.currency === 'ZWG');
    expect(usd!.amountDue).toBe(750); // (1000-200)+(0-50)
    expect(zwg!.amountDue).toBe(300);
  });
});
