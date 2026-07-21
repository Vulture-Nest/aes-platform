import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalDecision, ApprovalMode, ApprovalStatus, Prisma } from '@prisma/client';
import { ApprovalService } from './approval.service';
import { StatusTransitionRegistry } from './status-transition.registry';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Minimal Decimal helper matching what Prisma returns for @db.Decimal columns.
const dec = (n: number) => new Prisma.Decimal(n);

function makeService() {
  const prisma = {
    approvalMatrix: { findMany: jest.fn() },
    approvalChain: { create: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
    approval: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    userSiteRole: { findMany: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    rlsTx: jest.fn().mockImplementation((cb: any) => cb(prisma)),
  };
  const audit = { record: jest.fn() };
  const notifications = { send: jest.fn() };
  const delegation = { activeDelegateFor: jest.fn().mockResolvedValue(null) };
  const transitions = new StatusTransitionRegistry();
  const service = new ApprovalService(
    prisma as any,
    audit as any,
    notifications as any,
    delegation as any,
    transitions,
  );
  return { service, prisma, audit, notifications, delegation, transitions };
}

describe('ApprovalService.submit — matrix routing', () => {
  it('selects only steps whose amount band contains the amount', async () => {
    const { service, prisma } = makeService();
    prisma.approvalMatrix.findMany.mockResolvedValue([
      {
        id: 'm1',
        stepOrder: 1,
        approverRole: 'SITE_MANAGER',
        mode: ApprovalMode.SEQUENTIAL,
        minAmount: dec(0),
        maxAmount: dec(1000),
      },
      {
        id: 'm2',
        stepOrder: 2,
        approverRole: 'FINANCE_OFFICER',
        mode: ApprovalMode.SEQUENTIAL,
        minAmount: dec(0),
        maxAmount: dec(1000),
      },
      // Out of band — should be excluded for a 500 amount.
      {
        id: 'm3',
        stepOrder: 3,
        approverRole: 'FINANCE_DIRECTOR',
        mode: ApprovalMode.SEQUENTIAL,
        minAmount: dec(1001),
        maxAmount: dec(100000),
      },
    ]);
    prisma.approvalChain.create.mockResolvedValue({
      id: 'c1',
      module: 'requisition',
      subjectTable: 'requisitions',
      subjectId: 's1',
      requesterId: 'req',
      siteId: null,
      steps: [
        { id: 'a1', step: 1, approverRole: 'SITE_MANAGER' },
        { id: 'a2', step: 2, approverRole: 'FINANCE_OFFICER' },
      ],
    });
    prisma.userSiteRole.findMany.mockResolvedValue([]);

    await service.submit({
      module: 'requisition',
      subjectTable: 'requisitions',
      subjectId: 's1',
      amount: 500,
      requesterId: 'req',
    });

    const created = prisma.approvalChain.create.mock.calls[0][0];
    const createdSteps = created.data.steps.create;
    expect(createdSteps).toHaveLength(2);
    expect(createdSteps.map((s: any) => s.approverRole)).toEqual([
      'SITE_MANAGER',
      'FINANCE_OFFICER',
    ]);
    // Chain starts at the first step order.
    expect(created.data.currentStep).toBe(1);
  });

  it('routes a high amount to the higher-band approver', async () => {
    const { service, prisma } = makeService();
    prisma.approvalMatrix.findMany.mockResolvedValue([
      {
        id: 'm1',
        stepOrder: 1,
        approverRole: 'SITE_MANAGER',
        mode: ApprovalMode.SEQUENTIAL,
        minAmount: dec(0),
        maxAmount: dec(1000),
      },
      {
        id: 'm3',
        stepOrder: 3,
        approverRole: 'FINANCE_DIRECTOR',
        mode: ApprovalMode.SEQUENTIAL,
        minAmount: dec(1001),
        maxAmount: dec(100000),
      },
    ]);
    prisma.approvalChain.create.mockResolvedValue({
      id: 'c1',
      requesterId: 'req',
      siteId: null,
      steps: [],
    });
    prisma.userSiteRole.findMany.mockResolvedValue([]);

    await service.submit({
      module: 'requisition',
      subjectTable: 'requisitions',
      subjectId: 's1',
      amount: 5000,
      requesterId: 'req',
    });

    const createdSteps = prisma.approvalChain.create.mock.calls[0][0].data.steps.create;
    expect(createdSteps.map((s: any) => s.approverRole)).toEqual(['FINANCE_DIRECTOR']);
  });

  it('throws when no matrix rows match', async () => {
    const { service, prisma } = makeService();
    prisma.approvalMatrix.findMany.mockResolvedValue([]);
    await expect(
      service.submit({
        module: 'requisition',
        subjectTable: 'requisitions',
        subjectId: 's1',
        amount: 500,
        requesterId: 'req',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ApprovalService.decide — hard rules', () => {
  it('blocks self-approval with ForbiddenException', async () => {
    const { service, prisma } = makeService();
    prisma.approval.findUnique.mockResolvedValue({
      id: 'a1',
      step: 1,
      decision: null,
      chain: {
        id: 'c1',
        status: ApprovalStatus.PENDING,
        currentStep: 1,
        requesterId: 'same-user',
        steps: [],
      },
    });
    await expect(
      service.decide({
        approvalId: 'a1',
        approverUserId: 'same-user',
        decision: ApprovalDecision.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.approval.update).not.toHaveBeenCalled();
  });

  it('rejects a decision on an already-decided step', async () => {
    const { service, prisma } = makeService();
    prisma.approval.findUnique.mockResolvedValue({
      id: 'a1',
      step: 1,
      decision: ApprovalDecision.APPROVED,
      chain: {
        id: 'c1',
        status: ApprovalStatus.PENDING,
        currentStep: 1,
        requesterId: 'req',
        steps: [],
      },
    });
    await expect(
      service.decide({
        approvalId: 'a1',
        approverUserId: 'other',
        decision: ApprovalDecision.APPROVED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a decision on a closed chain', async () => {
    const { service, prisma } = makeService();
    prisma.approval.findUnique.mockResolvedValue({
      id: 'a1',
      step: 1,
      decision: null,
      chain: {
        id: 'c1',
        status: ApprovalStatus.APPROVED,
        currentStep: 1,
        requesterId: 'req',
        steps: [],
      },
    });
    await expect(
      service.decide({
        approvalId: 'a1',
        approverUserId: 'other',
        decision: ApprovalDecision.APPROVED,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('ApprovalService.decide — advancement modes', () => {
  const chainBase = {
    id: 'c1',
    module: 'requisition',
    subjectTable: 'requisitions',
    subjectId: 's1',
    requesterId: 'req',
    siteId: null,
    status: ApprovalStatus.PENDING,
  };

  it('SEQUENTIAL: single approval advances to the next step, not APPROVED', async () => {
    const { service, prisma } = makeService();
    const steps = [
      {
        id: 'a1',
        chainId: 'c1',
        step: 1,
        approverRole: 'SITE_MANAGER',
        mode: ApprovalMode.SEQUENTIAL,
        decision: null,
      },
      {
        id: 'a2',
        chainId: 'c1',
        step: 2,
        approverRole: 'FINANCE_OFFICER',
        mode: ApprovalMode.SEQUENTIAL,
        decision: null,
      },
    ];
    prisma.approval.findUnique.mockResolvedValue({
      ...steps[0],
      chain: { ...chainBase, currentStep: 1, steps },
    });
    prisma.approval.update.mockResolvedValue({ ...steps[0], decision: ApprovalDecision.APPROVED });
    prisma.approvalChain.update.mockResolvedValue({});
    prisma.approvalChain.findUnique.mockResolvedValue({ ...chainBase, currentStep: 2, steps });
    prisma.userSiteRole.findMany.mockResolvedValue([]);

    await service.decide({
      approvalId: 'a1',
      approverUserId: 'mgr',
      decision: ApprovalDecision.APPROVED,
    });

    // currentStep advanced to 2; chain not closed.
    expect(prisma.approvalChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { currentStep: 2 } }),
    );
  });

  it('EITHER: one approval in the step order satisfies and closes when last', async () => {
    const { service, prisma, transitions } = makeService();
    const steps = [
      {
        id: 'a1',
        chainId: 'c1',
        step: 1,
        approverRole: 'FINANCE_OFFICER',
        mode: ApprovalMode.EITHER,
        decision: null,
      },
      {
        id: 'a2',
        chainId: 'c1',
        step: 1,
        approverRole: 'FINANCE_DIRECTOR',
        mode: ApprovalMode.EITHER,
        decision: null,
      },
    ];
    prisma.approval.findUnique.mockResolvedValue({
      ...steps[0],
      chain: { ...chainBase, currentStep: 1, steps },
    });
    prisma.approval.update.mockResolvedValue({ ...steps[0], decision: ApprovalDecision.APPROVED });
    prisma.approvalChain.update.mockResolvedValue({});
    prisma.approvalChain.findUnique.mockResolvedValue({
      ...chainBase,
      status: ApprovalStatus.APPROVED,
      currentStep: 1,
      steps: [{ ...steps[0], decision: ApprovalDecision.APPROVED }, steps[1]],
    });

    const fired: string[] = [];
    transitions.registerTransition('requisitions', (_id, status) => {
      fired.push(status);
    });

    await service.decide({
      approvalId: 'a1',
      approverUserId: 'fo',
      decision: ApprovalDecision.APPROVED,
    });

    expect(prisma.approvalChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: ApprovalStatus.APPROVED } }),
    );
    expect(fired).toEqual([ApprovalStatus.APPROVED]);
  });

  it('PARALLEL: chain stays PENDING until every approver in the step order approves', async () => {
    const { service, prisma } = makeService();
    const steps = [
      {
        id: 'a1',
        chainId: 'c1',
        step: 1,
        approverRole: 'FINANCE_OFFICER',
        mode: ApprovalMode.PARALLEL,
        decision: null,
      },
      {
        id: 'a2',
        chainId: 'c1',
        step: 1,
        approverRole: 'OPS_STAFF',
        mode: ApprovalMode.PARALLEL,
        decision: null,
      },
    ];
    prisma.approval.findUnique.mockResolvedValue({
      ...steps[0],
      chain: { ...chainBase, currentStep: 1, steps },
    });
    prisma.approval.update.mockResolvedValue({ ...steps[0], decision: ApprovalDecision.APPROVED });
    prisma.approvalChain.findUnique.mockResolvedValue({ ...chainBase, currentStep: 1, steps });

    await service.decide({
      approvalId: 'a1',
      approverUserId: 'fo',
      decision: ApprovalDecision.APPROVED,
    });

    // Only one of two parallel approvers acted → no status/step change.
    expect(prisma.approvalChain.update).not.toHaveBeenCalled();
  });

  it('PARALLEL: closes APPROVED once the second approver approves', async () => {
    const { service, prisma } = makeService();
    const steps = [
      {
        id: 'a1',
        chainId: 'c1',
        step: 1,
        approverRole: 'FINANCE_OFFICER',
        mode: ApprovalMode.PARALLEL,
        decision: ApprovalDecision.APPROVED,
      },
      {
        id: 'a2',
        chainId: 'c1',
        step: 1,
        approverRole: 'OPS_STAFF',
        mode: ApprovalMode.PARALLEL,
        decision: null,
      },
    ];
    prisma.approval.findUnique.mockResolvedValue({
      ...steps[1],
      chain: { ...chainBase, currentStep: 1, steps },
    });
    prisma.approval.update.mockResolvedValue({ ...steps[1], decision: ApprovalDecision.APPROVED });
    prisma.approvalChain.update.mockResolvedValue({});
    prisma.approvalChain.findUnique.mockResolvedValue({
      ...chainBase,
      status: ApprovalStatus.APPROVED,
      currentStep: 1,
      steps,
    });

    await service.decide({
      approvalId: 'a2',
      approverUserId: 'ops',
      decision: ApprovalDecision.APPROVED,
    });

    expect(prisma.approvalChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: ApprovalStatus.APPROVED } }),
    );
  });
});

describe('ApprovalService.decide — reject and return', () => {
  const chainBase = {
    id: 'c1',
    module: 'requisition',
    subjectTable: 'requisitions',
    subjectId: 's1',
    requesterId: 'req',
    siteId: null,
    status: ApprovalStatus.PENDING,
  };

  it('REJECTED closes the chain', async () => {
    const { service, prisma, notifications } = makeService();
    const steps = [
      {
        id: 'a1',
        chainId: 'c1',
        step: 1,
        approverRole: 'SITE_MANAGER',
        mode: ApprovalMode.SEQUENTIAL,
        decision: null,
      },
      {
        id: 'a2',
        chainId: 'c1',
        step: 2,
        approverRole: 'FINANCE_OFFICER',
        mode: ApprovalMode.SEQUENTIAL,
        decision: null,
      },
    ];
    prisma.approval.findUnique.mockResolvedValue({
      ...steps[0],
      chain: { ...chainBase, currentStep: 1, steps },
    });
    prisma.approval.update.mockResolvedValue({ ...steps[0], decision: ApprovalDecision.REJECTED });
    prisma.approvalChain.update.mockResolvedValue({});
    prisma.approvalChain.findUnique.mockResolvedValue({
      ...chainBase,
      status: ApprovalStatus.REJECTED,
      currentStep: 1,
      steps,
    });

    await service.decide({
      approvalId: 'a1',
      approverUserId: 'mgr',
      decision: ApprovalDecision.REJECTED,
    });

    expect(prisma.approvalChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: ApprovalStatus.REJECTED } }),
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ userIds: ['req'], template: 'approval.rejected' }),
    );
  });

  it('RETURNED sets status RETURNED and clears remaining decisions', async () => {
    const { service, prisma } = makeService();
    const steps = [
      {
        id: 'a1',
        chainId: 'c1',
        step: 1,
        approverRole: 'SITE_MANAGER',
        mode: ApprovalMode.SEQUENTIAL,
        decision: null,
      },
      {
        id: 'a2',
        chainId: 'c1',
        step: 2,
        approverRole: 'FINANCE_OFFICER',
        mode: ApprovalMode.SEQUENTIAL,
        decision: null,
      },
    ];
    prisma.approval.findUnique.mockResolvedValue({
      ...steps[0],
      chain: { ...chainBase, currentStep: 1, steps },
    });
    prisma.approval.update.mockResolvedValue({ ...steps[0], decision: ApprovalDecision.RETURNED });
    prisma.approvalChain.update.mockResolvedValue({});
    prisma.approval.updateMany.mockResolvedValue({ count: 1 });
    prisma.approvalChain.findUnique.mockResolvedValue({
      ...chainBase,
      status: ApprovalStatus.RETURNED,
      currentStep: 1,
      steps,
    });

    await service.decide({
      approvalId: 'a1',
      approverUserId: 'mgr',
      decision: ApprovalDecision.RETURNED,
    });

    // Chain reset to RETURNED at step 1.
    expect(prisma.approvalChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: ApprovalStatus.RETURNED, currentStep: 1 } }),
    );
    // Remaining undecided decisions cleared.
    expect(prisma.approval.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { chainId: 'c1', decision: null } }),
    );
  });
});

describe('ApprovalService.inbox', () => {
  it('returns only active-step PENDING items for a role the user holds, excluding own requests', async () => {
    const { service, prisma } = makeService();
    prisma.approval.findMany.mockResolvedValue([
      // active step, user's role, not requester → included
      {
        id: 'a1',
        step: 1,
        approverRole: 'FINANCE_OFFICER',
        chain: { currentStep: 1, requesterId: 'someone' },
      },
      // not the active step → excluded
      {
        id: 'a2',
        step: 2,
        approverRole: 'FINANCE_OFFICER',
        chain: { currentStep: 1, requesterId: 'someone' },
      },
      // user is the requester → excluded (cannot self-approve)
      {
        id: 'a3',
        step: 1,
        approverRole: 'FINANCE_OFFICER',
        chain: { currentStep: 1, requesterId: 'me' },
      },
    ]);

    const result = await service.inbox({ id: 'me', roles: ['FINANCE_OFFICER'] });
    expect(result.map((r) => r.id)).toEqual(['a1']);
  });

  it('returns an empty list for a user with no roles', async () => {
    const { service, prisma } = makeService();
    const result = await service.inbox({ id: 'me', roles: [] });
    expect(result).toEqual([]);
    expect(prisma.approval.findMany).not.toHaveBeenCalled();
  });
});
