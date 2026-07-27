import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ApprovalDecision, ApprovalMode, ApprovalStatus, Prisma } from '@prisma/client';
import { ApprovalService, canDecideStep } from './approval.service';
import { StatusTransitionRegistry } from './status-transition.registry';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Minimal Decimal helper matching what Prisma returns for @db.Decimal columns.
const dec = (n: number) => new Prisma.Decimal(n);

// Convenience: a single global RBAC assignment for the given role.
const roleGrant = (role: string, siteId: string | null = null) => [{ siteId, role }];

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
    userSiteRole: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
    rlsTx: jest.fn().mockImplementation((cb: any) => cb(prisma)),
  };
  const audit = { record: jest.fn() };
  const notifications = { send: jest.fn() };
  const delegation = {
    activeDelegateFor: jest.fn().mockResolvedValue(null),
    activeDelegatorsFor: jest.fn().mockResolvedValue([]),
    activeDelegatesForMany: jest.fn().mockResolvedValue([]),
  };
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
        approverRoles: roleGrant('SITE_MANAGER'),
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
        approverRoles: roleGrant('SITE_MANAGER'),
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
        approverRoles: roleGrant('SITE_MANAGER'),
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
      approverRoles: roleGrant('SITE_MANAGER'),
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
      approverRoles: roleGrant('FINANCE_OFFICER'),
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
      approverRoles: roleGrant('FINANCE_OFFICER'),
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
      approverRoles: roleGrant('OPS_STAFF'),
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
      approverRoles: roleGrant('SITE_MANAGER'),
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
      approverRoles: roleGrant('SITE_MANAGER'),
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

  // --- G5: delegation surfaces the delegator's items to the stand-in ------------------
  it('surfaces a delegator role-holder’s pending item to the active delegate', async () => {
    const { service, prisma, delegation } = makeService();
    // The caller ("del") holds no approver role of their own, but "boss" delegates to them.
    delegation.activeDelegatorsFor.mockResolvedValue(['boss']);
    prisma.userSiteRole.findMany.mockResolvedValue([{ siteId: null, role: 'FINANCE_DIRECTOR' }]);
    prisma.approval.findMany.mockResolvedValue([
      {
        id: 'a1',
        step: 1,
        approverRole: 'FINANCE_DIRECTOR',
        chain: { currentStep: 1, requesterId: 'someone', siteId: null },
      },
    ]);

    const result = await service.inbox({ id: 'del', roles: [] });
    expect(result.map((r) => r.id)).toEqual(['a1']);
    // The role-set queried included the delegated role.
    expect(prisma.approval.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ approverRole: { in: ['FINANCE_DIRECTOR'] } }),
      }),
    );
  });

  it('does not surface a delegated item when the delegator’s role is scoped to a different site', async () => {
    const { service, prisma, delegation } = makeService();
    delegation.activeDelegatorsFor.mockResolvedValue(['boss']);
    // Delegator holds the role only at site-A.
    prisma.userSiteRole.findMany.mockResolvedValue([
      { siteId: 'site-A', role: 'FINANCE_DIRECTOR' },
    ]);
    prisma.approval.findMany.mockResolvedValue([
      {
        id: 'a1',
        step: 1,
        approverRole: 'FINANCE_DIRECTOR',
        chain: { currentStep: 1, requesterId: 'someone', siteId: 'site-B' },
      },
    ]);

    const result = await service.inbox({ id: 'del', roles: [] });
    expect(result).toEqual([]);
  });

  it('ignores a delegation outside its date window (no delegators returned)', async () => {
    const { service, prisma, delegation } = makeService();
    // Window inactive → the service asks and gets nobody.
    delegation.activeDelegatorsFor.mockResolvedValue([]);
    const result = await service.inbox({ id: 'del', roles: [] });
    expect(result).toEqual([]);
    // No own roles + no delegated roles → never queries steps.
    expect(prisma.approval.findMany).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------------------
// G3: canDecideStep — pure authorisation helper
// -------------------------------------------------------------------------------------
describe('canDecideStep', () => {
  const step = { approverRole: 'FINANCE_OFFICER' };

  it('allows a caller holding the step role (global assignment)', () => {
    expect(canDecideStep(step, { roles: [{ siteId: null, role: 'FINANCE_OFFICER' }] }, 's1')).toBe(
      true,
    );
  });

  it('allows a caller holding the step role for the matching site', () => {
    expect(
      canDecideStep(step, { roles: [{ siteId: 's1', role: 'FINANCE_OFFICER' }] }, 's1'),
    ).toBe(true);
  });

  it('rejects a caller whose site-scoped role is for a different site', () => {
    expect(
      canDecideStep(step, { roles: [{ siteId: 's2', role: 'FINANCE_OFFICER' }] }, 's1'),
    ).toBe(false);
  });

  it('rejects a caller with the wrong role', () => {
    expect(canDecideStep(step, { roles: [{ siteId: null, role: 'SITE_MANAGER' }] }, 's1')).toBe(
      false,
    );
  });

  it('allows a caller via a delegated role even without holding it themselves', () => {
    expect(
      canDecideStep(step, { roles: [] }, 's1', [{ siteId: null, role: 'FINANCE_OFFICER' }]),
    ).toBe(true);
  });

  it('rejects a caller whose delegated role is scoped to a different site', () => {
    expect(
      canDecideStep(step, { roles: [] }, 's1', [{ siteId: 's2', role: 'FINANCE_OFFICER' }]),
    ).toBe(false);
  });
});

// -------------------------------------------------------------------------------------
// G3: decide authorisation enforcement
// -------------------------------------------------------------------------------------
describe('ApprovalService.decide — authorisation', () => {
  const chainBase = {
    id: 'c1',
    module: 'requisition',
    subjectTable: 'requisitions',
    subjectId: 's1',
    requesterId: 'req',
    siteId: null,
    status: ApprovalStatus.PENDING,
  };

  function activeStep() {
    const steps = [
      {
        id: 'a1',
        chainId: 'c1',
        step: 1,
        approverRole: 'FINANCE_OFFICER',
        mode: ApprovalMode.SEQUENTIAL,
        decision: null,
      },
    ];
    return { steps, step: steps[0] };
  }

  it('rejects a caller who does not hold the step role and is not a delegate', async () => {
    const { service, prisma } = makeService();
    const { steps, step } = activeStep();
    prisma.approval.findUnique.mockResolvedValue({
      ...step,
      chain: { ...chainBase, currentStep: 1, steps },
    });

    await expect(
      service.decide({
        approvalId: 'a1',
        approverUserId: 'intruder',
        approverRoles: roleGrant('SITE_MANAGER'), // wrong role
        decision: ApprovalDecision.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.approval.update).not.toHaveBeenCalled();
  });

  it('allows a caller who holds the step role', async () => {
    const { service, prisma } = makeService();
    const { steps, step } = activeStep();
    prisma.approval.findUnique.mockResolvedValue({
      ...step,
      chain: { ...chainBase, currentStep: 1, steps },
    });
    prisma.approval.update.mockResolvedValue({ ...step, decision: ApprovalDecision.APPROVED });
    prisma.approvalChain.update.mockResolvedValue({});
    prisma.approvalChain.findUnique.mockResolvedValue({
      ...chainBase,
      status: ApprovalStatus.APPROVED,
      currentStep: 1,
      steps,
    });

    await service.decide({
      approvalId: 'a1',
      approverUserId: 'fo',
      approverRoles: roleGrant('FINANCE_OFFICER'),
      decision: ApprovalDecision.APPROVED,
    });
    expect(prisma.approval.update).toHaveBeenCalled();
  });

  // --- G5: delegator on leave → delegate can decide -----------------------------------
  it('allows an active delegate of a role-holder to decide even without the role', async () => {
    const { service, prisma, delegation } = makeService();
    const { steps, step } = activeStep();
    prisma.approval.findUnique.mockResolvedValue({
      ...step,
      chain: { ...chainBase, currentStep: 1, steps },
    });
    // "del" holds no role but "boss" (who holds FINANCE_OFFICER) delegates to them.
    delegation.activeDelegatorsFor.mockResolvedValue(['boss']);
    prisma.userSiteRole.findMany.mockResolvedValue([{ siteId: null, role: 'FINANCE_OFFICER' }]);
    prisma.approval.update.mockResolvedValue({ ...step, decision: ApprovalDecision.APPROVED });
    prisma.approvalChain.update.mockResolvedValue({});
    prisma.approvalChain.findUnique.mockResolvedValue({
      ...chainBase,
      status: ApprovalStatus.APPROVED,
      currentStep: 1,
      steps,
    });

    await service.decide({
      approvalId: 'a1',
      approverUserId: 'del',
      approverRoles: [], // no own roles
      decision: ApprovalDecision.APPROVED,
    });
    expect(prisma.approval.update).toHaveBeenCalled();
  });

  it('still blocks a non-delegate without the role when a delegation window is inactive', async () => {
    const { service, prisma, delegation } = makeService();
    const { steps, step } = activeStep();
    prisma.approval.findUnique.mockResolvedValue({
      ...step,
      chain: { ...chainBase, currentStep: 1, steps },
    });
    delegation.activeDelegatorsFor.mockResolvedValue([]); // window inactive

    await expect(
      service.decide({
        approvalId: 'a1',
        approverUserId: 'del',
        approverRoles: [],
        decision: ApprovalDecision.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.approval.update).not.toHaveBeenCalled();
  });
});

// -------------------------------------------------------------------------------------
// G5: notifications reach delegates too
// -------------------------------------------------------------------------------------
describe('ApprovalService.notifyStep — delegate notification', () => {
  it('notifies both role-holders and their active delegates on submit', async () => {
    const { service, prisma, notifications, delegation } = makeService();
    prisma.approvalMatrix.findMany.mockResolvedValue([
      {
        id: 'm1',
        stepOrder: 1,
        approverRole: 'FINANCE_OFFICER',
        mode: ApprovalMode.SEQUENTIAL,
        minAmount: null,
        maxAmount: null,
      },
    ]);
    prisma.approvalChain.create.mockResolvedValue({
      id: 'c1',
      module: 'requisition',
      subjectTable: 'requisitions',
      subjectId: 's1',
      requesterId: 'req',
      siteId: null,
      steps: [{ id: 'a1', step: 1, approverRole: 'FINANCE_OFFICER' }],
    });
    // "boss" holds the role; "del" is their active delegate.
    prisma.userSiteRole.findMany.mockResolvedValue([{ userId: 'boss' }]);
    delegation.activeDelegatesForMany.mockResolvedValue(['del']);

    await service.submit({
      module: 'requisition',
      subjectTable: 'requisitions',
      subjectId: 's1',
      requesterId: 'req',
    });

    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'approval.pending',
        userIds: expect.arrayContaining(['boss', 'del']),
      }),
    );
  });
});
