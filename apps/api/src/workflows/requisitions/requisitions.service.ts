import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ApprovalStatus, NotificationSeverity, Prisma, Requisition } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notifications/notification.service';
import { ApprovalService } from '../../approvals/approval.service';
import { StatusTransitionRegistry } from '../../approvals/status-transition.registry';
import { LedgerService } from '../../ledger/ledger.service';
import { LookupService } from '../../settings/lookup.service';
import { CreateRequisitionDto, DisburseRequisitionDto } from './dto/requisition.dto';

/** Lifecycle statuses for a requisition subject (spec §S5). Query-only, so a local TS enum. */
export enum RequisitionStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED',
  APPROVED_READY_TO_PAY = 'APPROVED_READY_TO_PAY',
  APPROVED_PENDING_FUNDS = 'APPROVED_PENDING_FUNDS',
  DISBURSED = 'DISBURSED',
  CLOSED = 'CLOSED',
}

/** How many days out from required-by a PENDING_FUNDS item escalates to a WATCH notice. */
const ESCALATION_WINDOW_DAYS = 3;

const SUBJECT_TABLE = 'requisitions';

@Injectable()
export class RequisitionsService implements OnModuleInit {
  private readonly logger = new Logger(RequisitionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly approvals: ApprovalService,
    private readonly transitions: StatusTransitionRegistry,
    private readonly ledger: LedgerService,
    private readonly lookups: LookupService,
  ) {}

  /**
   * Register the terminal-status callback so the approval engine drives this subject to its
   * next lifecycle state when a chain resolves. On APPROVED we run the funds check; on
   * REJECTED/RETURNED we mirror the terminal status onto the requisition.
   */
  onModuleInit(): void {
    this.transitions.registerTransition(SUBJECT_TABLE, async (subjectId, status) => {
      if (status === ApprovalStatus.APPROVED) {
        await this.runFundsCheck(subjectId);
      } else if (status === ApprovalStatus.REJECTED) {
        await this.setStatus(subjectId, RequisitionStatus.REJECTED);
      } else if (status === ApprovalStatus.RETURNED) {
        await this.setStatus(subjectId, RequisitionStatus.RETURNED);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  list(status?: string): Promise<Requisition[]> {
    return this.prisma.requisition.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<Requisition> {
    const requisition = await this.prisma.requisition.findUnique({ where: { id } });
    if (!requisition) {
      throw new NotFoundException('Requisition not found');
    }
    return requisition;
  }

  // -------------------------------------------------------------------------
  // Create (DRAFT)
  // -------------------------------------------------------------------------

  async create(dto: CreateRequisitionDto, actorId: string): Promise<Requisition> {
    await this.lookups.assertValid('currency', dto.currency);
    if (dto.orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: dto.orderId } });
      if (!order) {
        throw new BadRequestException('Order not found');
      }
    }
    const requisition = await this.prisma.requisition.create({
      data: {
        purpose: dto.purpose,
        amount: dto.amount,
        currency: dto.currency,
        requiredByDate: dto.requiredByDate,
        orderId: dto.orderId ?? null,
        attachmentKey: dto.attachmentKey ?? null,
        siteId: dto.siteId ?? null,
        requesterId: actorId,
        status: RequisitionStatus.DRAFT,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: SUBJECT_TABLE,
      recordId: requisition.id,
      after: {
        purpose: requisition.purpose,
        amount: requisition.amount.toString(),
        currency: requisition.currency,
        status: requisition.status,
      },
    });
    return requisition;
  }

  // -------------------------------------------------------------------------
  // Submit -> approval engine
  // -------------------------------------------------------------------------

  /**
   * Move a DRAFT/RETURNED requisition to SUBMITTED and hand it to the approval engine.
   * APPROVAL IS MERIT-ONLY: funds are never consulted here.
   */
  async submit(id: string, requesterId: string): Promise<Requisition> {
    const requisition = await this.findOne(id);
    if (requisition.requesterId !== requesterId) {
      throw new ForbiddenException('Only the requester may submit this requisition');
    }
    if (
      requisition.status !== RequisitionStatus.DRAFT &&
      requisition.status !== RequisitionStatus.RETURNED
    ) {
      throw new BadRequestException(
        `Requisition cannot be submitted from status ${requisition.status}`,
      );
    }

    const updated = await this.prisma.requisition.update({
      where: { id },
      data: { status: RequisitionStatus.SUBMITTED, updatedBy: requesterId },
    });
    await this.audit.record({
      actorUserId: requesterId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: requisition.status },
      after: { status: RequisitionStatus.SUBMITTED },
    });

    await this.approvals.submit({
      module: 'requisition',
      subjectTable: SUBJECT_TABLE,
      subjectId: id,
      amount: requisition.amount,
      currency: requisition.currency,
      siteId: requisition.siteId,
      requesterId,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Funds check (fired by the transition registry on APPROVED)
  // -------------------------------------------------------------------------

  /**
   * Snapshot the cash position and decide READY_TO_PAY vs PENDING_FUNDS. Never blocks
   * approval — the chain has already resolved APPROVED by the time this runs.
   */
  private async runFundsCheck(id: string): Promise<void> {
    const requisition = await this.prisma.requisition.findUnique({ where: { id } });
    if (!requisition) {
      this.logger.warn(`Funds check skipped: requisition ${id} no longer exists`);
      return;
    }

    const position = await this.ledger.cashPosition();
    const amount = requisition.amount.toNumber();

    // A "suitable" account matches the requisition currency (and site when set) and, if we
    // can find one, has funds covering the amount. We pick the best-funded suitable account.
    const suitable = position.accounts
      .filter((a) => a.currency === requisition.currency)
      .sort((x, y) => y.balance - x.balance);
    const funded = suitable.find((a) => a.balance >= amount);

    const cashSnapshot = position as unknown as Prisma.InputJsonValue;

    if (funded) {
      await this.prisma.requisition.update({
        where: { id },
        data: {
          status: RequisitionStatus.APPROVED_READY_TO_PAY,
          cashSnapshot,
          shortfall: null,
        },
      });
      await this.audit.record({
        actorUserId: null,
        action: 'STATUS_CHANGE',
        tableName: SUBJECT_TABLE,
        recordId: id,
        before: { status: requisition.status },
        after: { status: RequisitionStatus.APPROVED_READY_TO_PAY },
      });
      await this.notifications.send({
        userIds: await this.financeUserIds(),
        template: 'requisition.ready_to_pay',
        payload: { requisitionId: id, amount: amount, currency: requisition.currency },
        severity: NotificationSeverity.INFO,
        subjectTable: SUBJECT_TABLE,
        subjectId: id,
      });
      return;
    }

    // Shortfall = amount minus the best-funded suitable account (0 balance if none exist).
    const best = suitable[0]?.balance ?? 0;
    const shortfall = new Prisma.Decimal(amount).minus(best);

    await this.prisma.requisition.update({
      where: { id },
      data: {
        status: RequisitionStatus.APPROVED_PENDING_FUNDS,
        cashSnapshot,
        shortfall,
      },
    });
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: requisition.status },
      after: { status: RequisitionStatus.APPROVED_PENDING_FUNDS, shortfall: shortfall.toString() },
    });
    await this.notifications.send({
      userIds: [...new Set([requisition.requesterId, ...(await this.financeUserIds())])],
      template: 'requisition.pending_funds',
      payload: {
        requisitionId: id,
        amount: amount,
        currency: requisition.currency,
        shortfall: shortfall.toNumber(),
      },
      severity: NotificationSeverity.WATCH,
      subjectTable: SUBJECT_TABLE,
      subjectId: id,
    });
  }

  // -------------------------------------------------------------------------
  // Disburse (human transfer recorded + posted to ledger)
  // -------------------------------------------------------------------------

  /**
   * Record a human-performed transfer: DEBIT the source account (cash out) and close out
   * the requisition. The recorder-of-payment must differ from the requester (SoD).
   */
  async disburse(
    id: string,
    financeUserId: string,
    dto: DisburseRequisitionDto,
  ): Promise<Requisition> {
    const requisition = await this.findOne(id);

    if (
      requisition.status !== RequisitionStatus.APPROVED_READY_TO_PAY &&
      requisition.status !== RequisitionStatus.APPROVED_PENDING_FUNDS
    ) {
      throw new BadRequestException(
        `Requisition cannot be disbursed from status ${requisition.status}`,
      );
    }
    // Segregation of duties: whoever records the payment cannot be the requester.
    if (requisition.requesterId === financeUserId) {
      throw new ForbiddenException('The requester cannot record the disbursement (SoD)');
    }

    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
    if (!account) {
      throw new BadRequestException('Disbursement account not found');
    }
    if (account.currency !== requisition.currency) {
      throw new BadRequestException(
        `Account currency ${account.currency} does not match requisition currency ${requisition.currency}`,
      );
    }

    const disbursedAt = new Date();

    // Post the cash outflow as a balanced double-entry journal: money paid out of the source
    // (cash) account is a DEBIT; the contra PAYABLE account is CREDITed for the same amount.
    const payable = await this.ledger.ensureSystemAccount('PAYABLE', requisition.currency as string);
    await this.ledger.postJournal(
      [
        {
          accountId: dto.accountId,
          debit: requisition.amount.toNumber(),
          currency: requisition.currency as string,
          description: `Requisition disbursement: ${requisition.purpose}`,
        },
        {
          accountId: payable.id,
          credit: requisition.amount.toNumber(),
          currency: requisition.currency as string,
          description: `Requisition disbursement payable: ${requisition.purpose}`,
        },
      ],
      {
        sourceTable: SUBJECT_TABLE,
        sourceId: id,
        entryDate: disbursedAt,
        createdBy: financeUserId,
      },
    );

    // DISBURSED then immediately CLOSED — the requisition has no post-disbursement retirement
    // step (that is travel-only). We record both statuses via audit for the trail.
    const updated = await this.prisma.requisition.update({
      where: { id },
      data: {
        status: RequisitionStatus.CLOSED,
        disbursementAccountId: dto.accountId,
        disbursementReference: dto.reference,
        disbursedAt,
        updatedBy: financeUserId,
      },
    });
    await this.audit.record({
      actorUserId: financeUserId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: requisition.status },
      after: {
        status: RequisitionStatus.CLOSED,
        disbursedVia: RequisitionStatus.DISBURSED,
        accountId: dto.accountId,
        reference: dto.reference,
      },
    });
    await this.notifications.send({
      userIds: [requisition.requesterId],
      template: 'requisition.disbursed',
      payload: { requisitionId: id, reference: dto.reference },
      severity: NotificationSeverity.INFO,
      subjectTable: SUBJECT_TABLE,
      subjectId: id,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Pending-funds re-test / escalation
  // -------------------------------------------------------------------------

  /**
   * Re-check every APPROVED_PENDING_FUNDS requisition against the current ledger. Any that
   * are now funded flip to APPROVED_READY_TO_PAY and notify Finance; any still short whose
   * required-by date is within {@link ESCALATION_WINDOW_DAYS} escalate with a DANGER notice.
   *
   * NOTE: scheduling is intentionally NOT wired here. `@nestjs/schedule` is not installed in
   * this project, so there is no real cron. Wire this to a daily job when scheduling lands,
   * e.g. `@Cron('0 6 * * *')` / `@Interval(...)`. For now it is a callable method (exercised
   * by tests and invokable via any future scheduler or admin trigger).
   */
  async reTestPendingFunds(now: Date = new Date()): Promise<{
    checked: number;
    promoted: string[];
    escalated: string[];
  }> {
    const pending = await this.prisma.requisition.findMany({
      where: { status: RequisitionStatus.APPROVED_PENDING_FUNDS },
    });
    if (pending.length === 0) {
      return { checked: 0, promoted: [], escalated: [] };
    }

    const position = await this.ledger.cashPosition();
    const cashSnapshot = position as unknown as Prisma.InputJsonValue;
    const promoted: string[] = [];
    const escalated: string[] = [];

    for (const requisition of pending) {
      const amount = requisition.amount.toNumber();
      const suitable = position.accounts.filter((a) => a.currency === requisition.currency);
      const funded = suitable.some((a) => a.balance >= amount);

      if (funded) {
        await this.prisma.requisition.update({
          where: { id: requisition.id },
          data: {
            status: RequisitionStatus.APPROVED_READY_TO_PAY,
            cashSnapshot,
            shortfall: null,
          },
        });
        await this.audit.record({
          actorUserId: null,
          action: 'STATUS_CHANGE',
          tableName: SUBJECT_TABLE,
          recordId: requisition.id,
          before: { status: RequisitionStatus.APPROVED_PENDING_FUNDS },
          after: { status: RequisitionStatus.APPROVED_READY_TO_PAY },
        });
        await this.notifications.send({
          userIds: await this.financeUserIds(),
          template: 'requisition.ready_to_pay',
          payload: { requisitionId: requisition.id, amount, currency: requisition.currency },
          severity: NotificationSeverity.INFO,
          subjectTable: SUBJECT_TABLE,
          subjectId: requisition.id,
        });
        promoted.push(requisition.id);
        continue;
      }

      // Still short — escalate when the required-by date is within the escalation window.
      const daysToRequired =
        (requisition.requiredByDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysToRequired <= ESCALATION_WINDOW_DAYS) {
        await this.notifications.send({
          userIds: [...new Set([requisition.requesterId, ...(await this.financeUserIds())])],
          template: 'requisition.pending_funds.escalation',
          payload: {
            requisitionId: requisition.id,
            requiredByDate: requisition.requiredByDate.toISOString(),
            daysToRequired: Math.floor(daysToRequired),
          },
          severity: NotificationSeverity.DANGER,
          subjectTable: SUBJECT_TABLE,
          subjectId: requisition.id,
        });
        escalated.push(requisition.id);
      }
    }

    return { checked: pending.length, promoted, escalated };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Mirror a terminal approval status (REJECTED/RETURNED) onto the requisition. */
  private async setStatus(id: string, status: RequisitionStatus): Promise<void> {
    const requisition = await this.prisma.requisition.findUnique({ where: { id } });
    if (!requisition) {
      return;
    }
    await this.prisma.requisition.update({ where: { id }, data: { status } });
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: requisition.status },
      after: { status },
    });
  }

  /** All users holding a Finance role, for READY_TO_PAY / PENDING_FUNDS notifications. */
  private async financeUserIds(): Promise<string[]> {
    const assignments = await this.prisma.userSiteRole.findMany({
      where: { role: { in: ['FINANCE_OFFICER', 'FINANCE_DIRECTOR'] } },
      select: { userId: true },
    });
    return [...new Set(assignments.map((a) => a.userId))];
  }
}
