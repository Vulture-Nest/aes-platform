import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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
      count: jest.fn(),
    },
    account: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
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
        currency: 'USD',
        sourceTable: 'order_receipts',
        sourceId: 'r1',
        description: 'receipt',
        createdBy: 'u1',
      },
      { accountId: 'acc-1', debit: 200, currency: 'USD' },
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
      { id: 'a1', name: 'Bank USD', type: 'BANK', currency: 'USD' },
      { id: 'a2', name: 'Bank ZWG', type: 'BANK', currency: 'ZWG' },
      { id: 'a3', name: 'Petty Cash', type: 'PETTY_CASH', currency: 'USD' },
    ]);
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { accountId: 'a1', _sum: { credit: dec(1000), debit: dec(200) } },
      { accountId: 'a2', _sum: { credit: dec(5000), debit: dec(1000) } },
      // a3 has no ledger entries → balance 0.
    ]);

    const result = await service.cashPosition();

    expect(result.accounts).toEqual([
      { accountId: 'a1', name: 'Bank USD', type: 'BANK', currency: 'USD', balance: 800 },
      { accountId: 'a2', name: 'Bank ZWG', type: 'BANK', currency: 'ZWG', balance: 4000 },
      {
        accountId: 'a3',
        name: 'Petty Cash',
        type: 'PETTY_CASH',
        currency: 'USD',
        balance: 0,
      },
    ]);
    expect(result.totals).toEqual({ USD: 800, ZWG: 4000 });
  });
});

describe('LedgerService.cashPosition contra exclusion', () => {
  it('EXCLUDES a contra account that has entries from both the rows and the totals', async () => {
    const { service, prisma } = makeService();
    prisma.account.findMany.mockResolvedValue([
      { id: 'a1', name: 'Bank USD', type: 'BANK', currency: 'USD' },
      { id: 'rev', name: 'System REVENUE USD', type: 'REVENUE', currency: 'USD' },
      { id: 'rec', name: 'System RECEIVABLE USD', type: 'RECEIVABLE', currency: 'USD' },
    ]);
    prisma.ledgerEntry.groupBy.mockResolvedValue([
      { accountId: 'a1', _sum: { credit: dec(1000), debit: dec(0) } },
      // Contra accounts carry entries but must NOT count toward cash.
      { accountId: 'rev', _sum: { credit: dec(0), debit: dec(1000) } },
      { accountId: 'rec', _sum: { credit: dec(0), debit: dec(500) } },
    ]);

    const result = await service.cashPosition();

    // Only the BANK account appears; contra accounts are dropped.
    expect(result.accounts).toEqual([
      { accountId: 'a1', name: 'Bank USD', type: 'BANK', currency: 'USD', balance: 1000 },
    ]);
    // The contra legs (-1000, -500) do NOT drag the total down: it stays the cash balance.
    expect(result.totals).toEqual({ USD: 1000, ZWG: 0 });
  });
});

describe('LedgerService.postJournal', () => {
  it('REJECTS an unbalanced set (Σdebit != Σcredit) with BadRequestException', async () => {
    const { service, prisma } = makeService();
    await expect(
      service.postJournal([
        { accountId: 'a1', debit: 100, currency: 'USD' },
        { accountId: 'a2', credit: 90, currency: 'USD' },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ledgerEntry.createMany).not.toHaveBeenCalled();
  });

  it('accepts a balanced set, assigns ONE shared txnId to every leg, and persists it', async () => {
    const { service, prisma } = makeService();
    prisma.ledgerEntry.createMany.mockResolvedValue({ count: 2 });
    prisma.ledgerEntry.findMany.mockResolvedValue([{ id: 'e1' }, { id: 'e2' }]);

    const { txnId } = await service.postJournal(
      [
        { accountId: 'a1', debit: 250, currency: 'USD' },
        { accountId: 'a2', credit: 250, currency: 'USD' },
      ],
      { sourceTable: 'requisitions', sourceId: 'r1' },
    );

    const data = prisma.ledgerEntry.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(2);
    expect(txnId).toEqual(expect.any(String));
    // Every leg shares the same txnId and carries the journal-level source ref.
    expect(data[0].txnId).toBe(txnId);
    expect(data[1].txnId).toBe(txnId);
    expect(data[0].sourceTable).toBe('requisitions');
    expect(data[1].sourceId).toBe('r1');
  });

  it('balances independently per currency', async () => {
    const { service } = makeService();
    // USD balances (100/100) but ZWG does not (50 debit vs 0 credit) → reject.
    await expect(
      service.postJournal([
        { accountId: 'a1', debit: 100, currency: 'USD' },
        { accountId: 'a2', credit: 100, currency: 'USD' },
        { accountId: 'a3', debit: 50, currency: 'ZWG' },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('LedgerService.ensureSystemAccount', () => {
  it('creates the named system account when absent', async () => {
    const { service, prisma } = makeService();
    prisma.account.findFirst.mockResolvedValue(null);
    prisma.account.create.mockResolvedValue({ id: 'rev-usd', name: 'System REVENUE USD' });
    const acc = await service.ensureSystemAccount('REVENUE', 'USD');
    expect(acc.id).toBe('rev-usd');
    expect(prisma.account.create).toHaveBeenCalledWith({
      data: { name: 'System REVENUE USD', type: 'REVENUE', currency: 'USD' },
    });
  });

  it('returns the existing account without creating when present', async () => {
    const { service, prisma } = makeService();
    prisma.account.findFirst.mockResolvedValue({ id: 'rev-usd' });
    const acc = await service.ensureSystemAccount('REVENUE', 'USD');
    expect(acc.id).toBe('rev-usd');
    expect(prisma.account.create).not.toHaveBeenCalled();
  });
});

describe('LedgerService.postOrderReceipt (revenue inflow)', () => {
  it('posts a BALANCED revenue journal: CREDIT bank + DEBIT revenue', async () => {
    const { service, prisma } = makeService();
    prisma.ledgerEntry.count.mockResolvedValue(0); // not yet posted
    prisma.account.findFirst
      .mockResolvedValueOnce({ id: 'bank-usd', type: 'BANK' }) // BANK
      .mockResolvedValueOnce({ id: 'rev-usd', type: 'REVENUE' }); // REVENUE
    prisma.ledgerEntry.createMany.mockResolvedValue({ count: 2 });

    await service.postOrderReceipt({ id: 'r1', amount: 500, currency: 'USD', createdBy: 'u1' });

    const data = prisma.ledgerEntry.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(2);
    const bankLeg = data.find((d: any) => d.accountId === 'bank-usd');
    const revLeg = data.find((d: any) => d.accountId === 'rev-usd');
    expect(bankLeg.credit).toStrictEqual(dec(500));
    expect(bankLeg.debit).toStrictEqual(dec(0));
    expect(revLeg.debit).toStrictEqual(dec(500));
    expect(revLeg.credit).toStrictEqual(dec(0));
    // Both legs share the journal txnId and the receipt source ref.
    expect(bankLeg.txnId).toBe(revLeg.txnId);
    expect(bankLeg.sourceTable).toBe('order_receipts');
    expect(bankLeg.sourceId).toBe('r1');
  });

  it('is IDEMPOTENT — re-posting the same receipt does nothing', async () => {
    const { service, prisma } = makeService();
    prisma.ledgerEntry.count.mockResolvedValue(2); // already posted for this receipt

    await service.postOrderReceipt({ id: 'r1', amount: 500, currency: 'USD' });

    expect(prisma.ledgerEntry.createMany).not.toHaveBeenCalled();
    expect(prisma.account.findFirst).not.toHaveBeenCalled();
  });
});

describe('LedgerService.postContractClaim (revenue accrual)', () => {
  it('posts a BALANCED journal: DEBIT receivable + CREDIT revenue (no cash leg)', async () => {
    const { service, prisma } = makeService();
    prisma.ledgerEntry.count.mockResolvedValue(0);
    prisma.account.findFirst
      .mockResolvedValueOnce({ id: 'rec-usd', type: 'RECEIVABLE' })
      .mockResolvedValueOnce({ id: 'rev-usd', type: 'REVENUE' });
    prisma.ledgerEntry.createMany.mockResolvedValue({ count: 2 });

    await service.postContractClaim({ id: 'c1', amountExVat: 800, currency: 'USD' });

    const data = prisma.ledgerEntry.createMany.mock.calls[0][0].data;
    const recLeg = data.find((d: any) => d.accountId === 'rec-usd');
    const revLeg = data.find((d: any) => d.accountId === 'rev-usd');
    expect(recLeg.debit).toStrictEqual(dec(800));
    expect(revLeg.credit).toStrictEqual(dec(800));
    expect(recLeg.sourceTable).toBe('contract_claims');
    expect(recLeg.sourceId).toBe('c1');
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
