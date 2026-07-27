import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { StatusTransitionRegistry } from '../../approvals/status-transition.registry';
import { PettyCashService, PettyCashTxnStatus, PettyCashTxnType } from './petty-cash.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

function makeService() {
  const prisma = {
    pettyCashFloat: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    pettyCashTxn: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    account: { findUnique: jest.fn(), findFirst: jest.fn() },
    userSiteRole: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = { record: jest.fn() };
  const notifications = { send: jest.fn() };
  const approvals = { submit: jest.fn().mockResolvedValue({ id: 'chain1' }) };
  const transitions = new StatusTransitionRegistry();
  const ledger = {
    post: jest.fn().mockResolvedValue([]),
    postJournal: jest.fn().mockResolvedValue({ txnId: 'txn1', rows: [] }),
    ensureSystemAccount: jest.fn().mockResolvedValue({ id: 'system-petty-usd' }),
  };
  const thresholds = { current: jest.fn() };
  const exchangeRates = { rateAsOf: jest.fn() };
  const lookups = { assertValid: jest.fn().mockResolvedValue(undefined) };

  const service = new PettyCashService(
    prisma as any,
    audit as any,
    notifications as any,
    approvals as any,
    transitions,
    ledger as any,
    thresholds as any,
    exchangeRates as any,
    lookups as any,
  );
  service.onModuleInit();
  return {
    service,
    prisma,
    audit,
    notifications,
    approvals,
    transitions,
    ledger,
    thresholds,
    exchangeRates,
  };
}

const floatUSD = (overrides: Record<string, unknown> = {}) => ({
  id: 'f1',
  siteId: 's1',
  currency: 'USD',
  custodianUserId: 'cust1',
  floatAmount: dec(500),
  locked: false,
  ...overrides,
});

describe('PettyCashService.createWithdrawal (threshold routing)', () => {
  it('BELOW threshold: creates a SUBMITTED voucher awaiting Site Manager confirm (no engine)', async () => {
    const { service, prisma, approvals, notifications, thresholds } = makeService();
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    thresholds.current.mockResolvedValue({ value: dec(100) }); // FD threshold = 100
    prisma.pettyCashTxn.create.mockImplementation(async ({ data }: any) => ({
      id: 'w1',
      ...data,
    }));

    const txn = await service.createWithdrawal('f1', { amount: 45, purpose: 'Fuel' }, 'clerk1');

    expect(txn.type).toBe(PettyCashTxnType.WITHDRAWAL);
    expect(txn.status).toBe(PettyCashTxnStatus.SUBMITTED);
    // Below threshold never goes to the approval engine.
    expect(approvals.submit).not.toHaveBeenCalled();
    // Site Managers are notified to confirm.
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'petty_cash.withdrawal.awaiting_confirm' }),
    );
  });

  it('AT/ABOVE threshold: routes the voucher to the FD approval engine before cash leaves', async () => {
    const { service, prisma, approvals, thresholds } = makeService();
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    thresholds.current.mockResolvedValue({ value: dec(100) });
    prisma.pettyCashTxn.create.mockImplementation(async ({ data }: any) => ({
      id: 'w1',
      ...data,
    }));

    await service.createWithdrawal('f1', { amount: 100, purpose: 'Big spend' }, 'clerk1');

    expect(approvals.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'petty_cash',
        subjectTable: 'petty_cash_txns',
        subjectId: 'w1',
        amount: dec(100),
        currency: 'USD',
        siteId: 's1',
        requesterId: 'clerk1',
      }),
    );
  });

  it('blocks all withdrawals when the float is locked', async () => {
    const { service, prisma } = makeService();
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD({ locked: true }));
    await expect(
      service.createWithdrawal('f1', { amount: 10, purpose: 'x' }, 'clerk1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('PettyCashService.confirmWithdrawal (below-threshold post)', () => {
  it('posts the withdrawal on a Site Manager confirm', async () => {
    const { service, prisma, thresholds } = makeService();
    thresholds.current.mockResolvedValue({ value: dec(100) });
    prisma.pettyCashTxn.findUnique.mockResolvedValue({
      id: 'w1',
      floatId: 'f1',
      type: PettyCashTxnType.WITHDRAWAL,
      amount: dec(45),
      currency: 'USD',
      status: PettyCashTxnStatus.SUBMITTED,
      createdBy: 'clerk1',
    });
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    prisma.pettyCashTxn.update.mockResolvedValue({
      id: 'w1',
      status: PettyCashTxnStatus.POSTED,
    });

    const res = await service.confirmWithdrawal('w1', 'sm1');

    expect(prisma.pettyCashTxn.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PettyCashTxnStatus.POSTED }),
      }),
    );
    expect(res.status).toBe(PettyCashTxnStatus.POSTED);
  });

  it('forbids the voucher raiser from confirming their own withdrawal (SoD)', async () => {
    const { service, prisma } = makeService();
    prisma.pettyCashTxn.findUnique.mockResolvedValue({
      id: 'w1',
      floatId: 'f1',
      type: PettyCashTxnType.WITHDRAWAL,
      amount: dec(45),
      status: PettyCashTxnStatus.SUBMITTED,
      createdBy: 'clerk1',
    });
    await expect(service.confirmWithdrawal('w1', 'clerk1')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects a Site Manager confirm on an at/above-threshold voucher (needs FD approval)', async () => {
    const { service, prisma, thresholds } = makeService();
    thresholds.current.mockResolvedValue({ value: dec(100) });
    prisma.pettyCashTxn.findUnique.mockResolvedValue({
      id: 'w1',
      floatId: 'f1',
      type: PettyCashTxnType.WITHDRAWAL,
      amount: dec(150),
      currency: 'USD',
      status: PettyCashTxnStatus.SUBMITTED,
      createdBy: 'clerk1',
    });
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    await expect(service.confirmWithdrawal('w1', 'sm1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('PettyCashService FD-approval posting (via APPROVED transition)', () => {
  it('posts an approved above-threshold withdrawal when the chain resolves APPROVED', async () => {
    const { prisma, transitions } = makeService();
    prisma.pettyCashTxn.findUnique.mockResolvedValue({
      id: 'w1',
      floatId: 'f1',
      type: PettyCashTxnType.WITHDRAWAL,
      amount: dec(150),
      currency: 'USD',
      status: PettyCashTxnStatus.SUBMITTED,
      createdBy: 'clerk1',
      linkedTxnId: null,
    });
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    prisma.pettyCashTxn.update.mockResolvedValue({
      id: 'w1',
      status: PettyCashTxnStatus.POSTED,
    });

    await transitions.fire('petty_cash_txns', 'w1', ApprovalStatus.APPROVED);

    expect(prisma.pettyCashTxn.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'w1' },
        data: expect.objectContaining({ status: PettyCashTxnStatus.POSTED }),
      }),
    );
  });

  it('mirrors REJECTED onto the txn', async () => {
    const { prisma, transitions } = makeService();
    prisma.pettyCashTxn.findUnique.mockResolvedValue({
      id: 'w1',
      floatId: 'f1',
      type: PettyCashTxnType.WITHDRAWAL,
      status: PettyCashTxnStatus.SUBMITTED,
      linkedTxnId: null,
    });
    await transitions.fire('petty_cash_txns', 'w1', ApprovalStatus.REJECTED);
    expect(prisma.pettyCashTxn.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: PettyCashTxnStatus.REJECTED } }),
    );
  });
});

describe('PettyCashService.createConversion (two linked legs + variance)', () => {
  it('creates an OUT + IN leg, computes achieved amount and variance vs official', async () => {
    const { service, prisma, exchangeRates, thresholds } = makeService();
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    // Below threshold so both legs post directly.
    thresholds.current.mockResolvedValue({ value: dec(1000) });
    // Official rate of the day = 30 USD->ZWG; achieved = 32.5 (variance +2.5).
    exchangeRates.rateAsOf.mockResolvedValue({ rate: '30' });
    const created: any[] = [];
    prisma.pettyCashTxn.create.mockImplementation(async ({ data }: any) => {
      const row = { id: `leg${created.length + 1}`, ...data };
      created.push(row);
      return row;
    });
    prisma.pettyCashTxn.update.mockResolvedValue({});
    prisma.pettyCashTxn.findUnique.mockResolvedValue(null);

    const res = await service.createConversion(
      'f1',
      { amount: 100, toCurrency: 'ZWG' as any, achievedRate: 32.5 },
      'sm1',
    );

    // OUT leg = float currency, 100 USD.
    expect(res.out.type).toBe(PettyCashTxnType.CONVERSION_OUT);
    expect(res.out.currency).toBe('USD');
    expect(new Prisma.Decimal(res.out.amount).toNumber()).toBe(100);
    // IN leg = target currency, 100 * 32.5 = 3250 ZWG.
    expect(res.in.type).toBe(PettyCashTxnType.CONVERSION_IN);
    expect(res.in.currency).toBe('ZWG');
    expect(new Prisma.Decimal(res.in.amount).toNumber()).toBe(3250);
    // Variance vs official = 32.5 - 30 = 2.5 on both legs.
    expect(res.varianceVsOfficial).toBe(2.5);
    expect(new Prisma.Decimal(res.out.varianceVsOfficial!).toNumber()).toBe(2.5);
    // Two legs created and cross-linked.
    expect(prisma.pettyCashTxn.create).toHaveBeenCalledTimes(2);
    expect(res.in.linkedTxnId).toBe(res.out.id);
  });

  it('rejects converting to the same currency as the float', async () => {
    const { service, prisma } = makeService();
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    await expect(
      service.createConversion(
        'f1',
        { amount: 100, toCurrency: 'USD' as any, achievedRate: 1 },
        'sm1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('routes an at/above-threshold conversion OUT leg to the FD approval engine', async () => {
    const { service, prisma, approvals, exchangeRates, thresholds } = makeService();
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    thresholds.current.mockResolvedValue({ value: dec(100) });
    exchangeRates.rateAsOf.mockResolvedValue({ rate: '30' });
    prisma.pettyCashTxn.create.mockImplementation(async ({ data }: any) => ({
      id: `leg-${data.type}`,
      ...data,
    }));
    prisma.pettyCashTxn.update.mockResolvedValue({});

    await service.createConversion(
      'f1',
      { amount: 200, toCurrency: 'ZWG' as any, achievedRate: 30 },
      'sm1',
    );

    expect(approvals.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'petty_cash',
        subjectId: 'leg-CONVERSION_OUT',
        amount: dec(200),
      }),
    );
  });
});

describe('PettyCashService.recordCount (reconciliation lock)', () => {
  it('locks the float and alerts FD when the counted variance exceeds tolerance', async () => {
    const { service, prisma, notifications } = makeService();
    // Float 500, tolerance 2% = 10. No posted txns => expected balance = 500.
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    prisma.pettyCashTxn.findMany.mockResolvedValue([]);
    prisma.userSiteRole.findMany.mockResolvedValue([{ userId: 'fd1' }]);
    prisma.pettyCashFloat.update.mockImplementation(async ({ data }: any) => ({
      ...floatUSD(),
      ...data,
    }));

    // counted 480 => variance -20, |20| > 10 tolerance => LOCK.
    const res = await service.recordCount('f1', { countedAmount: 480 }, 'sm1');

    expect(res.expected).toBe(500);
    expect(res.variance).toBe(-20);
    expect(res.locked).toBe(true);
    expect(prisma.pettyCashFloat.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ locked: true }) }),
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'petty_cash.count.variance_locked',
        severity: 'DANGER',
        userIds: ['fd1'],
      }),
    );
  });

  it('leaves the float unlocked when the variance is within tolerance', async () => {
    const { service, prisma, notifications } = makeService();
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    prisma.pettyCashTxn.findMany.mockResolvedValue([]);
    prisma.pettyCashFloat.update.mockImplementation(async ({ data }: any) => ({
      ...floatUSD(),
      ...data,
    }));

    // counted 495 => variance -5, within 10 tolerance => no lock.
    const res = await service.recordCount('f1', { countedAmount: 495 }, 'sm1');

    expect(res.variance).toBe(-5);
    expect(res.locked).toBe(false);
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('a locked float blocks a subsequent withdrawal (end-to-end lock effect)', async () => {
    const { service, prisma, notifications } = makeService();
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    prisma.pettyCashTxn.findMany.mockResolvedValue([]);
    prisma.userSiteRole.findMany.mockResolvedValue([{ userId: 'fd1' }]);
    prisma.pettyCashFloat.update.mockImplementation(async ({ data }: any) => ({
      ...floatUSD(),
      ...data,
    }));
    void notifications;

    const count = await service.recordCount('f1', { countedAmount: 400 }, 'sm1');
    expect(count.locked).toBe(true);

    // Now the float is locked; a withdrawal must be blocked.
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD({ locked: true }));
    await expect(
      service.createWithdrawal('f1', { amount: 10, purpose: 'x' }, 'clerk1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('PettyCashService.balance (derived from POSTED txns)', () => {
  it('draws down for posted withdrawals/conversion-outs and adds top-ups/conversion-ins', async () => {
    const { service, prisma } = makeService();
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    prisma.pettyCashTxn.findMany.mockResolvedValue([
      { type: PettyCashTxnType.WITHDRAWAL, amount: dec(50) },
      { type: PettyCashTxnType.CONVERSION_OUT, amount: dec(30) },
      { type: PettyCashTxnType.TOP_UP, amount: dec(100) },
      { type: PettyCashTxnType.CONVERSION_IN, amount: dec(10) },
    ]);

    // 500 - 50 - 30 + 100 + 10 = 530.
    expect(await service.balance('f1')).toBe(530);
  });
});

describe('PettyCashService.createTopUp (approvable; posts bank->petty cash on approval)', () => {
  it('creates a SUBMITTED top-up and routes it to the approval engine', async () => {
    const { service, prisma, approvals } = makeService();
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    prisma.account.findUnique.mockResolvedValue({ id: 'bank1', currency: 'USD' });
    prisma.pettyCashTxn.create.mockImplementation(async ({ data }: any) => ({
      id: 'top1',
      ...data,
    }));
    prisma.pettyCashTxn.update.mockResolvedValue({});

    const txn = await service.createTopUp('f1', { amount: 320, sourceAccountId: 'bank1' }, 'sm1');

    expect(txn.type).toBe(PettyCashTxnType.TOP_UP);
    expect(approvals.submit).toHaveBeenCalledWith(
      expect.objectContaining({ module: 'petty_cash', subjectId: 'top1', amount: dec(320) }),
    );
  });

  it('rejects a source account whose currency does not match the float', async () => {
    const { service, prisma } = makeService();
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    prisma.account.findUnique.mockResolvedValue({ id: 'bank1', currency: 'ZWG' });
    await expect(
      service.createTopUp('f1', { amount: 320, sourceAccountId: 'bank1' }, 'sm1'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('posts a balanced bank->petty-cash journal (DEBIT bank + CREDIT petty cash) on APPROVED', async () => {
    const { prisma, transitions, ledger } = makeService();
    prisma.pettyCashTxn.findUnique.mockResolvedValue({
      id: 'top1',
      floatId: 'f1',
      type: PettyCashTxnType.TOP_UP,
      amount: dec(320),
      currency: 'USD',
      status: PettyCashTxnStatus.SUBMITTED,
      createdBy: 'sm1',
      linkedTxnId: 'bank1', // funding account carried here
    });
    prisma.pettyCashFloat.findUnique.mockResolvedValue(floatUSD());
    // The site's petty-cash ledger account is the CREDIT destination.
    prisma.account.findFirst.mockResolvedValue({ id: 'petty-s1-usd', type: 'PETTY_CASH' });
    prisma.pettyCashTxn.update.mockResolvedValue({ id: 'top1', status: PettyCashTxnStatus.POSTED });

    await transitions.fire('petty_cash_txns', 'top1', ApprovalStatus.APPROVED);

    // Transfer between two cash accounts — balances, net cash unchanged.
    expect(ledger.postJournal).toHaveBeenCalledWith(
      [
        expect.objectContaining({ accountId: 'bank1', debit: 320, currency: 'USD' }),
        expect.objectContaining({ accountId: 'petty-s1-usd', credit: 320, currency: 'USD' }),
      ],
      expect.objectContaining({ sourceTable: 'petty_cash_txns', sourceId: 'top1' }),
    );
  });
});

describe('PettyCashService.conversionsReport (G25)', () => {
  it('sums conversion variance per site + period and derives monetary gain/loss', async () => {
    const { service, prisma } = makeService();
    // Two floats across two sites.
    prisma.pettyCashFloat.findMany.mockResolvedValue([
      { id: 'f1', siteId: 's1' },
      { id: 'f2', siteId: 's2' },
    ]);
    prisma.pettyCashTxn.findMany.mockResolvedValue([
      // s1, 2026-07: an OUT leg (variance +0.5 on 100 units) and its IN leg (same variance).
      {
        floatId: 'f1',
        type: PettyCashTxnType.CONVERSION_OUT,
        amount: dec(100),
        varianceVsOfficial: dec(0.5),
        createdAt: new Date('2026-07-10T00:00:00Z'),
      },
      {
        floatId: 'f1',
        type: PettyCashTxnType.CONVERSION_IN,
        amount: dec(250),
        varianceVsOfficial: dec(0.5),
        createdAt: new Date('2026-07-10T00:00:00Z'),
      },
      // s2, 2026-08: a loss (variance -0.2 on 50 units).
      {
        floatId: 'f2',
        type: PettyCashTxnType.CONVERSION_OUT,
        amount: dec(50),
        varianceVsOfficial: dec(-0.2),
        createdAt: new Date('2026-08-02T00:00:00Z'),
      },
    ]);

    const report = await service.conversionsReport();

    // Only POSTED conversion legs are queried.
    expect(prisma.pettyCashTxn.findMany.mock.calls[0][0].where).toMatchObject({
      status: PettyCashTxnStatus.POSTED,
      type: { in: [PettyCashTxnType.CONVERSION_OUT, PettyCashTxnType.CONVERSION_IN] },
    });

    const s1 = report.rows.find((r) => r.siteId === 's1' && r.period === '2026-07');
    // varianceSum = 0.5 (out) + 0.5 (in) = 1.0; conversions counted once (per OUT leg).
    expect(s1?.varianceSum).toBeCloseTo(1.0);
    expect(s1?.conversions).toBe(1);
    // gainLoss from OUT leg only = 0.5 * 100 = 50.
    expect(s1?.gainLoss).toBeCloseTo(50);

    const s2 = report.rows.find((r) => r.siteId === 's2' && r.period === '2026-08');
    expect(s2?.gainLoss).toBeCloseTo(-10); // -0.2 * 50

    const perS1 = report.perSite.find((p) => p.siteId === 's1');
    expect(perS1?.gainLoss).toBeCloseTo(50);
  });

  it('returns empty when the site has no floats', async () => {
    const { service, prisma } = makeService();
    prisma.pettyCashFloat.findMany.mockResolvedValue([]);
    const report = await service.conversionsReport('nope');
    expect(report).toEqual({ rows: [], perSite: [] });
    expect(prisma.pettyCashTxn.findMany).not.toHaveBeenCalled();
  });
});
