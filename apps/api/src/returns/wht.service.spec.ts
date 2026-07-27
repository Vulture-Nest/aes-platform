import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { WhtService } from './wht.service';

const D = (n: number) => new Prisma.Decimal(n);

describe('WhtService', () => {
  const prisma = {
    whtRate: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    whtTransaction: { create: jest.fn(), findMany: jest.fn() },
    statutoryReturn: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new WhtService(prisma as any, audit as any);

  beforeEach(() => jest.clearAllMocks());

  it('auto-withholds when clearance is NOT held and raises a WHT liability return', async () => {
    prisma.whtRate.findFirst.mockResolvedValue({ rate: D(0.1), thresholdAmount: D(0) });
    prisma.whtTransaction.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'txn1', ...data }),
    );
    prisma.statutoryReturn.findFirst.mockResolvedValue(null);
    prisma.statutoryReturn.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'sr1', ...data }),
    );

    const res = await service.payable(
      {
        counterparty: 'Acme',
        taxBase: 5000,
        category: 'CONTRACTS',
        supplierTaxClearanceHeld: false,
        currency: 'USD',
        paymentDate: '2026-07-15T00:00:00.000Z',
      },
      'actor',
    );

    expect(res.withheld).toBe(true);
    expect(res.transaction.amount).toBe(500); // 5000 * 0.10
    expect(res.transaction.rate).toBe(0.1);
    expect(prisma.statutoryReturn.create).toHaveBeenCalled();
    const srArg = prisma.statutoryReturn.create.mock.calls[0][0];
    expect(srArg.data.taxType).toBe('WHT');
    expect(Number(srArg.data.amountDue)).toBe(500);
  });

  it('does NOT withhold when the supplier holds clearance (no rate lookup, no liability)', async () => {
    prisma.whtTransaction.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'txn2', ...data }),
    );

    const res = await service.payable(
      {
        counterparty: 'CleanSupplier',
        taxBase: 5000,
        category: 'CONTRACTS',
        supplierTaxClearanceHeld: true,
        currency: 'USD',
      },
      'actor',
    );

    expect(res.withheld).toBe(false);
    expect(res.transaction.amount).toBe(0);
    expect(prisma.whtRate.findFirst).not.toHaveBeenCalled();
    expect(prisma.statutoryReturn.create).not.toHaveBeenCalled();
  });

  it('does not withhold below the configured threshold', async () => {
    prisma.whtRate.findFirst.mockResolvedValue({ rate: D(0.1), thresholdAmount: D(1000) });
    prisma.whtTransaction.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'txn3', ...data }),
    );

    const res = await service.payable(
      {
        counterparty: 'SmallSupplier',
        taxBase: 500,
        category: 'CONTRACTS',
        supplierTaxClearanceHeld: false,
        currency: 'USD',
      },
      'actor',
    );

    expect(res.withheld).toBe(false);
    expect(res.transaction.amount).toBe(0);
    expect(prisma.statutoryReturn.create).not.toHaveBeenCalled();
  });

  it('throws when no rate is configured for a withholding payment', async () => {
    prisma.whtRate.findFirst.mockResolvedValue(null);
    await expect(
      service.payable(
        {
          counterparty: 'X',
          taxBase: 1000,
          category: 'UNKNOWN',
          supplierTaxClearanceHeld: false,
          currency: 'USD',
        },
        'actor',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('summarises suffered credits by currency, splitting certificated vs pending', async () => {
    prisma.whtTransaction.findMany.mockResolvedValue([
      { currency: 'USD', amount: D(100), certificateReceived: true, taxBase: D(0), rate: D(0) },
      { currency: 'USD', amount: D(50), certificateReceived: false, taxBase: D(0), rate: D(0) },
      { currency: 'ZWG', amount: D(300), certificateReceived: false, taxBase: D(0), rate: D(0) },
    ]);

    const res = await service.credits({});
    expect(res.byCurrency.USD.totalCredit).toBe(150);
    expect(res.byCurrency.USD.certificatedCredit).toBe(100);
    expect(res.byCurrency.USD.pendingCertificateCredit).toBe(50);
    expect(res.byCurrency.ZWG.totalCredit).toBe(300);
  });
});
