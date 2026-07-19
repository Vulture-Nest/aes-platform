import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { StatusTransitionRegistry } from '../../approvals/status-transition.registry';
import { TravelService, TravelStatus } from './travel.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

function makeService() {
  const prisma = {
    travelRequest: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    account: { findUnique: jest.fn() },
    userSiteRole: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = { record: jest.fn() };
  const notifications = { send: jest.fn() };
  const approvals = { submit: jest.fn().mockResolvedValue({ id: 'chain1' }) };
  const transitions = new StatusTransitionRegistry();
  const ledger = { cashPosition: jest.fn(), post: jest.fn().mockResolvedValue([]) };
  const rates = { rateFor: jest.fn(), create: jest.fn(), list: jest.fn() };
  const lookups = { assertValid: jest.fn().mockResolvedValue(undefined) };

  const service = new TravelService(
    prisma as any,
    audit as any,
    notifications as any,
    approvals as any,
    transitions,
    ledger as any,
    rates as any,
    lookups as any,
  );
  service.onModuleInit();
  return { service, prisma, audit, notifications, approvals, transitions, ledger, rates };
}

describe('TravelService.create (per-diem computation)', () => {
  it('computes perDiem from the rate table and advanceAmount = dailyRate * days', async () => {
    const { service, prisma, rates } = makeService();
    rates.rateFor.mockResolvedValue({ dailyRate: dec(85) });
    prisma.travelRequest.create.mockImplementation(async ({ data }: any) => ({
      id: 't1',
      ...data,
    }));

    const created = await service.create(
      {
        destination: 'Bulawayo',
        destinationClass: 'A',
        grade: 'M3',
        dateFrom: new Date('2026-08-01'),
        dateTo: new Date('2026-08-05'),
        days: 5,
        currency: 'USD' as any,
      },
      'u1',
    );

    // Rate looked up for the trip start date, grade and class.
    expect(rates.rateFor).toHaveBeenCalledWith('M3', 'A', 'USD', new Date('2026-08-01'));
    const data = prisma.travelRequest.create.mock.calls[0][0].data;
    expect(new Prisma.Decimal(data.perDiem).toNumber()).toBe(85);
    // advance = 85 * 5 = 425
    expect(new Prisma.Decimal(data.advanceAmount).toNumber()).toBe(425);
    expect(created.status).toBe(TravelStatus.DRAFT);
  });

  it('falls back to DEFAULT grade/class when omitted', async () => {
    const { service, prisma, rates } = makeService();
    rates.rateFor.mockResolvedValue({ dailyRate: dec(50) });
    prisma.travelRequest.create.mockImplementation(async ({ data }: any) => ({
      id: 't1',
      ...data,
    }));

    await service.create(
      {
        destination: 'Harare',
        dateFrom: new Date('2026-08-01'),
        dateTo: new Date('2026-08-03'),
        days: 3,
        currency: 'USD' as any,
      },
      'u1',
    );

    expect(rates.rateFor).toHaveBeenCalledWith('DEFAULT', 'DEFAULT', 'USD', new Date('2026-08-01'));
  });

  it('rejects a trip whose dateTo precedes dateFrom', async () => {
    const { service } = makeService();
    await expect(
      service.create(
        {
          destination: 'X',
          dateFrom: new Date('2026-08-05'),
          dateTo: new Date('2026-08-01'),
          days: 1,
          currency: 'USD' as any,
        },
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TravelService.submit', () => {
  it('sets SUBMITTED and routes the advance to the approval engine (merit-only)', async () => {
    const { service, prisma, approvals } = makeService();
    prisma.travelRequest.findUnique.mockResolvedValue({
      id: 't1',
      requesterId: 'u1',
      status: TravelStatus.DRAFT,
      advanceAmount: dec(425),
      currency: 'USD',
      siteId: 's1',
    });
    prisma.travelRequest.update.mockResolvedValue({ id: 't1', status: TravelStatus.SUBMITTED });

    await service.submit('t1', 'u1');

    expect(prisma.travelRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUBMITTED' }) }),
    );
    expect(approvals.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'travel',
        subjectTable: 'travel_requests',
        subjectId: 't1',
        amount: dec(425),
        currency: 'USD',
        siteId: 's1',
        requesterId: 'u1',
      }),
    );
  });

  it('forbids a non-requester from submitting', async () => {
    const { service, prisma } = makeService();
    prisma.travelRequest.findUnique.mockResolvedValue({
      id: 't1',
      requesterId: 'u1',
      status: TravelStatus.DRAFT,
    });
    await expect(service.submit('t1', 'other')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects submitting from a non-draft/returned status', async () => {
    const { service, prisma } = makeService();
    prisma.travelRequest.findUnique.mockResolvedValue({
      id: 't1',
      requesterId: 'u1',
      status: TravelStatus.DISBURSED,
    });
    await expect(service.submit('t1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TravelService funds check (via APPROVED transition)', () => {
  it('sets APPROVED_READY_TO_PAY and notifies Finance when a suitable account has funds', async () => {
    const { prisma, notifications, ledger, transitions } = makeService();
    prisma.travelRequest.findUnique.mockResolvedValue({
      id: 't1',
      requesterId: 'u1',
      status: TravelStatus.SUBMITTED,
      advanceAmount: dec(425),
      currency: 'USD',
    });
    ledger.cashPosition.mockResolvedValue({
      accounts: [{ accountId: 'a1', name: 'Bank', type: 'BANK', currency: 'USD', balance: 5000 }],
      totals: { USD: 5000, ZWG: 0 },
    });

    await transitions.fire('travel_requests', 't1', ApprovalStatus.APPROVED);

    expect(prisma.travelRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: TravelStatus.APPROVED_READY_TO_PAY,
          shortfall: null,
        }),
      }),
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'travel.ready_to_pay' }),
    );
  });

  it('sets APPROVED_PENDING_FUNDS with a shortfall when short', async () => {
    const { prisma, notifications, ledger, transitions } = makeService();
    prisma.travelRequest.findUnique.mockResolvedValue({
      id: 't1',
      requesterId: 'u1',
      status: TravelStatus.SUBMITTED,
      advanceAmount: dec(1000),
      currency: 'USD',
    });
    ledger.cashPosition.mockResolvedValue({
      accounts: [{ accountId: 'a1', name: 'Bank', type: 'BANK', currency: 'USD', balance: 400 }],
      totals: { USD: 400, ZWG: 0 },
    });

    await transitions.fire('travel_requests', 't1', ApprovalStatus.APPROVED);

    const call = prisma.travelRequest.update.mock.calls[0][0];
    expect(call.data.status).toBe(TravelStatus.APPROVED_PENDING_FUNDS);
    // shortfall = 1000 - 400 = 600
    expect(new Prisma.Decimal(call.data.shortfall).toNumber()).toBe(600);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'travel.pending_funds',
        payload: expect.objectContaining({ shortfall: 600 }),
      }),
    );
  });

  it('mirrors REJECTED onto the travel request', async () => {
    const { prisma, transitions } = makeService();
    prisma.travelRequest.findUnique.mockResolvedValue({
      id: 't1',
      status: TravelStatus.SUBMITTED,
      requesterId: 'u1',
    });
    await transitions.fire('travel_requests', 't1', ApprovalStatus.REJECTED);
    expect(prisma.travelRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: TravelStatus.REJECTED } }),
    );
  });
});

describe('TravelService.disburse', () => {
  it('posts a debit and moves to DISBURSED (not closed — retirement pending)', async () => {
    const { service, prisma, ledger } = makeService();
    prisma.travelRequest.findUnique.mockResolvedValue({
      id: 't1',
      requesterId: 'u1',
      status: TravelStatus.APPROVED_READY_TO_PAY,
      advanceAmount: dec(425),
      currency: 'USD',
      destination: 'Bulawayo',
    });
    prisma.account.findUnique.mockResolvedValue({ id: 'a1', currency: 'USD' });
    prisma.travelRequest.update.mockResolvedValue({ id: 't1', status: TravelStatus.DISBURSED });

    const res = await service.disburse('t1', 'finance-user', {
      accountId: 'a1',
      reference: 'EFT-1',
    });

    expect(ledger.post).toHaveBeenCalledWith([
      expect.objectContaining({
        accountId: 'a1',
        debit: 425,
        currency: 'USD',
        sourceTable: 'travel_requests',
        sourceId: 't1',
      }),
    ]);
    expect(prisma.travelRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: TravelStatus.DISBURSED }),
      }),
    );
    expect(res.status).toBe(TravelStatus.DISBURSED);
  });

  it('blocks the requester from recording their own disbursement (SoD)', async () => {
    const { service, prisma } = makeService();
    prisma.travelRequest.findUnique.mockResolvedValue({
      id: 't1',
      requesterId: 'u1',
      status: TravelStatus.APPROVED_READY_TO_PAY,
      advanceAmount: dec(425),
      currency: 'USD',
    });
    await expect(
      service.disburse('t1', 'u1', { accountId: 'a1', reference: 'EFT-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('TravelService.retire (reconciliation)', () => {
  it('records refundDue and credits the source account back when there is unspent cash', async () => {
    const { service, prisma, ledger } = makeService();
    prisma.travelRequest.findUnique.mockResolvedValue({
      id: 't1',
      requesterId: 'u1',
      status: TravelStatus.DISBURSED,
      advanceAmount: dec(425),
      currency: 'USD',
      destination: 'Bulawayo',
      disbursementAccountId: 'a1',
    });
    prisma.travelRequest.update.mockResolvedValue({ id: 't1', status: TravelStatus.CLOSED });

    await service.retire('t1', 'finance-user', { receiptsKey: 'receipts/t1.zip', unspent: 120 });

    // Refund cash flows back INTO the source account as a CREDIT.
    expect(ledger.post).toHaveBeenCalledWith([
      expect.objectContaining({
        accountId: 'a1',
        credit: 120,
        currency: 'USD',
        sourceTable: 'travel_requests',
        sourceId: 't1',
      }),
    ]);
    const data = prisma.travelRequest.update.mock.calls[0][0].data;
    expect(data.status).toBe(TravelStatus.CLOSED);
    expect(new Prisma.Decimal(data.refundDue).toNumber()).toBe(120);
    expect(new Prisma.Decimal(data.refundOwed).toNumber()).toBe(0);
    expect(data.retirementReceiptsKey).toBe('receipts/t1.zip');
  });

  it('closes with zero refunds and no ledger post when fully reconciled (unspent = 0)', async () => {
    const { service, prisma, ledger } = makeService();
    prisma.travelRequest.findUnique.mockResolvedValue({
      id: 't1',
      requesterId: 'u1',
      status: TravelStatus.DISBURSED,
      advanceAmount: dec(425),
      currency: 'USD',
      destination: 'Bulawayo',
      disbursementAccountId: 'a1',
    });
    prisma.travelRequest.update.mockResolvedValue({ id: 't1', status: TravelStatus.CLOSED });

    await service.retire('t1', 'finance-user', { receiptsKey: 'r.zip', unspent: 0 });

    expect(ledger.post).not.toHaveBeenCalled();
    const data = prisma.travelRequest.update.mock.calls[0][0].data;
    expect(new Prisma.Decimal(data.refundDue).toNumber()).toBe(0);
  });

  it('rejects retiring from a non-disbursed status', async () => {
    const { service, prisma } = makeService();
    prisma.travelRequest.findUnique.mockResolvedValue({
      id: 't1',
      requesterId: 'u1',
      status: TravelStatus.APPROVED_READY_TO_PAY,
      advanceAmount: dec(425),
      currency: 'USD',
    });
    await expect(
      service.retire('t1', 'finance-user', { receiptsKey: 'r.zip', unspent: 0 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects unspent greater than the advance', async () => {
    const { service, prisma } = makeService();
    prisma.travelRequest.findUnique.mockResolvedValue({
      id: 't1',
      requesterId: 'u1',
      status: TravelStatus.DISBURSED,
      advanceAmount: dec(425),
      currency: 'USD',
      disbursementAccountId: 'a1',
    });
    await expect(
      service.retire('t1', 'finance-user', { receiptsKey: 'r.zip', unspent: 999 }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TravelService.listUnretired / remindUnretired', () => {
  it('lists disbursed advances whose trip ended over the reminder window ago', async () => {
    const { service, prisma } = makeService();
    prisma.travelRequest.findMany.mockResolvedValue([{ id: 't1' }]);

    await service.listUnretired(new Date('2026-07-19'));

    const where = prisma.travelRequest.findMany.mock.calls[0][0].where;
    expect(where.status).toBe(TravelStatus.DISBURSED);
    // cutoff = 2026-07-19 minus 7 days = 2026-07-12
    expect(where.dateTo.lt).toEqual(new Date('2026-07-12'));
  });

  it('reminds requester + FD for each overdue un-retired advance', async () => {
    const { service, prisma, notifications } = makeService();
    prisma.travelRequest.findMany.mockResolvedValue([
      { id: 't1', requesterId: 'u1', destination: 'Bulawayo', dateTo: new Date('2026-07-01') },
    ]);
    prisma.userSiteRole.findMany.mockResolvedValue([{ userId: 'fd1' }]);

    const res = await service.remindUnretired(new Date('2026-07-19'));

    expect(res.reminded).toEqual(['t1']);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'travel.unretired.reminder',
        userIds: expect.arrayContaining(['u1', 'fd1']),
      }),
    );
  });
});
