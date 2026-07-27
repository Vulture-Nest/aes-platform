import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ApprovalStatus, DirectorWithdrawal, NotificationSeverity, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notifications/notification.service';
import { ApprovalService } from '../../approvals/approval.service';
import { StatusTransitionRegistry } from '../../approvals/status-transition.registry';
import { LedgerService } from '../../ledger/ledger.service';
import { LookupService } from '../../settings/lookup.service';
import {
  CompleteDirectorWithdrawalDto,
  CreateDirectorWithdrawalDto,
} from './dto/director-withdrawal.dto';

/**
 * Lifecycle statuses for a director-withdrawal subject. Query-only, so a local TS enum (the
 * Prisma column is a plain `String`). Unlike the shared travel/requisition lifecycle, a
 * withdrawal posts to the ledger IMMEDIATELY on co-approval (so cash position reflects it at
 * once) and then simply awaits the human transfer, so it has its own terminal states.
 */
export enum DirectorWithdrawalStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED',
  /** Co-approved and posted to the ledger; a human still has to perform the bank transfer. */
  POSTED_AWAITING_TRANSFER = 'POSTED_AWAITING_TRANSFER',
  /** The human transfer has been recorded (method + reference); the withdrawal is complete. */
  COMPLETED = 'COMPLETED',
}

/** The approval engine module name; matrix rows for it must place DIRECTOR co-approvers. */
const APPROVAL_MODULE = 'director_withdrawal';

const SUBJECT_TABLE = 'director_withdrawals';

/** After how many days a POSTED_AWAITING_TRANSFER item is considered stale and nudged. */
const STALE_POSTED_DAYS = 3;

@Injectable()
export class DirectorWithdrawalsService implements OnModuleInit {
  private readonly logger = new Logger(DirectorWithdrawalsService.name);

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
   * Register the terminal-status callback so the approval engine drives this subject when a
   * co-approval chain resolves. On APPROVED we run the informational funds check and post to
   * the ledger immediately; on REJECTED/RETURNED we mirror the terminal status.
   */
  onModuleInit(): void {
    this.transitions.registerTransition(SUBJECT_TABLE, async (subjectId, status) => {
      if (status === ApprovalStatus.APPROVED) {
        await this.postToLedger(subjectId);
      } else if (status === ApprovalStatus.REJECTED) {
        await this.setStatus(subjectId, DirectorWithdrawalStatus.REJECTED);
      } else if (status === ApprovalStatus.RETURNED) {
        await this.setStatus(subjectId, DirectorWithdrawalStatus.RETURNED);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  list(status?: string): Promise<DirectorWithdrawal[]> {
    return this.prisma.directorWithdrawal.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string): Promise<DirectorWithdrawal> {
    const withdrawal = await this.prisma.directorWithdrawal.findUnique({ where: { id } });
    if (!withdrawal) {
      throw new NotFoundException('Director withdrawal not found');
    }
    return withdrawal;
  }

  // -------------------------------------------------------------------------
  // Create (DRAFT)
  // -------------------------------------------------------------------------

  /** Raise a DRAFT withdrawal in the raising director's own name. */
  async create(dto: CreateDirectorWithdrawalDto, actorId: string): Promise<DirectorWithdrawal> {
    await this.lookups.assertValid('currency', dto.currency);
    const withdrawal = await this.prisma.directorWithdrawal.create({
      data: {
        directorUserId: actorId,
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency,
        destinationAccount: dto.destinationAccount,
        reason: dto.reason,
        status: DirectorWithdrawalStatus.DRAFT,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: SUBJECT_TABLE,
      recordId: withdrawal.id,
      after: {
        directorUserId: withdrawal.directorUserId,
        amount: withdrawal.amount.toString(),
        currency: withdrawal.currency,
        destinationAccount: withdrawal.destinationAccount,
        status: withdrawal.status,
      },
    });
    return withdrawal;
  }

  // -------------------------------------------------------------------------
  // Submit -> approval engine (co-approval by a SECOND director)
  // -------------------------------------------------------------------------

  /**
   * Move a DRAFT/RETURNED withdrawal to SUBMITTED and hand it to the approval engine as
   * module='director_withdrawal'. The matrix routes it to a DIRECTOR approver; the engine
   * makes self-approval impossible (requester can never decide their own chain), so the
   * approving director is necessarily a SECOND director.
   */
  async submit(id: string, requesterId: string): Promise<DirectorWithdrawal> {
    const withdrawal = await this.findOne(id);
    if (withdrawal.directorUserId !== requesterId) {
      throw new ForbiddenException('Only the raising director may submit this withdrawal');
    }
    if (
      withdrawal.status !== DirectorWithdrawalStatus.DRAFT &&
      withdrawal.status !== DirectorWithdrawalStatus.RETURNED
    ) {
      throw new BadRequestException(
        `Director withdrawal cannot be submitted from status ${withdrawal.status}`,
      );
    }

    const updated = await this.prisma.directorWithdrawal.update({
      where: { id },
      data: { status: DirectorWithdrawalStatus.SUBMITTED, updatedBy: requesterId },
    });
    await this.audit.record({
      actorUserId: requesterId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: withdrawal.status },
      after: { status: DirectorWithdrawalStatus.SUBMITTED },
    });

    await this.approvals.submit({
      module: APPROVAL_MODULE,
      subjectTable: SUBJECT_TABLE,
      subjectId: id,
      amount: withdrawal.amount,
      currency: withdrawal.currency,
      requesterId,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Post to ledger (fired by the transition registry on APPROVED)
  // -------------------------------------------------------------------------

  /**
   * On co-approval: run an INFORMATIONAL funds check (never blocks — the chain has already
   * resolved APPROVED) and POST the outflow to the ledger IMMEDIATELY as
   * "Posted — Awaiting Transfer" so the cash position reflects the committed cash at once.
   * A human then performs the real bank transfer and calls complete().
   */
  private async postToLedger(id: string): Promise<void> {
    const withdrawal = await this.prisma.directorWithdrawal.findUnique({ where: { id } });
    if (!withdrawal) {
      this.logger.warn(`Ledger post skipped: director withdrawal ${id} no longer exists`);
      return;
    }
    // Idempotency guard: never double-post if the transition fires twice.
    if (withdrawal.ledgerPostedAt) {
      return;
    }

    const amount = withdrawal.amount.toNumber();

    // Pick the best-funded company account matching the withdrawal currency as the source.
    const position = await this.ledger.cashPosition();
    const suitable = position.accounts
      .filter((a) => a.currency === withdrawal.currency)
      .sort((x, y) => y.balance - x.balance);
    const source = suitable[0];
    if (!source) {
      // No account in this currency exists to post against; leave it SUBMITTED and alert.
      this.logger.warn(
        `Director withdrawal ${id} approved but no ${withdrawal.currency} account exists to post against`,
      );
      await this.notifications.send({
        userIds: await this.directorUserIds(),
        template: 'director_withdrawal.no_account',
        payload: { withdrawalId: id, currency: withdrawal.currency },
        severity: NotificationSeverity.DANGER,
        subjectTable: SUBJECT_TABLE,
        subjectId: id,
      });
      return;
    }

    // Informational funds check: record whether the source covers it, but never block.
    const fundsShort = source.balance < amount;

    const postedAt = new Date();
    // Cash paid out of the company account is a DEBIT — posted immediately on approval so the
    // cash position reflects the committed withdrawal even before the human transfer runs. The
    // balancing leg CREDITs the contra DRAWINGS account (director's equity draw).
    const drawings = await this.ledger.ensureSystemAccount(
      'DRAWINGS',
      withdrawal.currency as string,
    );
    await this.ledger.postJournal(
      [
        {
          accountId: source.accountId,
          debit: amount,
          currency: withdrawal.currency as string,
          description: `Director withdrawal (Posted — Awaiting Transfer): ${withdrawal.reason}`,
        },
        {
          accountId: drawings.id,
          credit: amount,
          currency: withdrawal.currency as string,
          description: `Director withdrawal drawings: ${withdrawal.reason}`,
        },
      ],
      {
        sourceTable: SUBJECT_TABLE,
        sourceId: id,
        entryDate: postedAt,
        createdBy: withdrawal.directorUserId,
      },
    );

    await this.prisma.directorWithdrawal.update({
      where: { id },
      data: {
        status: DirectorWithdrawalStatus.POSTED_AWAITING_TRANSFER,
        ledgerPostedAt: postedAt,
      },
    });
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: withdrawal.status },
      after: {
        status: DirectorWithdrawalStatus.POSTED_AWAITING_TRANSFER,
        accountId: source.accountId,
        ledgerPostedAt: postedAt.toISOString(),
      },
    });
    await this.notifications.send({
      userIds: await this.directorUserIds(),
      template: 'director_withdrawal.posted',
      payload: {
        withdrawalId: id,
        amount,
        currency: withdrawal.currency,
        fundsShort,
      },
      severity: fundsShort ? NotificationSeverity.WATCH : NotificationSeverity.INFO,
      subjectTable: SUBJECT_TABLE,
      subjectId: id,
    });
  }

  // -------------------------------------------------------------------------
  // Complete (human transfer recorded)
  // -------------------------------------------------------------------------

  /**
   * Record the human-performed transfer that fulfils a posted withdrawal: capture the method
   * and reference and move it to COMPLETED. Segregation of duties: the completer must differ
   * from the raising director (ForbiddenException otherwise). The ledger was already posted at
   * co-approval time, so no further ledger movement happens here.
   */
  async complete(
    id: string,
    userId: string,
    dto: CompleteDirectorWithdrawalDto,
  ): Promise<DirectorWithdrawal> {
    const withdrawal = await this.findOne(id);

    if (withdrawal.status !== DirectorWithdrawalStatus.POSTED_AWAITING_TRANSFER) {
      throw new BadRequestException(
        `Director withdrawal cannot be completed from status ${withdrawal.status}`,
      );
    }
    // Segregation of duties: whoever records the transfer cannot be the raising director.
    if (withdrawal.directorUserId === userId) {
      throw new ForbiddenException('The requester cannot record the transfer completion (SoD)');
    }

    const completedAt = new Date();
    const updated = await this.prisma.directorWithdrawal.update({
      where: { id },
      data: {
        status: DirectorWithdrawalStatus.COMPLETED,
        transferMethod: dto.transferMethod,
        transferReference: dto.transferReference,
        completedByUserId: userId,
        completedAt,
        updatedBy: userId,
      },
    });
    await this.audit.record({
      actorUserId: userId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: withdrawal.status },
      after: {
        status: DirectorWithdrawalStatus.COMPLETED,
        transferMethod: dto.transferMethod,
        transferReference: dto.transferReference,
        completedByUserId: userId,
      },
    });
    await this.notifications.send({
      userIds: [...new Set([withdrawal.directorUserId, userId])],
      template: 'director_withdrawal.completed',
      payload: { withdrawalId: id, transferReference: dto.transferReference },
      severity: NotificationSeverity.INFO,
      subjectTable: SUBJECT_TABLE,
      subjectId: id,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Nudge job: stale posted-awaiting-transfer items
  // -------------------------------------------------------------------------

  /**
   * Every POSTED_AWAITING_TRANSFER withdrawal posted to the ledger more than
   * {@link STALE_POSTED_DAYS} days ago whose human transfer still hasn't been recorded.
   * A future scheduler nudges directors to complete these; for now it is a callable method
   * (`@nestjs/schedule` is not installed in this project, so there is no real cron).
   */
  listStalePosted(now: Date = new Date()): Promise<DirectorWithdrawal[]> {
    const cutoff = new Date(now.getTime() - STALE_POSTED_DAYS * 24 * 60 * 60 * 1000);
    return this.prisma.directorWithdrawal.findMany({
      where: {
        status: DirectorWithdrawalStatus.POSTED_AWAITING_TRANSFER,
        ledgerPostedAt: { lt: cutoff },
      },
      orderBy: { ledgerPostedAt: 'asc' },
    });
  }

  /** Notify directors of every stale posted-awaiting-transfer withdrawal. Callable (no cron). */
  async nudgeStalePosted(now: Date = new Date()): Promise<{ nudged: string[] }> {
    const stale = await this.listStalePosted(now);
    if (stale.length === 0) {
      return { nudged: [] };
    }

    const directorIds = await this.directorUserIds();
    const nudged: string[] = [];

    for (const withdrawal of stale) {
      await this.notifications.send({
        userIds: [...new Set([withdrawal.directorUserId, ...directorIds])],
        template: 'director_withdrawal.stale.reminder',
        payload: {
          withdrawalId: withdrawal.id,
          amount: withdrawal.amount.toNumber(),
          currency: withdrawal.currency,
          ledgerPostedAt: withdrawal.ledgerPostedAt?.toISOString() ?? null,
        },
        severity: NotificationSeverity.WATCH,
        subjectTable: SUBJECT_TABLE,
        subjectId: withdrawal.id,
      });
      nudged.push(withdrawal.id);
    }

    return { nudged };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Mirror a terminal approval status (REJECTED/RETURNED) onto the withdrawal. */
  private async setStatus(id: string, status: DirectorWithdrawalStatus): Promise<void> {
    const withdrawal = await this.prisma.directorWithdrawal.findUnique({ where: { id } });
    if (!withdrawal) {
      return;
    }
    await this.prisma.directorWithdrawal.update({ where: { id }, data: { status } });
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: withdrawal.status },
      after: { status },
    });
  }

  /** All users holding the DIRECTOR role, for withdrawal notifications. */
  private async directorUserIds(): Promise<string[]> {
    const assignments = await this.prisma.userSiteRole.findMany({
      where: { role: 'DIRECTOR' },
      select: { userId: true },
    });
    return [...new Set(assignments.map((a) => a.userId))];
  }
}
