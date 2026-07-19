import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  ApprovalStatus,
  Currency,
  NotificationSeverity,
  Prisma,
  TravelRequest,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notifications/notification.service';
import { ApprovalService } from '../../approvals/approval.service';
import { StatusTransitionRegistry } from '../../approvals/status-transition.registry';
import { LedgerService } from '../../ledger/ledger.service';
import { TravelRatesService } from './travel-rates.service';
import { CreateTravelDto, DisburseTravelDto, RetireTravelDto } from './dto/travel.dto';

/** Lifecycle statuses for a travel request subject (spec §S5). Query-only, so a local TS enum. */
export enum TravelStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED',
  APPROVED_READY_TO_PAY = 'APPROVED_READY_TO_PAY',
  APPROVED_PENDING_FUNDS = 'APPROVED_PENDING_FUNDS',
  DISBURSED = 'DISBURSED',
  RETIRED = 'RETIRED',
  CLOSED = 'CLOSED',
}

/** How many days out from dateFrom a PENDING_FUNDS item escalates to a DANGER notice. */
const ESCALATION_WINDOW_DAYS = 3;

/** After how many days past dateTo an un-retired, disbursed advance is flagged to FD. */
const UNRETIRED_REMINDER_DAYS = 7;

const SUBJECT_TABLE = 'travel_requests';

@Injectable()
export class TravelService implements OnModuleInit {
  private readonly logger = new Logger(TravelService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly approvals: ApprovalService,
    private readonly transitions: StatusTransitionRegistry,
    private readonly ledger: LedgerService,
    private readonly rates: TravelRatesService,
  ) {}

  /**
   * Register the terminal-status callback so the approval engine drives this subject to its
   * next lifecycle state when a chain resolves. On APPROVED we run the funds check; on
   * REJECTED/RETURNED we mirror the terminal status onto the travel request.
   */
  onModuleInit(): void {
    this.transitions.registerTransition(SUBJECT_TABLE, async (subjectId, status) => {
      if (status === ApprovalStatus.APPROVED) {
        await this.runFundsCheck(subjectId);
      } else if (status === ApprovalStatus.REJECTED) {
        await this.setStatus(subjectId, TravelStatus.REJECTED);
      } else if (status === ApprovalStatus.RETURNED) {
        await this.setStatus(subjectId, TravelStatus.RETURNED);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  list(status?: string): Promise<TravelRequest[]> {
    return this.prisma.travelRequest.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<TravelRequest> {
    const travel = await this.prisma.travelRequest.findUnique({ where: { id } });
    if (!travel) {
      throw new NotFoundException('Travel request not found');
    }
    return travel;
  }

  // -------------------------------------------------------------------------
  // Create (DRAFT)
  // -------------------------------------------------------------------------

  /**
   * Create a DRAFT travel request. The per-diem is resolved from the admin rate table for
   * the (grade, destinationClass, currency) tuple effective on the trip start date;
   * advanceAmount = perDiem * days. Grade/class default to a common band when omitted so a
   * matching rate row can always be looked up.
   */
  async create(dto: CreateTravelDto, actorId: string): Promise<TravelRequest> {
    if (dto.dateTo < dto.dateFrom) {
      throw new BadRequestException('dateTo cannot be before dateFrom');
    }

    const grade = dto.grade ?? 'DEFAULT';
    const destinationClass = dto.destinationClass ?? 'DEFAULT';

    const rate = await this.rates.rateFor(grade, destinationClass, dto.currency, dto.dateFrom);
    const perDiem = rate.dailyRate;
    const advanceAmount = perDiem.mul(dto.days);

    const travel = await this.prisma.travelRequest.create({
      data: {
        destination: dto.destination,
        destinationClass: dto.destinationClass ?? null,
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
        grade: dto.grade ?? null,
        perDiem,
        days: dto.days,
        advanceAmount,
        currency: dto.currency,
        siteId: dto.siteId ?? null,
        requesterId: actorId,
        status: TravelStatus.DRAFT,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: SUBJECT_TABLE,
      recordId: travel.id,
      after: {
        destination: travel.destination,
        perDiem: travel.perDiem.toString(),
        days: travel.days,
        advanceAmount: travel.advanceAmount.toString(),
        currency: travel.currency,
        status: travel.status,
      },
    });
    return travel;
  }

  // -------------------------------------------------------------------------
  // Submit -> approval engine
  // -------------------------------------------------------------------------

  /**
   * Move a DRAFT/RETURNED travel request to SUBMITTED and hand it to the approval engine.
   * APPROVAL IS MERIT-ONLY: funds are never consulted here.
   */
  async submit(id: string, requesterId: string): Promise<TravelRequest> {
    const travel = await this.findOne(id);
    if (travel.requesterId !== requesterId) {
      throw new ForbiddenException('Only the requester may submit this travel request');
    }
    if (travel.status !== TravelStatus.DRAFT && travel.status !== TravelStatus.RETURNED) {
      throw new BadRequestException(
        `Travel request cannot be submitted from status ${travel.status}`,
      );
    }

    const updated = await this.prisma.travelRequest.update({
      where: { id },
      data: { status: TravelStatus.SUBMITTED, updatedBy: requesterId },
    });
    await this.audit.record({
      actorUserId: requesterId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: travel.status },
      after: { status: TravelStatus.SUBMITTED },
    });

    await this.approvals.submit({
      module: 'travel',
      subjectTable: SUBJECT_TABLE,
      subjectId: id,
      amount: travel.advanceAmount,
      currency: travel.currency,
      siteId: travel.siteId,
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
    const travel = await this.prisma.travelRequest.findUnique({ where: { id } });
    if (!travel) {
      this.logger.warn(`Funds check skipped: travel request ${id} no longer exists`);
      return;
    }

    const position = await this.ledger.cashPosition();
    const amount = travel.advanceAmount.toNumber();

    // A "suitable" account matches the request currency; we pick the best-funded one.
    const suitable = position.accounts
      .filter((a) => a.currency === travel.currency)
      .sort((x, y) => y.balance - x.balance);
    const funded = suitable.find((a) => a.balance >= amount);

    const cashSnapshot = position as unknown as Prisma.InputJsonValue;

    if (funded) {
      await this.prisma.travelRequest.update({
        where: { id },
        data: {
          status: TravelStatus.APPROVED_READY_TO_PAY,
          cashSnapshot,
          shortfall: null,
        },
      });
      await this.audit.record({
        actorUserId: null,
        action: 'STATUS_CHANGE',
        tableName: SUBJECT_TABLE,
        recordId: id,
        before: { status: travel.status },
        after: { status: TravelStatus.APPROVED_READY_TO_PAY },
      });
      await this.notifications.send({
        userIds: await this.financeUserIds(),
        template: 'travel.ready_to_pay',
        payload: { travelId: id, amount, currency: travel.currency },
        severity: NotificationSeverity.INFO,
        subjectTable: SUBJECT_TABLE,
        subjectId: id,
      });
      return;
    }

    // Shortfall = amount minus the best-funded suitable account (0 balance if none exist).
    const best = suitable[0]?.balance ?? 0;
    const shortfall = new Prisma.Decimal(amount).minus(best);

    await this.prisma.travelRequest.update({
      where: { id },
      data: {
        status: TravelStatus.APPROVED_PENDING_FUNDS,
        cashSnapshot,
        shortfall,
      },
    });
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: travel.status },
      after: { status: TravelStatus.APPROVED_PENDING_FUNDS, shortfall: shortfall.toString() },
    });
    await this.notifications.send({
      userIds: [...new Set([travel.requesterId, ...(await this.financeUserIds())])],
      template: 'travel.pending_funds',
      payload: {
        travelId: id,
        amount,
        currency: travel.currency,
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
   * Record a human-performed transfer of the advance: DEBIT the source account (cash out)
   * and move the request to DISBURSED (awaiting retirement). The recorder-of-payment must
   * differ from the requester (SoD).
   */
  async disburse(
    id: string,
    financeUserId: string,
    dto: DisburseTravelDto,
  ): Promise<TravelRequest> {
    const travel = await this.findOne(id);

    if (
      travel.status !== TravelStatus.APPROVED_READY_TO_PAY &&
      travel.status !== TravelStatus.APPROVED_PENDING_FUNDS
    ) {
      throw new BadRequestException(
        `Travel request cannot be disbursed from status ${travel.status}`,
      );
    }
    // Segregation of duties: whoever records the payment cannot be the requester.
    if (travel.requesterId === financeUserId) {
      throw new ForbiddenException('The requester cannot record the disbursement (SoD)');
    }

    const account = await this.prisma.account.findUnique({ where: { id: dto.accountId } });
    if (!account) {
      throw new BadRequestException('Disbursement account not found');
    }
    if (account.currency !== travel.currency) {
      throw new BadRequestException(
        `Account currency ${account.currency} does not match travel currency ${travel.currency}`,
      );
    }

    const disbursedAt = new Date();

    // Post the cash outflow: money paid out of the source account is a DEBIT.
    await this.ledger.post([
      {
        accountId: dto.accountId,
        debit: travel.advanceAmount.toNumber(),
        currency: travel.currency as Currency,
        sourceTable: SUBJECT_TABLE,
        sourceId: id,
        entryDate: disbursedAt,
        description: `Travel advance disbursement: ${travel.destination}`,
        createdBy: financeUserId,
      },
    ]);

    // DISBURSED (NOT closed) — travel has a mandatory post-disbursement retirement step.
    const updated = await this.prisma.travelRequest.update({
      where: { id },
      data: {
        status: TravelStatus.DISBURSED,
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
      before: { status: travel.status },
      after: {
        status: TravelStatus.DISBURSED,
        accountId: dto.accountId,
        reference: dto.reference,
      },
    });
    await this.notifications.send({
      userIds: [travel.requesterId],
      template: 'travel.disbursed',
      payload: { travelId: id, reference: dto.reference },
      severity: NotificationSeverity.INFO,
      subjectTable: SUBJECT_TABLE,
      subjectId: id,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Retire (travel-only): reconcile spend against the advance, then CLOSE
  // -------------------------------------------------------------------------

  /**
   * Retire a DISBURSED advance. Reconciliation of `unspent` against the advance:
   *   - unspent > 0  -> refundDue: the traveller returns the unspent cash to the business.
   *                     We post the returned cash back as a CREDIT to the source account.
   *   - unspent < 0  -> refundOwed: the traveller overspent; the business owes them the
   *                     excess (settled by a separate requisition/payment, not posted here).
   *   - unspent = 0  -> fully reconciled, nothing to settle.
   * The request moves RETIRED then CLOSED (recorded in the trail).
   */
  async retire(id: string, actorId: string, dto: RetireTravelDto): Promise<TravelRequest> {
    const travel = await this.findOne(id);
    if (travel.status !== TravelStatus.DISBURSED) {
      throw new BadRequestException(
        `Travel request cannot be retired from status ${travel.status}`,
      );
    }

    const advance = travel.advanceAmount.toNumber();
    if (dto.unspent > advance) {
      throw new BadRequestException(
        `Unspent (${dto.unspent}) cannot exceed the advance (${advance})`,
      );
    }

    // Positive unspent = cash owed BACK to the business (refundDue). No overspend can be
    // represented by `unspent` (it is clamped >= 0 by the DTO), so refundOwed stays 0 here;
    // it exists on the model for future overspend-settlement flows.
    const refundDue = new Prisma.Decimal(dto.unspent);
    const refundOwed = new Prisma.Decimal(0);
    const retiredAt = new Date();

    // Record returned cash: the unspent advance flows back INTO the source account (CREDIT).
    if (dto.unspent > 0 && travel.disbursementAccountId) {
      await this.ledger.post([
        {
          accountId: travel.disbursementAccountId,
          credit: dto.unspent,
          currency: travel.currency as Currency,
          sourceTable: SUBJECT_TABLE,
          sourceId: id,
          entryDate: retiredAt,
          description: `Travel retirement refund: ${travel.destination}`,
          createdBy: actorId,
        },
      ]);
    }

    const updated = await this.prisma.travelRequest.update({
      where: { id },
      data: {
        status: TravelStatus.CLOSED,
        retirementReceiptsKey: dto.receiptsKey,
        refundDue,
        refundOwed,
        retiredAt,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: travel.status },
      after: {
        status: TravelStatus.CLOSED,
        retiredVia: TravelStatus.RETIRED,
        receiptsKey: dto.receiptsKey,
        refundDue: refundDue.toString(),
        refundOwed: refundOwed.toString(),
      },
    });
    await this.notifications.send({
      userIds: [...new Set([travel.requesterId, ...(await this.financeUserIds())])],
      template: 'travel.retired',
      payload: {
        travelId: id,
        refundDue: refundDue.toNumber(),
        refundOwed: refundOwed.toNumber(),
      },
      severity: NotificationSeverity.INFO,
      subjectTable: SUBJECT_TABLE,
      subjectId: id,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Un-retired advances: list + reminder to Finance Directors
  // -------------------------------------------------------------------------

  /**
   * Every DISBURSED (not-yet-retired) advance whose trip ended more than
   * {@link UNRETIRED_REMINDER_DAYS} days ago. These travellers still owe a retirement.
   */
  listUnretired(now: Date = new Date()): Promise<TravelRequest[]> {
    const cutoff = new Date(now.getTime() - UNRETIRED_REMINDER_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.travelRequest.findMany({
      where: { status: TravelStatus.DISBURSED, dateTo: { lt: cutoff } },
      orderBy: { dateTo: 'asc' },
    });
  }

  /**
   * Notify Finance Directors of every overdue un-retired advance and remind each traveller.
   *
   * NOTE: scheduling is intentionally NOT wired here. `@nestjs/schedule` is not installed in
   * this project, so there is no real cron. Wire this to a daily job when scheduling lands
   * (e.g. `@Cron('0 6 * * *')`). For now it is a callable method exercised by tests and
   * invokable via any future scheduler or admin trigger.
   */
  async remindUnretired(now: Date = new Date()): Promise<{ reminded: string[] }> {
    const overdue = await this.listUnretired(now);
    if (overdue.length === 0) {
      return { reminded: [] };
    }

    const fdUserIds = await this.financeDirectorUserIds();
    const reminded: string[] = [];

    for (const travel of overdue) {
      await this.notifications.send({
        userIds: [...new Set([travel.requesterId, ...fdUserIds])],
        template: 'travel.unretired.reminder',
        payload: {
          travelId: travel.id,
          destination: travel.destination,
          dateTo: travel.dateTo.toISOString(),
        },
        severity: NotificationSeverity.WATCH,
        subjectTable: SUBJECT_TABLE,
        subjectId: travel.id,
      });
      reminded.push(travel.id);
    }

    return { reminded };
  }

  // -------------------------------------------------------------------------
  // Pending-funds re-test / escalation
  // -------------------------------------------------------------------------

  /**
   * Re-check every APPROVED_PENDING_FUNDS request against the current ledger. Any now funded
   * flip to APPROVED_READY_TO_PAY and notify Finance; any still short whose trip starts within
   * {@link ESCALATION_WINDOW_DAYS} escalate with a DANGER notice. Callable (no cron here).
   */
  async reTestPendingFunds(now: Date = new Date()): Promise<{
    checked: number;
    promoted: string[];
    escalated: string[];
  }> {
    const pending = await this.prisma.travelRequest.findMany({
      where: { status: TravelStatus.APPROVED_PENDING_FUNDS },
    });
    if (pending.length === 0) {
      return { checked: 0, promoted: [], escalated: [] };
    }

    const position = await this.ledger.cashPosition();
    const cashSnapshot = position as unknown as Prisma.InputJsonValue;
    const promoted: string[] = [];
    const escalated: string[] = [];

    for (const travel of pending) {
      const amount = travel.advanceAmount.toNumber();
      const suitable = position.accounts.filter((a) => a.currency === travel.currency);
      const funded = suitable.some((a) => a.balance >= amount);

      if (funded) {
        await this.prisma.travelRequest.update({
          where: { id: travel.id },
          data: {
            status: TravelStatus.APPROVED_READY_TO_PAY,
            cashSnapshot,
            shortfall: null,
          },
        });
        await this.audit.record({
          actorUserId: null,
          action: 'STATUS_CHANGE',
          tableName: SUBJECT_TABLE,
          recordId: travel.id,
          before: { status: TravelStatus.APPROVED_PENDING_FUNDS },
          after: { status: TravelStatus.APPROVED_READY_TO_PAY },
        });
        await this.notifications.send({
          userIds: await this.financeUserIds(),
          template: 'travel.ready_to_pay',
          payload: { travelId: travel.id, amount, currency: travel.currency },
          severity: NotificationSeverity.INFO,
          subjectTable: SUBJECT_TABLE,
          subjectId: travel.id,
        });
        promoted.push(travel.id);
        continue;
      }

      const daysToTrip = (travel.dateFrom.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
      if (daysToTrip <= ESCALATION_WINDOW_DAYS) {
        await this.notifications.send({
          userIds: [...new Set([travel.requesterId, ...(await this.financeUserIds())])],
          template: 'travel.pending_funds.escalation',
          payload: {
            travelId: travel.id,
            dateFrom: travel.dateFrom.toISOString(),
            daysToTrip: Math.floor(daysToTrip),
          },
          severity: NotificationSeverity.DANGER,
          subjectTable: SUBJECT_TABLE,
          subjectId: travel.id,
        });
        escalated.push(travel.id);
      }
    }

    return { checked: pending.length, promoted, escalated };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Mirror a terminal approval status (REJECTED/RETURNED) onto the travel request. */
  private async setStatus(id: string, status: TravelStatus): Promise<void> {
    const travel = await this.prisma.travelRequest.findUnique({ where: { id } });
    if (!travel) {
      return;
    }
    await this.prisma.travelRequest.update({ where: { id }, data: { status } });
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: travel.status },
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

  /** Finance Directors, for un-retired-advance reminders. */
  private async financeDirectorUserIds(): Promise<string[]> {
    const assignments = await this.prisma.userSiteRole.findMany({
      where: { role: 'FINANCE_DIRECTOR' },
      select: { userId: true },
    });
    return [...new Set(assignments.map((a) => a.userId))];
  }
}
