import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { StatusTransitionRegistry } from '../../approvals/status-transition.registry';
import { RequisitionsService, RequisitionStatus } from './requisitions.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

function makeService() {
  const prisma = {
    requisition: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    order: { findUnique: jest.fn() },
    account: { findUnique: jest.fn() },
    userSiteRole: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = { record: jest.fn() };
  const notifications = { send: jest.fn() };
  const approvals = { submit: jest.fn().mockResolvedValue({ id: 'chain1' }) };
  const transitions = new StatusTransitionRegistry();
  const ledger = { cashPosition: jest.fn(), post: jest.fn().mockResolvedValue([]) };

  const service = new RequisitionsService(
    prisma as any,
    audit as any,
    notifications as any,
    approvals as any,
    transitions,
    ledger as any,
  );
  service.onModuleInit();
  return { service, prisma, audit, notifications, approvals, transitions, ledger };
}

describe('RequisitionsService.submit', () => {
  it('sets SUBMITTED and routes the subject to the approval engine (merit-only)', async () => {
    const { service, prisma, approvals } = makeService();
    prisma.requisition.findUnique.mockResolvedValue({
      id: 'r1',
      requesterId: 'u1',
      status: RequisitionStatus.DRAFT,
      amount: dec(1500),
      currency: 'USD',
      siteId: 's1',
    });
    prisma.requisition.update.mockResolvedValue({ id: 'r1', status: RequisitionStatus.SUBMITTED });

    await service.submit('r1', 'u1');

    expect(prisma.requisition.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUBMITTED' }) }),
    );
    expect(approvals.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'requisition',
        subjectTable: 'requisitions',
        subjectId: 'r1',
        currency: 'USD',
        siteId: 's1',
        requesterId: 'u1',
      }),
    );
  });

  it('forbids a non-requester from submitting', async () => {
    const { service, prisma } = makeService();
    prisma.requisition.findUnique.mockResolvedValue({
      id: 'r1',
      requesterId: 'u1',
      status: RequisitionStatus.DRAFT,
    });
    await expect(service.submit('r1', 'someone-else')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects submitting from a non-draft/returned status', async () => {
    const { service, prisma } = makeService();
    prisma.requisition.findUnique.mockResolvedValue({
      id: 'r1',
      requesterId: 'u1',
      status: RequisitionStatus.APPROVED_READY_TO_PAY,
    });
    await expect(service.submit('r1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('RequisitionsService funds check (via APPROVED transition)', () => {
  it('sets APPROVED_READY_TO_PAY and notifies Finance when a suitable account has funds', async () => {
    const { prisma, notifications, ledger, transitions } = makeService();
    prisma.requisition.findUnique.mockResolvedValue({
      id: 'r1',
      requesterId: 'u1',
      status: RequisitionStatus.SUBMITTED,
      amount: dec(1000),
      currency: 'USD',
    });
    ledger.cashPosition.mockResolvedValue({
      accounts: [{ accountId: 'a1', name: 'Bank', type: 'BANK', currency: 'USD', balance: 5000 }],
      totals: { USD: 5000, ZWG: 0 },
    });

    await transitions.fire('requisitions', 'r1', ApprovalStatus.APPROVED);

    expect(prisma.requisition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RequisitionStatus.APPROVED_READY_TO_PAY,
          shortfall: null,
        }),
      }),
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'requisition.ready_to_pay' }),
    );
  });

  it('sets APPROVED_PENDING_FUNDS with a shortfall and notifies requester + Finance when short', async () => {
    const { prisma, notifications, ledger, transitions } = makeService();
    prisma.requisition.findUnique.mockResolvedValue({
      id: 'r1',
      requesterId: 'u1',
      status: RequisitionStatus.SUBMITTED,
      amount: dec(1000),
      currency: 'USD',
    });
    ledger.cashPosition.mockResolvedValue({
      accounts: [{ accountId: 'a1', name: 'Bank', type: 'BANK', currency: 'USD', balance: 400 }],
      totals: { USD: 400, ZWG: 0 },
    });

    await transitions.fire('requisitions', 'r1', ApprovalStatus.APPROVED);

    const call = prisma.requisition.update.mock.calls[0][0];
    expect(call.data.status).toBe(RequisitionStatus.APPROVED_PENDING_FUNDS);
    // shortfall = 1000 - 400 = 600
    expect(new Prisma.Decimal(call.data.shortfall).toNumber()).toBe(600);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'requisition.pending_funds',
        payload: expect.objectContaining({ shortfall: 600 }),
      }),
    );
  });

  it('mirrors REJECTED onto the requisition', async () => {
    const { prisma, transitions } = makeService();
    prisma.requisition.findUnique.mockResolvedValue({
      id: 'r1',
      status: RequisitionStatus.SUBMITTED,
      requesterId: 'u1',
    });
    await transitions.fire('requisitions', 'r1', ApprovalStatus.REJECTED);
    expect(prisma.requisition.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: RequisitionStatus.REJECTED } }),
    );
  });
});

describe('RequisitionsService.disburse', () => {
  it('posts a debit to the source account and closes the requisition', async () => {
    const { service, prisma, ledger } = makeService();
    prisma.requisition.findUnique.mockResolvedValue({
      id: 'r1',
      requesterId: 'u1',
      status: RequisitionStatus.APPROVED_READY_TO_PAY,
      amount: dec(1000),
      currency: 'USD',
      purpose: 'Fuel',
    });
    prisma.account.findUnique.mockResolvedValue({ id: 'a1', currency: 'USD' });
    prisma.requisition.update.mockResolvedValue({ id: 'r1', status: RequisitionStatus.CLOSED });

    const res = await service.disburse('r1', 'finance-user', {
      accountId: 'a1',
      reference: 'EFT-1',
    });

    expect(ledger.post).toHaveBeenCalledWith([
      expect.objectContaining({
        accountId: 'a1',
        debit: 1000,
        currency: 'USD',
        sourceTable: 'requisitions',
        sourceId: 'r1',
      }),
    ]);
    expect(prisma.requisition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: RequisitionStatus.CLOSED,
          disbursementAccountId: 'a1',
          disbursementReference: 'EFT-1',
        }),
      }),
    );
    expect(res.status).toBe(RequisitionStatus.CLOSED);
  });

  it('blocks the requester from recording their own disbursement (SoD)', async () => {
    const { service, prisma } = makeService();
    prisma.requisition.findUnique.mockResolvedValue({
      id: 'r1',
      requesterId: 'u1',
      status: RequisitionStatus.APPROVED_READY_TO_PAY,
      amount: dec(1000),
      currency: 'USD',
    });
    await expect(
      service.disburse('r1', 'u1', { accountId: 'a1', reference: 'EFT-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects disbursing from a non-approved status', async () => {
    const { service, prisma } = makeService();
    prisma.requisition.findUnique.mockResolvedValue({
      id: 'r1',
      requesterId: 'u1',
      status: RequisitionStatus.SUBMITTED,
      amount: dec(1000),
      currency: 'USD',
    });
    await expect(
      service.disburse('r1', 'finance-user', { accountId: 'a1', reference: 'EFT-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an account whose currency differs from the requisition', async () => {
    const { service, prisma } = makeService();
    prisma.requisition.findUnique.mockResolvedValue({
      id: 'r1',
      requesterId: 'u1',
      status: RequisitionStatus.APPROVED_READY_TO_PAY,
      amount: dec(1000),
      currency: 'USD',
    });
    prisma.account.findUnique.mockResolvedValue({ id: 'a1', currency: 'ZWG' });
    await expect(
      service.disburse('r1', 'finance-user', { accountId: 'a1', reference: 'EFT-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('RequisitionsService.reTestPendingFunds', () => {
  it('promotes a now-funded pending item to READY_TO_PAY', async () => {
    const { service, prisma, ledger } = makeService();
    prisma.requisition.findMany.mockResolvedValue([
      {
        id: 'r1',
        requesterId: 'u1',
        amount: dec(500),
        currency: 'USD',
        requiredByDate: new Date('2026-08-30'),
      },
    ]);
    ledger.cashPosition.mockResolvedValue({
      accounts: [{ accountId: 'a1', name: 'Bank', type: 'BANK', currency: 'USD', balance: 900 }],
      totals: { USD: 900, ZWG: 0 },
    });

    const res = await service.reTestPendingFunds(new Date('2026-07-19'));
    expect(res.promoted).toEqual(['r1']);
    expect(prisma.requisition.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: RequisitionStatus.APPROVED_READY_TO_PAY }),
      }),
    );
  });

  it('escalates a still-short item within the required-by window', async () => {
    const { service, prisma, notifications, ledger } = makeService();
    prisma.requisition.findMany.mockResolvedValue([
      {
        id: 'r1',
        requesterId: 'u1',
        amount: dec(500),
        currency: 'USD',
        requiredByDate: new Date('2026-07-20'),
      },
    ]);
    ledger.cashPosition.mockResolvedValue({
      accounts: [{ accountId: 'a1', name: 'Bank', type: 'BANK', currency: 'USD', balance: 10 }],
      totals: { USD: 10, ZWG: 0 },
    });

    const res = await service.reTestPendingFunds(new Date('2026-07-19'));
    expect(res.escalated).toEqual(['r1']);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'requisition.pending_funds.escalation',
        severity: 'DANGER',
      }),
    );
  });
});
