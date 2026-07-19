import { Currency, Prisma } from '@prisma/client';
import { LedgerService } from './ledger.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

function makeService() {
  const prisma = {
    ledgerEntry: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    account: {
      findMany: jest.fn(),
    },
  };
  const service = new LedgerService(prisma as any);
  return { service, prisma };
}

describe('LedgerService.post', () => {
  it('does nothing and returns [] for an empty batch', async () => {
    const { service, prisma } = makeService();
    const result = await service.post([]);
    expect(result).toEqual([]);
    expect(prisma.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it('creates rows with defaulted debit/credit and carries the source ref', async () => {
    const { service, prisma } = makeService();
    prisma.ledgerEntry.createMany.mockResolvedValue({ count: 2 });
    prisma.ledgerEntry.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);

    const rows = await service.post([
      {
        accountId: 'acc-1',
        credit: 500,
        currency: Currency.USD,
        sourceTable: 'order_receipts',
        sourceId: 'r1',
        description: 'receipt',
        createdBy: 'u1',
      },
      { accountId: 'acc-1', debit: 200, currency: Currency.USD },
    ]);

    expect(rows).toHaveLength(2);
    const data = prisma.ledgerEntry.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(2);
    // First entry: credit 500, debit defaulted to 0, source ref carried through.
    expect(data[0].credit).toStrictEqual(dec(500));
    expect(data[0].debit).toStrictEqual(dec(0));
    expect(data[0].sourceTable).toBe('order_receipts');
    expect(data[0].sourceId).toBe('r1');
    // Second entry: debit 200, credit defaulted, nullable source fields null.
    expect(data[1].debit).toStrictEqual(dec(200));
    expect(data[1].credit).toStrictEqual(dec(0));
    expect(data[1].sourceTable).toBeNull();
    expect(data[1].sourceId).toBeNull();
    // Every entry gets an entryDate even when the caller omits it.
    expect(data[0].entryDate).toBeInstanceOf(Date);
  });
});

describe('LedgerService.accountBalance', () => {
  it('computes SUM(credit) - SUM(debit) as a number', async () => {
    const { service, prisma } = makeService();
    prisma.ledgerEntry.aggregate.mockResolvedValue({
      _sum: { credit: dec(1000), debit: dec(350) },
    });
    await expect(service.accountBalance('acc-1')).resolves.toBe(650);
  });

  it('treats null sums (no entries) as zero', async () => {
    const { service, prisma } = makeService();
    prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { credit: null, debit: null } });
    await expect(service.accountBalance('acc-1')).resolves.toBe(0);
  });
});

describe('LedgerService.cashPosition', () => {
  it('returns per-account balances and per-currency totals', async () => {
    const { service, prisma } = makeService();
    prisma.account.findMany.mockResolvedValue([
      { id: 'a1', name: 'Bank USD', type: 'BANK', currency: Currency.USD },
      { id: 'a2', name: 'Bank ZWG', type: 'BANK', currency: Currency.ZWG },
      { id: 'a3', name: 'Petty Cash', type: 'PETTY_CASH', currency: Currency.USD },
    ]);
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { accountId: 'a1', _sum: { credit: dec(1000), debit: dec(200) } },
      { accountId: 'a2', _sum: { credit: dec(5000), debit: dec(1000) } },
      // a3 has no ledger entries → balance 0.
    ]);

    const result = await service.cashPosition();

    expect(result.accounts).toEqual([
      { accountId: 'a1', name: 'Bank USD', type: 'BANK', currency: Currency.USD, balance: 800 },
      { accountId: 'a2', name: 'Bank ZWG', type: 'BANK', currency: Currency.ZWG, balance: 4000 },
      {
        accountId: 'a3',
        name: 'Petty Cash',
        type: 'PETTY_CASH',
        currency: Currency.USD,
        balance: 0,
      },
    ]);
    expect(result.totals).toEqual({ USD: 800, ZWG: 4000 });
  });
});

describe('LedgerService.fundsAvailable', () => {
  it('is true when balance >= amount (boundary equal)', async () => {
    const { service, prisma } = makeService();
    prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { credit: dec(500), debit: dec(0) } });
    await expect(service.fundsAvailable('acc-1', 500)).resolves.toBe(true);
  });

  it('is false when balance < amount', async () => {
    const { service, prisma } = makeService();
    prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { credit: dec(499), debit: dec(0) } });
    await expect(service.fundsAvailable('acc-1', 500)).resolves.toBe(false);
  });
});
