import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalStatus, Prisma } from '@prisma/client';
import { StatusTransitionRegistry } from '../../approvals/status-transition.registry';
import {
  DirectorWithdrawalsService,
  DirectorWithdrawalStatus,
} from './director-withdrawals.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

function makeService() {
  const prisma = {
    directorWithdrawal: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    userSiteRole: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = { record: jest.fn() };
  const notifications = { send: jest.fn() };
  const approvals = { submit: jest.fn().mockResolvedValue({ id: 'chain1' }) };
  const transitions = new StatusTransitionRegistry();
  const ledger = { cashPosition: jest.fn(), post: jest.fn().mockResolvedValue([]) };

  const service = new DirectorWithdrawalsService(
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

describe('DirectorWithdrawalsService.create', () => {
  it('raises a DRAFT withdrawal in the raising director name', async () => {
    const { service, prisma } = makeService();
    prisma.directorWithdrawal.create.mockImplementation(async ({ data }: any) => ({
      id: 'w1',
      ...data,
    }));

    const created = await service.create(
      {
        amount: 2500,
        currency: 'USD' as any,
        destinationAccount: 'CBZ ***4471',
        reason: 'Quarterly drawing',
      },
      'dir1',
    );

    const data = prisma.directorWithdrawal.create.mock.calls[0][0].data;
    expect(data.directorUserId).toBe('dir1');
    expect(new Prisma.Decimal(data.amount).toNumber()).toBe(2500);
    expect(data.status).toBe(DirectorWithdrawalStatus.DRAFT);
    expect(created.id).toBe('w1');
  });
});

describe('DirectorWithdrawalsService.submit (co-approval by a SECOND director)', () => {
  it('sets SUBMITTED and routes to the director_withdrawal module with the DIRECTOR chain', async () => {
    const { service, prisma, approvals } = makeService();
    prisma.directorWithdrawal.findUnique.mockResolvedValue({
      id: 'w1',
      directorUserId: 'dir1',
      status: DirectorWithdrawalStatus.DRAFT,
      amount: dec(2500),
      currency: 'USD',
    });
    prisma.directorWithdrawal.update.mockResolvedValue({
      id: 'w1',
      status: DirectorWithdrawalStatus.SUBMITTED,
    });

    await service.submit('w1', 'dir1');

    expect(prisma.directorWithdrawal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUBMITTED' }) }),
    );
    // The chain requesterId is the raising director, so the engine makes self-approval
    // impossible — the approving director is necessarily a SECOND director.
    expect(approvals.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'director_withdrawal',
        subjectTable: 'director_withdrawals',
        subjectId: 'w1',
        amount: dec(2500),
        currency: 'USD',
        requesterId: 'dir1',
      }),
    );
  });

  it('forbids a non-requester from submitting', async () => {
    const { service, prisma } = makeService();
    prisma.directorWithdrawal.findUnique.mockResolvedValue({
      id: 'w1',
      directorUserId: 'dir1',
      status: DirectorWithdrawalStatus.DRAFT,
    });
    await expect(service.submit('w1', 'dir2')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects submitting from a non-draft/returned status', async () => {
    const { service, prisma } = makeService();
    prisma.directorWithdrawal.findUnique.mockResolvedValue({
      id: 'w1',
      directorUserId: 'dir1',
      status: DirectorWithdrawalStatus.POSTED_AWAITING_TRANSFER,
    });
    await expect(service.submit('w1', 'dir1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('DirectorWithdrawalsService ledger posting (via APPROVED transition)', () => {
  it('posts a debit to the ledger IMMEDIATELY on co-approval and sets POSTED_AWAITING_TRANSFER', async () => {
    const { prisma, notifications, ledger, transitions } = makeService();
    prisma.directorWithdrawal.findUnique.mockResolvedValue({
      id: 'w1',
      directorUserId: 'dir1',
      status: DirectorWithdrawalStatus.SUBMITTED,
      amount: dec(2500),
      currency: 'USD',
      reason: 'Quarterly drawing',
      ledgerPostedAt: null,
    });
    ledger.cashPosition.mockResolvedValue({
      accounts: [
        { accountId: 'a1', name: 'Bank USD', type: 'BANK', currency: 'USD', balance: 9000 },
      ],
      totals: { USD: 9000, ZWG: 0 },
    });

    await transitions.fire('director_withdrawals', 'w1', ApprovalStatus.APPROVED);

    // Cash reflected immediately: a DEBIT is posted to the best-funded USD account.
    expect(ledger.post).toHaveBeenCalledWith([
      expect.objectContaining({
        accountId: 'a1',
        debit: 2500,
        currency: 'USD',
        sourceTable: 'director_withdrawals',
        sourceId: 'w1',
      }),
    ]);
    const update = prisma.directorWithdrawal.update.mock.calls[0][0];
    expect(update.data.status).toBe(DirectorWithdrawalStatus.POSTED_AWAITING_TRANSFER);
    expect(update.data.ledgerPostedAt).toBeInstanceOf(Date);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'director_withdrawal.posted' }),
    );
  });

  it('still posts (never blocks) even when funds are short — informational check only', async () => {
    const { prisma, ledger, transitions } = makeService();
    prisma.directorWithdrawal.findUnique.mockResolvedValue({
      id: 'w1',
      directorUserId: 'dir1',
      status: DirectorWithdrawalStatus.SUBMITTED,
      amount: dec(10000),
      currency: 'USD',
      reason: 'Big drawing',
      ledgerPostedAt: null,
    });
    ledger.cashPosition.mockResolvedValue({
      accounts: [
        { accountId: 'a1', name: 'Bank USD', type: 'BANK', currency: 'USD', balance: 100 },
      ],
      totals: { USD: 100, ZWG: 0 },
    });

    await transitions.fire('director_withdrawals', 'w1', ApprovalStatus.APPROVED);

    expect(ledger.post).toHaveBeenCalled();
    expect(prisma.directorWithdrawal.update.mock.calls[0][0].data.status).toBe(
      DirectorWithdrawalStatus.POSTED_AWAITING_TRANSFER,
    );
  });

  it('does not double-post when already posted (idempotent)', async () => {
    const { prisma, ledger, transitions } = makeService();
    prisma.directorWithdrawal.findUnique.mockResolvedValue({
      id: 'w1',
      directorUserId: 'dir1',
      status: DirectorWithdrawalStatus.POSTED_AWAITING_TRANSFER,
      amount: dec(2500),
      currency: 'USD',
      ledgerPostedAt: new Date('2026-07-10'),
    });

    await transitions.fire('director_withdrawals', 'w1', ApprovalStatus.APPROVED);

    expect(ledger.post).not.toHaveBeenCalled();
    expect(prisma.directorWithdrawal.update).not.toHaveBeenCalled();
  });

  it('mirrors REJECTED onto the withdrawal', async () => {
    const { prisma, transitions } = makeService();
    prisma.directorWithdrawal.findUnique.mockResolvedValue({
      id: 'w1',
      directorUserId: 'dir1',
      status: DirectorWithdrawalStatus.SUBMITTED,
    });
    await transitions.fire('director_withdrawals', 'w1', ApprovalStatus.REJECTED);
    expect(prisma.directorWithdrawal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: DirectorWithdrawalStatus.REJECTED } }),
    );
  });
});

describe('DirectorWithdrawalsService.complete', () => {
  it('records method + reference and closes to COMPLETED when completer != requester', async () => {
    const { service, prisma } = makeService();
    prisma.directorWithdrawal.findUnique.mockResolvedValue({
      id: 'w1',
      directorUserId: 'dir1',
      status: DirectorWithdrawalStatus.POSTED_AWAITING_TRANSFER,
      amount: dec(2500),
      currency: 'USD',
    });
    prisma.directorWithdrawal.update.mockResolvedValue({
      id: 'w1',
      status: DirectorWithdrawalStatus.COMPLETED,
    });

    const res = await service.complete('w1', 'dir2', {
      transferMethod: 'EFT',
      transferReference: 'EFT-99182',
    });

    const data = prisma.directorWithdrawal.update.mock.calls[0][0].data;
    expect(data.status).toBe(DirectorWithdrawalStatus.COMPLETED);
    expect(data.transferMethod).toBe('EFT');
    expect(data.transferReference).toBe('EFT-99182');
    expect(data.completedByUserId).toBe('dir2');
    expect(data.completedAt).toBeInstanceOf(Date);
    expect(res.status).toBe(DirectorWithdrawalStatus.COMPLETED);
  });

  it('blocks the raising director from recording their own transfer (SoD)', async () => {
    const { service, prisma } = makeService();
    prisma.directorWithdrawal.findUnique.mockResolvedValue({
      id: 'w1',
      directorUserId: 'dir1',
      status: DirectorWithdrawalStatus.POSTED_AWAITING_TRANSFER,
      amount: dec(2500),
      currency: 'USD',
    });
    await expect(
      service.complete('w1', 'dir1', { transferMethod: 'EFT', transferReference: 'EFT-1' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects completing from a non-posted status', async () => {
    const { service, prisma } = makeService();
    prisma.directorWithdrawal.findUnique.mockResolvedValue({
      id: 'w1',
      directorUserId: 'dir1',
      status: DirectorWithdrawalStatus.SUBMITTED,
    });
    await expect(
      service.complete('w1', 'dir2', { transferMethod: 'EFT', transferReference: 'EFT-1' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('DirectorWithdrawalsService.listStalePosted / nudgeStalePosted', () => {
  it('lists posted withdrawals whose ledger post is older than the stale window', async () => {
    const { service, prisma } = makeService();
    prisma.directorWithdrawal.findMany.mockResolvedValue([{ id: 'w1' }]);

    await service.listStalePosted(new Date('2026-07-19'));

    const where = prisma.directorWithdrawal.findMany.mock.calls[0][0].where;
    expect(where.status).toBe(DirectorWithdrawalStatus.POSTED_AWAITING_TRANSFER);
    // cutoff = 2026-07-19 minus 3 days = 2026-07-16
    expect(where.ledgerPostedAt.lt).toEqual(new Date('2026-07-16'));
  });

  it('nudges directors for each stale posted withdrawal', async () => {
    const { service, prisma, notifications } = makeService();
    prisma.directorWithdrawal.findMany.mockResolvedValue([
      {
        id: 'w1',
        directorUserId: 'dir1',
        amount: dec(2500),
        currency: 'USD',
        ledgerPostedAt: new Date('2026-07-01'),
      },
    ]);
    prisma.userSiteRole.findMany.mockResolvedValue([{ userId: 'dir2' }]);

    const res = await service.nudgeStalePosted(new Date('2026-07-19'));

    expect(res.nudged).toEqual(['w1']);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'director_withdrawal.stale.reminder',
        userIds: expect.arrayContaining(['dir1', 'dir2']),
      }),
    );
  });
});
