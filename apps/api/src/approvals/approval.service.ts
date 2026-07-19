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
  Currency,
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
  currency?: Currency | null;
  siteId?: string | null;
  requesterId: string;
}

export interface DecideParams {
  approvalId: string;
  approverUserId: string;
  decision: ApprovalDecision;
  comment?: string;
}

export type ChainWithSteps = ApprovalChain & { steps: Approval[] };

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

  /** PENDING steps at the active step_order whose role the user holds and hasn't decided. */
  async inbox(user: {
    id: string;
    roles: string[];
  }): Promise<(Approval & { chain: ApprovalChain })[]> {
    if (user.roles.length === 0) {
      return [];
    }
    const steps = await this.prisma.approval.findMany({
      where: {
        decision: null,
        approverRole: { in: user.roles },
        chain: { status: ApprovalStatus.PENDING },
      },
      include: { chain: true },
      orderBy: { createdAt: 'asc' },
    });
    // Only surface steps that are actually at the chain's current step_order and where
    // the caller is not the requester (they could never action it anyway).
    return steps.filter((s) => s.step === s.chain.currentStep && s.chain.requesterId !== user.id);
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
    await this.prisma.$transaction([
      this.prisma.approvalChain.update({
        where: { id: chain.id },
        data: { status: ApprovalStatus.RETURNED, currentStep: 1 },
      }),
      // Clear remaining (undecided) decisions on other steps.
      this.prisma.approval.updateMany({
        where: { chainId: chain.id, decision: null },
        data: { decision: null, decidedByUserId: null, decidedAt: null, comment: null },
      }),
    ]);
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

  /** Notify every user holding a role that is an eligible approver at the given step. */
  private async notifyStep(chain: ChainWithSteps, stepOrder: number): Promise<void> {
    const roles = [
      ...new Set(chain.steps.filter((s) => s.step === stepOrder).map((s) => s.approverRole)),
    ];
    if (roles.length === 0) {
      return;
    }
    const assignments = await this.prisma.userSiteRole.findMany({
      where: {
        role: { in: roles },
        ...(chain.siteId ? { OR: [{ siteId: chain.siteId }, { siteId: null }] } : {}),
      },
      select: { userId: true },
    });
    const userIds = [...new Set(assignments.map((a) => a.userId))].filter(
      (id) => id !== chain.requesterId,
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
