import { BadRequestException } from '@nestjs/common';
import { ApprovalDecision, ApprovalMode, ApprovalStatus, Prisma, Role } from '@prisma/client';
import { ApprovalService } from '../../approvals/approval.service';
import { StatusTransitionRegistry } from '../../approvals/status-transition.registry';
import { BudgetsService, BudgetStatus } from './budgets.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

function makeService(overrides: { transitions?: StatusTransitionRegistry } = {}) {
  const prisma = {
    budget: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    budgetLine: { aggregate: jest.fn().mockResolvedValue({ _sum: { amount: dec(0) } }) },
    generalExpense: { findMany: jest.fn().mockResolvedValue([]) },
    overhead: { findMany: jest.fn().mockResolvedValue([]) },
    orderExpense: { findMany: jest.fn().mockResolvedValue([]) },
    requisition: { findMany: jest.fn().mockResolvedValue([]) },
    userSiteRole: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = { record: jest.fn() };
  const notifications = { send: jest.fn() };
  const approvals = { submit: jest.fn().mockResolvedValue({ id: 'chain1' }) };
  const transitions = overrides.transitions ?? new StatusTransitionRegistry();
  const thresholds = { current: jest.fn() };

  const service = new BudgetsService(
    prisma as any,
    audit as any,
    notifications as any,
    approvals as any,
    transitions,
    thresholds as any,
  );
  service.onModuleInit();
  return { service, prisma, audit, notifications, approvals, transitions, thresholds };
}

describe('BudgetsService.submit -> approval engine', () => {
  it('sets SUBMITTED and routes to the approval engine with the budgeted total', async () => {
    const { service, prisma, approvals } = makeService();
    prisma.budget.findUnique.mockResolvedValue({
      id: 'b1',
      status: BudgetStatus.DRAFT,
      currency: 'USD',
      siteId: 's1',
      lines: [],
    });
    prisma.budget.update.mockResolvedValue({ id: 'b1', status: BudgetStatus.SUBMITTED });
    prisma.budgetLine.aggregate.mockResolvedValue({ _sum: { amount: dec(8000) } });

    await service.submit('b1', 'fo1');

    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'SUBMITTED' }) }),
    );
    expect(approvals.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'budget',
        subjectTable: 'budgets',
        subjectId: 'b1',
        amount: 8000,
        currency: 'USD',
        siteId: 's1',
        requesterId: 'fo1',
      }),
    );
  });

  it('rejects submitting from a non-draft/returned status', async () => {
    const { service, prisma } = makeService();
    prisma.budget.findUnique.mockResolvedValue({
      id: 'b1',
      status: BudgetStatus.ACTIVE,
      currency: 'USD',
      lines: [],
    });
    await expect(service.submit('b1', 'fo1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('BudgetsService dual-approval gating (real engine, OD + FD PARALLEL)', () => {
  // Wire a real ApprovalService + registry so the budget only goes ACTIVE after BOTH
  // OPS_DIRECTOR and FINANCE_DIRECTOR approve the single PARALLEL step.
  function makeEngine() {
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
    };
    const audit = { record: jest.fn() };
    const notifications = { send: jest.fn() };
    const delegation = { activeDelegateFor: jest.fn().mockResolvedValue(null) };
    const transitions = new StatusTransitionRegistry();
    const engine = new ApprovalService(
      prisma as any,
      audit as any,
      notifications as any,
      delegation as any,
      transitions,
    );
    return { engine, prisma, transitions };
  }

  it('OD approval alone does NOT activate; the budget activates only after FD also approves', async () => {
    const { engine, prisma, transitions } = makeEngine();

    // Budget service registers 'budgets' transition; its activate() flips the budget to ACTIVE.
    const budgetPrisma = makeService({ transitions }).prisma;
    budgetPrisma.budget.findUnique.mockResolvedValue({
      id: 'b1',
      status: BudgetStatus.SUBMITTED,
      name: 'Op Budget',
      version: 1,
    });
    budgetPrisma.budget.update.mockResolvedValue({ id: 'b1', status: BudgetStatus.ACTIVE });

    const chainBase = {
      id: 'c1',
      module: 'budget',
      subjectTable: 'budgets',
      subjectId: 'b1',
      requesterId: 'requester',
      siteId: null,
      status: ApprovalStatus.PENDING,
      currentStep: 1,
    };
    const steps = [
      {
        id: 'sOD',
        chainId: 'c1',
        step: 1,
        approverRole: Role.OPS_DIRECTOR,
        mode: ApprovalMode.PARALLEL,
        decision: null,
      },
      {
        id: 'sFD',
        chainId: 'c1',
        step: 1,
        approverRole: Role.FINANCE_DIRECTOR,
        mode: ApprovalMode.PARALLEL,
        decision: null,
      },
    ];

    // --- OD approves first -> step not satisfied, chain stays PENDING, no transition fires.
    prisma.approval.findUnique.mockResolvedValueOnce({
      ...steps[0],
      chain: { ...chainBase, steps },
    });
    prisma.approval.update.mockResolvedValueOnce({
      ...steps[0],
      decision: ApprovalDecision.APPROVED,
    });
    prisma.approvalChain.findUnique.mockResolvedValueOnce({ ...chainBase, steps });

    await engine.decide({
      approvalId: 'sOD',
      approverUserId: 'od-user',
      decision: ApprovalDecision.APPROVED,
    });

    expect(prisma.approvalChain.update).not.toHaveBeenCalled();
    expect(budgetPrisma.budget.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: BudgetStatus.ACTIVE }) }),
    );

    // --- FD approves second -> both PARALLEL approvers done -> chain closes APPROVED -> activate.
    const stepsAfterOd = [{ ...steps[0], decision: ApprovalDecision.APPROVED }, steps[1]];
    prisma.approval.findUnique.mockResolvedValueOnce({
      ...steps[1],
      chain: { ...chainBase, steps: stepsAfterOd },
    });
    prisma.approval.update.mockResolvedValueOnce({
      ...steps[1],
      decision: ApprovalDecision.APPROVED,
    });
    prisma.approvalChain.update.mockResolvedValue({});
    prisma.approvalChain.findUnique.mockResolvedValue({
      ...chainBase,
      status: ApprovalStatus.APPROVED,
      steps: stepsAfterOd,
    });

    await engine.decide({
      approvalId: 'sFD',
      approverUserId: 'fd-user',
      decision: ApprovalDecision.APPROVED,
    });

    expect(prisma.approvalChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: ApprovalStatus.APPROVED } }),
    );
    // The registered budgets transition fired and activated the budget.
    expect(budgetPrisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: BudgetStatus.ACTIVE } }),
    );
  });
});

describe('BudgetsService activation transition', () => {
  it('APPROVED transition flips the budget to ACTIVE and notifies', async () => {
    const { prisma, notifications, transitions } = makeService();
    prisma.budget.findUnique.mockResolvedValue({
      id: 'b1',
      status: BudgetStatus.SUBMITTED,
      name: 'B',
      version: 1,
      createdBy: 'fo1',
      parentBudgetId: null,
    });
    prisma.budget.update.mockResolvedValue({ id: 'b1', status: BudgetStatus.ACTIVE });

    await transitions.fire('budgets', 'b1', ApprovalStatus.APPROVED);

    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: BudgetStatus.ACTIVE } }),
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'budget.activated' }),
    );
  });

  it('supersedes the predecessor when a revision activates', async () => {
    const { prisma, transitions } = makeService();
    prisma.budget.findUnique.mockResolvedValue({
      id: 'b2',
      status: BudgetStatus.SUBMITTED,
      name: 'B rev2',
      version: 2,
      createdBy: 'fo1',
      parentBudgetId: 'b1',
    });
    prisma.budget.update.mockResolvedValue({ id: 'b2', status: BudgetStatus.ACTIVE });

    await transitions.fire('budgets', 'b2', ApprovalStatus.APPROVED);

    expect(prisma.budget.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'b1', status: BudgetStatus.ACTIVE }),
        data: { status: BudgetStatus.SUPERSEDED },
      }),
    );
  });

  it('mirrors RETURNED onto the budget (restart after correction)', async () => {
    const { prisma, transitions } = makeService();
    prisma.budget.findUnique.mockResolvedValue({ id: 'b1', status: BudgetStatus.SUBMITTED });
    await transitions.fire('budgets', 'b1', ApprovalStatus.RETURNED);
    expect(prisma.budget.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: BudgetStatus.RETURNED } }),
    );
  });
});

describe('BudgetsService.computeActuals', () => {
  function seedBudget(prisma: any) {
    prisma.budget.findUnique.mockResolvedValue({
      id: 'b1',
      currency: 'USD',
      siteId: null,
      status: BudgetStatus.ACTIVE,
      lines: [
        { category: 'Fuel', amount: dec(1000), currency: 'USD' },
        { category: 'Repairs', amount: dec(2000), currency: 'USD' },
        { category: 'Salaries', amount: dec(5000), currency: 'USD' },
      ],
    });
  }

  it('sums actuals across all sources per category and flags WARN at 85% / ALERT at 100%', async () => {
    const { service, prisma, thresholds } = makeService();
    seedBudget(prisma);
    thresholds.current.mockRejectedValue(new Error('none')); // use defaults 0.85 / 1.0

    // Fuel: 900 general + 0 => 90% => WARN.
    prisma.generalExpense.findMany.mockResolvedValue([{ category: 'Fuel', amount: dec(900) }]);
    // Repairs: 1200 overhead + 900 order-expense (by description) => 2100 => 105% => ALERT.
    prisma.overhead.findMany.mockResolvedValue([{ category: 'Repairs', amount: dec(1200) }]);
    prisma.orderExpense.findMany.mockResolvedValue([{ description: 'Repairs', amount: dec(900) }]);
    // Salaries: 1000 requisition => 20% => OK.
    prisma.requisition.findMany.mockResolvedValue([{ purpose: 'Salaries', amount: dec(1000) }]);

    const actuals = await service.computeActuals('b1');

    const fuel = actuals.lines.find((l) => l.category === 'Fuel')!;
    const repairs = actuals.lines.find((l) => l.category === 'Repairs')!;
    const salaries = actuals.lines.find((l) => l.category === 'Salaries')!;

    expect(fuel.actual).toBe(900);
    expect(fuel.state).toBe('WARN');
    expect(repairs.actual).toBe(2100);
    expect(repairs.state).toBe('ALERT');
    expect(salaries.actual).toBe(1000);
    expect(salaries.state).toBe('OK');
    expect(actuals.totals).toEqual(expect.objectContaining({ budgeted: 8000, actual: 4000 }));
  });

  it('honours configurable warn/alert fractions from ThresholdsService', async () => {
    const { service, prisma, thresholds } = makeService();
    seedBudget(prisma);
    // warn 0.5, alert 0.9
    thresholds.current.mockImplementation((key: string) =>
      Promise.resolve({ value: dec(key === 'budget_warn_fraction' ? 0.5 : 0.9) }),
    );
    // Fuel: 600 => 60% => WARN at 0.5 fraction.
    prisma.generalExpense.findMany.mockResolvedValue([{ category: 'Fuel', amount: dec(600) }]);

    const actuals = await service.computeActuals('b1');
    const fuel = actuals.lines.find((l) => l.category === 'Fuel')!;
    expect(actuals.warnFraction).toBe(0.5);
    expect(actuals.alertFraction).toBe(0.9);
    expect(fuel.state).toBe('WARN');
  });
});

describe('BudgetsService.evaluateThresholds', () => {
  it('notifies Finance with WATCH on WARN lines and DANGER on ALERT lines', async () => {
    const { service, prisma, notifications, thresholds } = makeService();
    thresholds.current.mockRejectedValue(new Error('none'));
    prisma.budget.findUnique.mockResolvedValue({
      id: 'b1',
      currency: 'USD',
      siteId: null,
      status: BudgetStatus.ACTIVE,
      name: 'B',
      lines: [
        { category: 'Fuel', amount: dec(1000), currency: 'USD' },
        { category: 'Repairs', amount: dec(1000), currency: 'USD' },
      ],
    });
    prisma.generalExpense.findMany.mockResolvedValue([
      { category: 'Fuel', amount: dec(900) }, // 90% WARN
      { category: 'Repairs', amount: dec(1100) }, // 110% ALERT
    ]);

    const res = await service.evaluateThresholds('b1');
    expect(res.warned).toEqual(['Fuel']);
    expect(res.alerted).toEqual(['Repairs']);
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'budget.threshold.alert', severity: 'DANGER' }),
    );
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'budget.threshold.warn', severity: 'WATCH' }),
    );
  });

  it('is a no-op for a non-active budget', async () => {
    const { service, prisma, notifications, thresholds } = makeService();
    thresholds.current.mockRejectedValue(new Error('none'));
    prisma.budget.findUnique.mockResolvedValue({
      id: 'b1',
      currency: 'USD',
      siteId: null,
      status: BudgetStatus.DRAFT,
      name: 'B',
      lines: [{ category: 'Fuel', amount: dec(1000), currency: 'USD' }],
    });
    prisma.generalExpense.findMany.mockResolvedValue([{ category: 'Fuel', amount: dec(2000) }]);

    const res = await service.evaluateThresholds('b1');
    expect(res.warned).toEqual([]);
    expect(res.alerted).toEqual([]);
    expect(notifications.send).not.toHaveBeenCalled();
  });
});

describe('BudgetsService.revise', () => {
  it('clones an active budget to a new version with carried-forward lines', async () => {
    const { service, prisma } = makeService();
    prisma.budget.findUnique.mockResolvedValue({
      id: 'b1',
      name: 'Op Budget',
      status: BudgetStatus.ACTIVE,
      currency: 'USD',
      siteId: 's1',
      periodMonth: '2026-07',
      version: 1,
      lines: [{ category: 'Fuel', description: null, amount: dec(1000), currency: 'USD' }],
    });
    prisma.budget.create.mockResolvedValue({ id: 'b2', version: 2, lines: [{}] });

    await service.revise('b1', {}, 'fo1');

    expect(prisma.budget.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          version: 2,
          parentBudgetId: 'b1',
          status: BudgetStatus.DRAFT,
        }),
      }),
    );
  });

  it('rejects revising a non-active/approved budget', async () => {
    const { service, prisma } = makeService();
    prisma.budget.findUnique.mockResolvedValue({
      id: 'b1',
      status: BudgetStatus.DRAFT,
      currency: 'USD',
      lines: [],
    });
    await expect(service.revise('b1', {}, 'fo1')).rejects.toBeInstanceOf(BadRequestException);
  });
});
