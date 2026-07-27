import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Approval,
  ApprovalChain,
  ApprovalDecision,
  ApprovalMatrix,
  ApprovalMode,
  ApprovalStatus,
  NotificationSeverity,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationService } from '../notifications/notification.service';
import { DelegationService } from '../reference/delegation/delegation.service';
import { StatusTransitionRegistry } from './status-transition.registry';

export interface SubmitParams {
  module: string;
  subjectTable: string;
  subjectId: string;
  amount?: number | Prisma.Decimal | null;
  currency?: string | null;
  siteId?: string | null;
  requesterId: string;
}

export interface DecideParams {
  approvalId: string;
  approverUserId: string;
  /**
   * The caller's RBAC assignments, used to authorise the decision against the step's role.
   * `siteId: null` means the role applies across all sites.
   */
  approverRoles: { siteId: string | null; role: string }[];
  decision: ApprovalDecision;
  comment?: string;
}

export type ChainWithSteps = ApprovalChain & { steps: Approval[] };

/** The minimum step shape needed to authorise a decision. */
export interface DecidableStep {
  approverRole: string;
}

/**
 * Pure eligibility check for a decision. The caller may action a step when EITHER:
 *  - they personally hold the step's `approverRole`, site-scoped: a role assignment with a
 *    null site is global, otherwise its site must match the chain's subject site; OR
 *  - they are an active delegate standing in for a user who holds that role site-scoped
 *    (the delegator's eligible roles are supplied in `delegatedRoles`).
 * The requester can never decide their own chain — checked by the caller before this.
 */
export function canDecideStep(
  step: DecidableStep,
  caller: { roles: { siteId: string | null; role: string }[] },
  chainSiteId: string | null,
  delegatedRoles: { siteId: string | null; role: string }[] = [],
): boolean {
  const matches = (r: { siteId: string | null; role: string }): boolean =>
    r.role === step.approverRole && (r.siteId === null || chainSiteId === null || r.siteId === chainSiteId);
  return caller.roles.some(matches) || delegatedRoles.some(matches);
}

/**
 * The generic approval engine. Every module (requisitions, payments, …) submits a
 * subject here; the engine instantiates a chain from the configured approval_matrix
 * and drives it to a terminal status honouring SEQUENTIAL / PARALLEL / EITHER modes.
 */
@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly delegation: DelegationService,
    private readonly transitions: StatusTransitionRegistry,
  ) {}

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  /**
   * Instantiate an approval chain for a submitted subject. Selects matrix rows matching
   * the module, amount band, currency and site (or global), ordered by step_order, then
   * creates one Approval step per matrix row. Notifies the eligible approvers.
   */
  async submit(params: SubmitParams): Promise<ChainWithSteps> {
    const now = new Date();
    const rows = await this.matchingMatrixRows(params);
    if (rows.length === 0) {
      throw new BadRequestException(
        `No active approval_matrix rows match module "${params.module}" for the given amount/site`,
      );
    }

    // Resolve a named delegate per step where a matrix row assigns a concrete approver.
    // Matrix rows target ROLES, so assignedUserId stays null and we match by role at
    // decision time; delegation substitution still runs for any named-approver rows.
    const stepsData = await Promise.all(
      rows.map(async (row) => ({
        step: row.stepOrder,
        approverRole: row.approverRole,
        assignedUserId: await this.resolveDelegate(row, now),
        mode: row.mode,
      })),
    );

    const firstStepOrder = rows[0].stepOrder;

    const chain = await this.prisma.approvalChain.create({
      data: {
        module: params.module,
        subjectTable: params.subjectTable,
        subjectId: params.subjectId,
        amount: params.amount ?? null,
        currency: params.currency ?? null,
        siteId: params.siteId ?? null,
        requesterId: params.requesterId,
        status: ApprovalStatus.PENDING,
        currentStep: firstStepOrder,
        steps: { create: stepsData },
      },
      include: { steps: { orderBy: { step: 'asc' } } },
    });

    await this.audit.record({
      actorUserId: params.requesterId,
      action: 'CREATE',
      tableName: 'approval_chains',
      recordId: chain.id,
      after: {
        module: chain.module,
        subjectTable: chain.subjectTable,
        subjectId: chain.subjectId,
        steps: chain.steps.length,
      },
    });

    await this.notifyStep(chain, firstStepOrder);
    return chain;
  }

  // -------------------------------------------------------------------------
  // Decide
  // -------------------------------------------------------------------------

  /** Record a decision on a step and advance / close the chain accordingly. */
  async decide(params: DecideParams): Promise<ChainWithSteps> {
    const step = await this.prisma.approval.findUnique({
      where: { id: params.approvalId },
      include: { chain: { include: { steps: true } } },
    });
    if (!step) {
      throw new NotFoundException('Approval step not found');
    }
    const chain = step.chain;

    if (chain.status !== ApprovalStatus.PENDING) {
      throw new BadRequestException(`Chain is already ${chain.status}; no further decisions`);
    }
    if (step.decision) {
      throw new BadRequestException('This step has already been decided');
    }
    // HARD RULE: a requester can never approve their own submission.
    if (params.approverUserId === chain.requesterId) {
      throw new ForbiddenException('Self-approval is not permitted');
    }
    // Only the step at the current step_order may be actioned.
    if (step.step !== chain.currentStep) {
      throw new BadRequestException('This step is not currently active');
    }

    // AUTHORISATION: the caller must be eligible for this step — either they hold the
    // step's role (site-scoped) or they are an active delegate of a role-holder.
    // Check own roles first; only pay for the delegation lookup if that fails.
    let eligible = canDecideStep(step, { roles: params.approverRoles }, chain.siteId, []);
    if (!eligible) {
      const delegatedRoles = await this.delegatedRolesFor(params.approverUserId, chain.siteId);
      eligible = canDecideStep(step, { roles: params.approverRoles }, chain.siteId, delegatedRoles);
    }
    if (!eligible) {
      throw new ForbiddenException('You are not an eligible approver for this step');
    }

    // Persist the decision on this step.
    const decidedStep = await this.prisma.approval.update({
      where: { id: step.id },
      data: {
        decision: params.decision,
        decidedByUserId: params.approverUserId,
        decidedAt: new Date(),
        comment: params.comment ?? null,
      },
    });

    await this.audit.record({
      actorUserId: params.approverUserId,
      action:
        params.decision === ApprovalDecision.APPROVED
          ? 'APPROVE'
          : params.decision === ApprovalDecision.REJECTED
            ? 'REJECT'
            : 'STATUS_CHANGE',
      tableName: 'approvals',
      recordId: step.id,
      before: { decision: null },
      after: { decision: params.decision, decidedByUserId: params.approverUserId },
    });

    // Re-read the chain with the updated step folded in.
    const steps = chain.steps.map((s) => (s.id === decidedStep.id ? decidedStep : s));

    if (params.decision === ApprovalDecision.REJECTED) {
      return this.closeChain(chain, steps, ApprovalStatus.REJECTED);
    }
    if (params.decision === ApprovalDecision.RETURNED) {
      return this.returnChain(chain, steps);
    }
    return this.advanceOnApproval(chain, steps);
  }

  // -------------------------------------------------------------------------
  // Inbox
  // -------------------------------------------------------------------------

  /**
   * PENDING steps at the active step_order that the user may action and hasn't decided.
   * Surfaces both the caller's own role matches AND steps whose role is held by a user
   * who has an ACTIVE delegation to the caller (so a stand-in sees the delegator's items).
   */
  async inbox(
    user: {
      id: string;
      roles: string[];
    },
    at: Date = new Date(),
  ): Promise<(Approval & { chain: ApprovalChain })[]> {
    // Roles the caller can exercise on behalf of active delegators (any site — the
    // site-scoping is applied per-step below against the chain's subject site).
    const delegatorIds = await this.delegation.activeDelegatorsFor(user.id, at);
    const delegatedRoles = await this.rolesForUsers(delegatorIds);
    const roles = [...new Set([...user.roles, ...delegatedRoles.map((r) => r.role)])];
    if (roles.length === 0) {
      return [];
    }
    const steps = await this.prisma.approval.findMany({
      where: {
        decision: null,
        approverRole: { in: roles },
        chain: { status: ApprovalStatus.PENDING },
      },
      include: { chain: true },
      orderBy: { createdAt: 'asc' },
    });
    // Only surface steps that are actually at the chain's current step_order and where
    // the caller is not the requester (they could never action it anyway). Delegated rows
    // are additionally site-scoped: the delegator must hold the step role for that site.
    return steps.filter((s) => {
      if (s.step !== s.chain.currentStep || s.chain.requesterId === user.id) {
        return false;
      }
      if (user.roles.includes(s.approverRole)) {
        return true;
      }
      return delegatedRoles.some(
        (r) =>
          r.role === s.approverRole &&
          (r.siteId === null || s.chain.siteId === null || r.siteId === s.chain.siteId),
      );
    });
  }

  /** All RBAC assignments held by the given users (empty in → empty out). */
  private async rolesForUsers(
    userIds: string[],
  ): Promise<{ siteId: string | null; role: string }[]> {
    if (userIds.length === 0) {
      return [];
    }
    return this.prisma.userSiteRole.findMany({
      where: { userId: { in: userIds } },
      select: { siteId: true, role: true },
    });
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async matchingMatrixRows(params: SubmitParams): Promise<ApprovalMatrix[]> {
    const amount = params.amount != null ? new Prisma.Decimal(params.amount) : null;

    const rows = await this.prisma.approvalMatrix.findMany({
      where: {
        module: params.module,
        active: true,
        AND: [
          params.currency ? { OR: [{ currency: params.currency }, { currency: null }] } : {},
          params.siteId ? { OR: [{ siteId: params.siteId }, { siteId: null }] } : { siteId: null },
        ],
      },
      orderBy: [{ stepOrder: 'asc' }, { createdAt: 'asc' }],
    });

    // Amount-band filtering (null bound = open-ended) applied in memory so Decimal
    // comparison is exact.
    return rows.filter((row) => {
      if (amount == null) {
        return true;
      }
      if (row.minAmount != null && amount.lessThan(row.minAmount)) {
        return false;
      }
      if (row.maxAmount != null && amount.greaterThan(row.maxAmount)) {
        return false;
      }
      return true;
    });
  }

  /**
   * Matrix rows target roles, so there is no named approver to substitute here; kept as a
   * hook so rows that ever carry a concrete approver get delegation substitution applied.
   */
  private async resolveDelegate(row: ApprovalMatrix, at: Date): Promise<string | null> {
    const named = (row as ApprovalMatrix & { approverUserId?: string | null }).approverUserId;
    if (!named) {
      return null;
    }
    const delegate = await this.delegation.activeDelegateFor(named, at);
    return delegate ?? named;
  }

  /** Advance the chain after an APPROVED decision, honouring the step's mode. */
  private async advanceOnApproval(
    chain: ApprovalChain,
    steps: Approval[],
  ): Promise<ChainWithSteps> {
    const currentStepRows = steps.filter((s) => s.step === chain.currentStep);
    const approved = currentStepRows.filter((s) => s.decision === ApprovalDecision.APPROVED);
    const mode = currentStepRows[0]?.mode ?? ApprovalMode.SEQUENTIAL;

    let stepSatisfied: boolean;
    if (mode === ApprovalMode.EITHER) {
      stepSatisfied = approved.length >= 1;
    } else if (mode === ApprovalMode.PARALLEL) {
      stepSatisfied = approved.length === currentStepRows.length;
    } else {
      // SEQUENTIAL: a single approver row per step_order; one approval satisfies it.
      stepSatisfied = approved.length === currentStepRows.length;
    }

    if (!stepSatisfied) {
      // Still waiting on other approvers within this step_order; chain stays PENDING.
      return this.reload(chain.id);
    }

    const remainingOrders = [...new Set(steps.map((s) => s.step))]
      .filter((order) => order > chain.currentStep)
      .sort((a, b) => a - b);

    if (remainingOrders.length === 0) {
      return this.closeChain(chain, steps, ApprovalStatus.APPROVED);
    }

    const nextStep = remainingOrders[0];
    await this.prisma.approvalChain.update({
      where: { id: chain.id },
      data: { currentStep: nextStep },
    });
    // Start the SLA clock for the newly-active step (all steps were created at submit).
    await this.prisma.approval.updateMany({
      where: { chainId: chain.id, step: nextStep, decision: null },
      data: { activatedAt: new Date() },
    });
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: 'approval_chains',
      recordId: chain.id,
      before: { currentStep: chain.currentStep },
      after: { currentStep: nextStep },
    });

    const reloaded = await this.reload(chain.id);
    await this.notifyStep(reloaded, nextStep);
    return reloaded;
  }

  /** Terminal close: set status, audit STATUS_CHANGE, fire transition + notify requester. */
  private async closeChain(
    chain: ApprovalChain,
    _steps: Approval[],
    status: ApprovalStatus,
  ): Promise<ChainWithSteps> {
    await this.prisma.approvalChain.update({ where: { id: chain.id }, data: { status } });
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: 'approval_chains',
      recordId: chain.id,
      before: { status: chain.status },
      after: { status },
    });
    await this.transitions.fire(chain.subjectTable, chain.subjectId, status);
    await this.notifications.send({
      userIds: [chain.requesterId],
      template: `approval.${status.toLowerCase()}`,
      payload: { module: chain.module, subjectId: chain.subjectId },
      severity:
        status === ApprovalStatus.REJECTED ? NotificationSeverity.WATCH : NotificationSeverity.INFO,
      subjectTable: chain.subjectTable,
      subjectId: chain.subjectId,
    });
    return this.reload(chain.id);
  }

  /**
   * RETURNED: send the chain back to the requester. Status becomes RETURNED and all
   * still-undecided steps are cleared so a resubmission starts clean.
   */
  private async returnChain(chain: ApprovalChain, _steps: Approval[]): Promise<ChainWithSteps> {
    await this.prisma.rlsTx(async (tx) => {
      await tx.approvalChain.update({
        where: { id: chain.id },
        data: { status: ApprovalStatus.RETURNED, currentStep: 1 },
      });
      // Clear remaining (undecided) decisions on other steps.
      await tx.approval.updateMany({
        where: { chainId: chain.id, decision: null },
        data: { decision: null, decidedByUserId: null, decidedAt: null, comment: null },
      });
    });
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: 'approval_chains',
      recordId: chain.id,
      before: { status: chain.status },
      after: { status: ApprovalStatus.RETURNED },
    });
    await this.transitions.fire(chain.subjectTable, chain.subjectId, ApprovalStatus.RETURNED);
    await this.notifications.send({
      userIds: [chain.requesterId],
      template: 'approval.returned',
      payload: { module: chain.module, subjectId: chain.subjectId },
      severity: NotificationSeverity.WATCH,
      subjectTable: chain.subjectTable,
      subjectId: chain.subjectId,
    });
    return this.reload(chain.id);
  }

  /**
   * The RBAC assignments held by every user who currently delegates to `delegateUserId`.
   * These are the roles the caller may exercise on a delegator's behalf. Site-scoped: only
   * assignments that are global or match the chain's subject site are returned.
   */
  private async delegatedRolesFor(
    delegateUserId: string,
    siteId: string | null,
    at: Date = new Date(),
  ): Promise<{ siteId: string | null; role: string }[]> {
    const delegatorIds = await this.delegation.activeDelegatorsFor(delegateUserId, at);
    if (delegatorIds.length === 0) {
      return [];
    }
    return this.prisma.userSiteRole.findMany({
      where: {
        userId: { in: delegatorIds },
        ...(siteId ? { OR: [{ siteId }, { siteId: null }] } : {}),
      },
      select: { siteId: true, role: true },
    });
  }

  /** Users holding any of the given roles, site-scoped, excluding the requester. */
  private async resolveApproverUserIds(
    roles: string[],
    siteId: string | null,
    excludeUserId: string,
  ): Promise<string[]> {
    if (roles.length === 0) {
      return [];
    }
    const assignments = await this.prisma.userSiteRole.findMany({
      where: {
        role: { in: roles },
        ...(siteId ? { OR: [{ siteId }, { siteId: null }] } : {}),
      },
      select: { userId: true },
    });
    return [...new Set(assignments.map((a) => a.userId))].filter((id) => id !== excludeUserId);
  }

  /**
   * Notify every user holding a role that is an eligible approver at the given step, plus
   * the active delegates standing in for those role-holders (so a stand-in is actually told).
   */
  private async notifyStep(chain: ChainWithSteps, stepOrder: number): Promise<void> {
    const roles = [
      ...new Set(chain.steps.filter((s) => s.step === stepOrder).map((s) => s.approverRole)),
    ];
    const userIds = await this.resolveApproverUserIdsWithDelegates(
      roles,
      chain.siteId,
      chain.requesterId,
    );
    if (userIds.length === 0) {
      return;
    }
    await this.notifications.send({
      userIds,
      template: 'approval.pending',
      payload: { module: chain.module, subjectId: chain.subjectId, step: stepOrder },
      severity: NotificationSeverity.INFO,
      subjectTable: chain.subjectTable,
      subjectId: chain.subjectId,
    });
  }

  /**
   * Role-holders for the given roles/site PLUS their active delegates, de-duped and with the
   * requester removed (a requester is never notified as an approver of their own chain).
   */
  private async resolveApproverUserIdsWithDelegates(
    roles: string[],
    siteId: string | null,
    excludeUserId: string,
    at: Date = new Date(),
  ): Promise<string[]> {
    const holders = await this.resolveApproverUserIds(roles, siteId, excludeUserId);
    const delegates = await this.delegation.activeDelegatesForMany(holders, at);
    return [...new Set([...holders, ...delegates])].filter((id) => id !== excludeUserId);
  }

  // -------------------------------------------------------------------------
  // SLA timers (polled by the scheduler; state lives in the DB so it survives restarts)
  // -------------------------------------------------------------------------

  /**
   * Sweep active, undecided approval steps: remind the approvers once a step has been
   * pending past T1, escalate to the directors past T2. Idempotent — the reminded_at /
   * escalated_at stamps mean each fires at most once per step, and a decided step drops
   * out of the sweep (the timer "cancels" implicitly).
   */
  async runSlaTimers(
    now: Date = new Date(),
    t1Hours = 24,
    t2Hours = 48,
  ): Promise<{ checked: number; reminded: string[]; escalated: string[] }> {
    const steps = await this.prisma.approval.findMany({
      where: { decision: null, chain: { status: ApprovalStatus.PENDING } },
      include: { chain: true },
    });
    const active = steps.filter((s) => s.step === s.chain.currentStep);
    const reminded: string[] = [];
    const escalated: string[] = [];

    for (const step of active) {
      const ageHours = (now.getTime() - step.activatedAt.getTime()) / 3_600_000;
      if (ageHours >= t2Hours && !step.escalatedAt) {
        await this.escalateStep(step, step.chain);
        await this.prisma.approval.update({
          where: { id: step.id },
          data: { escalatedAt: now, remindedAt: step.remindedAt ?? now },
        });
        escalated.push(step.id);
      } else if (ageHours >= t1Hours && !step.remindedAt) {
        await this.remindStep(step, step.chain);
        await this.prisma.approval.update({ where: { id: step.id }, data: { remindedAt: now } });
        reminded.push(step.id);
      }
    }
    return { checked: active.length, reminded, escalated };
  }

  private async remindStep(step: Approval, chain: ApprovalChain): Promise<void> {
    const userIds = await this.resolveApproverUserIdsWithDelegates(
      [step.approverRole],
      chain.siteId,
      chain.requesterId,
    );
    if (userIds.length === 0) {
      return;
    }
    await this.notifications.send({
      userIds,
      template: 'approval.reminder',
      payload: { module: chain.module, subjectId: chain.subjectId, step: step.step },
      severity: NotificationSeverity.WATCH,
      subjectTable: chain.subjectTable,
      subjectId: chain.subjectId,
    });
  }

  private async escalateStep(step: Approval, chain: ApprovalChain): Promise<void> {
    const directors = await this.resolveApproverUserIds(
      ['DIRECTOR', 'FINANCE_DIRECTOR', 'OPS_DIRECTOR'],
      null,
      chain.requesterId,
    );
    if (directors.length === 0) {
      return;
    }
    await this.notifications.send({
      userIds: directors,
      template: 'approval.escalated',
      payload: {
        module: chain.module,
        subjectId: chain.subjectId,
        step: step.step,
        approverRole: step.approverRole,
      },
      severity: NotificationSeverity.DANGER,
      subjectTable: chain.subjectTable,
      subjectId: chain.subjectId,
    });
  }

  private async reload(chainId: string): Promise<ChainWithSteps> {
    const chain = await this.prisma.approvalChain.findUnique({
      where: { id: chainId },
      include: { steps: { orderBy: { step: 'asc' } } },
    });
    if (!chain) {
      throw new NotFoundException('Approval chain not found');
    }
    return chain;
  }
}
