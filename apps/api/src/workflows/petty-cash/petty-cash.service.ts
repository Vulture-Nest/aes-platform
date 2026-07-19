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
  PettyCashFloat,
  PettyCashTxn,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notifications/notification.service';
import { ApprovalService } from '../../approvals/approval.service';
import { StatusTransitionRegistry } from '../../approvals/status-transition.registry';
import { LedgerService } from '../../ledger/ledger.service';
import { ThresholdsService } from '../../reference/thresholds/thresholds.service';
import { ExchangeRatesService } from '../../reference/exchange-rates/exchange-rates.service';
import { RateType } from '../../reference/exchange-rates/rate-type.enum';
import {
  CreateConversionDto,
  CreateFloatDto,
  CreateTopUpDto,
  CreateWithdrawalDto,
  RecordCountDto,
} from './dto/petty-cash.dto';

/** Petty-cash transaction kinds. Query-only, so a local TS enum (Prisma column is a String). */
export enum PettyCashTxnType {
  WITHDRAWAL = 'WITHDRAWAL',
  TOP_UP = 'TOP_UP',
  CONVERSION_OUT = 'CONVERSION_OUT',
  CONVERSION_IN = 'CONVERSION_IN',
}

/** Lifecycle statuses for a petty-cash txn subject. Query-only, so a local TS enum. */
export enum PettyCashTxnStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED',
  POSTED = 'POSTED',
}

/**
 * Fraction of the float amount a counted variance may reach before reconciliation locks the
 * float (default 2%). Admin-tunable later via thresholds; kept as a constant for now.
 */
const COUNT_TOLERANCE_FRACTION = 0.02;

/** The FD-approval threshold key + module name used by the approval engine. */
const FD_THRESHOLD_KEY = 'petty_cash_fd_threshold';
const APPROVAL_MODULE = 'petty_cash';
const SUBJECT_TABLE = 'petty_cash_txns';

@Injectable()
export class PettyCashService implements OnModuleInit {
  private readonly logger = new Logger(PettyCashService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly approvals: ApprovalService,
    private readonly transitions: StatusTransitionRegistry,
    private readonly ledger: LedgerService,
    private readonly thresholds: ThresholdsService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  /**
   * When an FD-approval chain for a petty-cash txn resolves, drive the txn to its next state:
   * on APPROVED post it (cash leaves / top-up moves bank -> petty cash); on REJECTED/RETURNED
   * mirror the terminal status. Withdrawals below the threshold never enter the engine.
   */
  onModuleInit(): void {
    this.transitions.registerTransition(SUBJECT_TABLE, async (subjectId, status) => {
      if (status === ApprovalStatus.APPROVED) {
        await this.postApprovedTxn(subjectId);
      } else if (status === ApprovalStatus.REJECTED) {
        await this.setTxnStatus(subjectId, PettyCashTxnStatus.REJECTED);
      } else if (status === ApprovalStatus.RETURNED) {
        await this.setTxnStatus(subjectId, PettyCashTxnStatus.RETURNED);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Floats
  // -------------------------------------------------------------------------

  /** Open a petty-cash float for a site + currency held by a custodian. */
  async createFloat(dto: CreateFloatDto, actorId: string): Promise<PettyCashFloat> {
    const float = await this.prisma.pettyCashFloat.create({
      data: {
        siteId: dto.siteId,
        currency: dto.currency,
        custodianUserId: dto.custodianUserId,
        floatAmount: new Prisma.Decimal(dto.floatAmount),
        locked: false,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'petty_cash_floats',
      recordId: float.id,
      after: {
        siteId: float.siteId,
        currency: float.currency,
        custodianUserId: float.custodianUserId,
        floatAmount: float.floatAmount.toString(),
      },
    });
    return float;
  }

  listFloats(siteId?: string): Promise<PettyCashFloat[]> {
    return this.prisma.pettyCashFloat.findMany({
      where: siteId ? { siteId } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findFloat(id: string): Promise<PettyCashFloat> {
    const float = await this.prisma.pettyCashFloat.findUnique({ where: { id } });
    if (!float) {
      throw new NotFoundException('Petty cash float not found');
    }
    return float;
  }

  listTxns(floatId: string): Promise<PettyCashTxn[]> {
    return this.prisma.pettyCashTxn.findMany({
      where: { floatId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Live float balance derived from its POSTED txns: floatAmount, minus posted withdrawals and
   * conversion-outs, plus posted top-ups and conversion-ins. Only POSTED txns move the balance.
   */
  async balance(floatId: string): Promise<number> {
    const float = await this.findFloat(floatId);
    const txns = await this.prisma.pettyCashTxn.findMany({
      where: { floatId, status: PettyCashTxnStatus.POSTED },
    });
    let balance = float.floatAmount.toNumber();
    for (const t of txns) {
      const amt = t.amount.toNumber();
      if (t.type === PettyCashTxnType.WITHDRAWAL || t.type === PettyCashTxnType.CONVERSION_OUT) {
        balance -= amt;
      } else {
        balance += amt;
      }
    }
    return balance;
  }

  // -------------------------------------------------------------------------
  // Withdrawals (threshold routing: below = SM confirm+post; at/above = FD approval)
  // -------------------------------------------------------------------------

  /**
   * Raise a withdrawal voucher against a float. THRESHOLD ROUTING:
   *   - below FD threshold: created SUBMITTED awaiting a Site Manager confirm (no cash yet).
   *   - at/above FD threshold: submitted to the approval engine (module='petty_cash'); cash
   *     only leaves after the FD approves (APPROVE FIRST, FUND SECOND).
   * A locked float (failed reconciliation) blocks all withdrawals.
   */
  async createWithdrawal(
    floatId: string,
    dto: CreateWithdrawalDto,
    actorId: string,
  ): Promise<PettyCashTxn> {
    const float = await this.findFloat(floatId);
    if (float.locked) {
      throw new ForbiddenException(
        'Float is locked pending reconciliation; withdrawals are blocked',
      );
    }

    const requiresFd = await this.atOrAboveThreshold(dto.amount, float.currency);

    const txn = await this.prisma.pettyCashTxn.create({
      data: {
        floatId,
        type: PettyCashTxnType.WITHDRAWAL,
        amount: new Prisma.Decimal(dto.amount),
        currency: float.currency,
        purpose: dto.purpose,
        orderId: dto.orderId ?? null,
        receiptKey: dto.receiptKey ?? null,
        status: PettyCashTxnStatus.SUBMITTED,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: SUBJECT_TABLE,
      recordId: txn.id,
      after: {
        type: txn.type,
        amount: txn.amount.toString(),
        currency: txn.currency,
        requiresFd,
        status: txn.status,
      },
    });

    if (requiresFd) {
      // AT/ABOVE THRESHOLD: hand to the approval engine — cash does not leave until FD approves.
      await this.approvals.submit({
        module: APPROVAL_MODULE,
        subjectTable: SUBJECT_TABLE,
        subjectId: txn.id,
        amount: txn.amount,
        currency: float.currency,
        siteId: float.siteId,
        requesterId: actorId,
      });
      return txn;
    }

    // BELOW THRESHOLD: a Site Manager confirm posts it immediately. Notify SMs at the site.
    await this.notifications.send({
      userIds: await this.roleUserIds(['SITE_MANAGER'], float.siteId, actorId),
      template: 'petty_cash.withdrawal.awaiting_confirm',
      payload: { txnId: txn.id, floatId, amount: dto.amount, currency: float.currency },
      severity: NotificationSeverity.INFO,
      subjectTable: SUBJECT_TABLE,
      subjectId: txn.id,
    });
    return txn;
  }

  /**
   * Site Manager confirm for a below-threshold withdrawal: posts it immediately. The confirmer
   * must not be the voucher raiser (segregation of duties).
   */
  async confirmWithdrawal(txnId: string, siteManagerId: string): Promise<PettyCashTxn> {
    const txn = await this.findTxn(txnId);
    if (txn.type !== PettyCashTxnType.WITHDRAWAL) {
      throw new BadRequestException('Only a withdrawal can be confirmed');
    }
    if (txn.status !== PettyCashTxnStatus.SUBMITTED) {
      throw new BadRequestException(`Withdrawal cannot be confirmed from status ${txn.status}`);
    }
    if (txn.createdBy === siteManagerId) {
      throw new ForbiddenException('The voucher raiser cannot confirm their own withdrawal (SoD)');
    }
    const float = await this.findFloat(txn.floatId);
    if (float.locked) {
      throw new ForbiddenException(
        'Float is locked pending reconciliation; withdrawals are blocked',
      );
    }
    // Guard against tampering: confirm route is for below-threshold vouchers only.
    if (await this.atOrAboveThreshold(txn.amount.toNumber(), float.currency)) {
      throw new BadRequestException(
        'Withdrawal is at/above the FD threshold and requires FD approval, not a Site Manager confirm',
      );
    }

    return this.postTxn(txn, siteManagerId, 'petty_cash.withdrawal.posted');
  }

  // -------------------------------------------------------------------------
  // Conversions (two linked legs + achieved rate + variance vs official)
  // -------------------------------------------------------------------------

  /**
   * Record a currency conversion against the float as two linked legs:
   *   - CONVERSION_OUT: `amount` of the float currency leaves the float.
   *   - CONVERSION_IN:  the received `amount * achievedRate` of the target currency comes in.
   * `varianceVsOfficial` = achievedRate - officialRate(of the day) captures conversion loss/gain.
   * At/above threshold the OUT leg is FD-approved before posting; below threshold both legs post.
   */
  async createConversion(
    floatId: string,
    dto: CreateConversionDto,
    actorId: string,
  ): Promise<{ out: PettyCashTxn; in: PettyCashTxn; varianceVsOfficial: number }> {
    const float = await this.findFloat(floatId);
    if (float.locked) {
      throw new ForbiddenException(
        'Float is locked pending reconciliation; conversions are blocked',
      );
    }
    if (dto.toCurrency === float.currency) {
      throw new BadRequestException(
        'Conversion target currency must differ from the float currency',
      );
    }

    const pair = dto.currencyPair ?? `${float.currency}/${dto.toCurrency}`;
    const official = await this.officialRate(pair);
    const achievedRate = new Prisma.Decimal(dto.achievedRate);
    const varianceVsOfficial = achievedRate.minus(official);
    const receivedAmount = achievedRate.mul(dto.amount);

    const requiresFd = await this.atOrAboveThreshold(dto.amount, float.currency);
    const legStatus = requiresFd ? PettyCashTxnStatus.SUBMITTED : PettyCashTxnStatus.POSTED;

    // Create both legs cross-referencing each other via linkedTxnId.
    const outLeg = await this.prisma.pettyCashTxn.create({
      data: {
        floatId,
        type: PettyCashTxnType.CONVERSION_OUT,
        amount: new Prisma.Decimal(dto.amount),
        currency: float.currency,
        purpose: dto.purpose ?? `Convert ${float.currency} -> ${dto.toCurrency}`,
        achievedRate,
        varianceVsOfficial,
        status: legStatus,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    const inLeg = await this.prisma.pettyCashTxn.create({
      data: {
        floatId,
        type: PettyCashTxnType.CONVERSION_IN,
        amount: receivedAmount,
        currency: dto.toCurrency,
        purpose: dto.purpose ?? `Convert ${float.currency} -> ${dto.toCurrency}`,
        achievedRate,
        varianceVsOfficial,
        linkedTxnId: outLeg.id,
        status: legStatus,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.prisma.pettyCashTxn.update({
      where: { id: outLeg.id },
      data: { linkedTxnId: inLeg.id },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: SUBJECT_TABLE,
      recordId: outLeg.id,
      after: {
        type: PettyCashTxnType.CONVERSION_OUT,
        amount: dto.amount,
        currency: float.currency,
        toCurrency: dto.toCurrency,
        achievedRate: achievedRate.toString(),
        officialRate: official.toString(),
        varianceVsOfficial: varianceVsOfficial.toString(),
        linkedTxnId: inLeg.id,
        requiresFd,
      },
    });

    if (requiresFd) {
      // Approve the OUT leg through the engine; its posting cascades to the linked IN leg.
      await this.approvals.submit({
        module: APPROVAL_MODULE,
        subjectTable: SUBJECT_TABLE,
        subjectId: outLeg.id,
        amount: outLeg.amount,
        currency: float.currency,
        siteId: float.siteId,
        requesterId: actorId,
      });
    }

    return { out: outLeg, in: inLeg, varianceVsOfficial: varianceVsOfficial.toNumber() };
  }

  // -------------------------------------------------------------------------
  // Reconciliation (periodic count; variance beyond tolerance locks withdrawals)
  // -------------------------------------------------------------------------

  /**
   * Record an in-app cash count. Variance = counted - expected(derived balance). When
   * |variance| exceeds the tolerance (fraction of the float amount) the float is LOCKED
   * (blocking withdrawals) and the FD is alerted. Within tolerance leaves the float unlocked.
   */
  async recordCount(
    floatId: string,
    dto: RecordCountDto,
    actorId: string,
  ): Promise<{
    float: PettyCashFloat;
    expected: number;
    counted: number;
    variance: number;
    locked: boolean;
  }> {
    const float = await this.findFloat(floatId);
    const expected = await this.balance(floatId);
    const counted = dto.countedAmount;
    const variance = counted - expected;
    const tolerance = float.floatAmount.toNumber() * COUNT_TOLERANCE_FRACTION;
    const beyondTolerance = Math.abs(variance) > tolerance;

    const updated = await this.prisma.pettyCashFloat.update({
      where: { id: floatId },
      data: { locked: beyondTolerance ? true : float.locked, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: 'petty_cash_floats',
      recordId: floatId,
      before: { locked: float.locked },
      after: {
        locked: updated.locked,
        expected,
        counted,
        variance,
        tolerance,
        beyondTolerance,
      },
    });

    if (beyondTolerance) {
      await this.notifications.send({
        userIds: await this.roleUserIds(['FINANCE_DIRECTOR'], float.siteId),
        template: 'petty_cash.count.variance_locked',
        payload: { floatId, expected, counted, variance, tolerance },
        severity: NotificationSeverity.DANGER,
        subjectTable: 'petty_cash_floats',
        subjectId: floatId,
      });
    }

    return { float: updated, expected, counted, variance, locked: updated.locked };
  }

  /** FD clears a lock once a counted variance has been reconciled/explained. */
  async unlockFloat(floatId: string, actorId: string): Promise<PettyCashFloat> {
    const float = await this.findFloat(floatId);
    const updated = await this.prisma.pettyCashFloat.update({
      where: { id: floatId },
      data: { locked: false, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: 'petty_cash_floats',
      recordId: floatId,
      before: { locked: float.locked },
      after: { locked: false },
    });
    return updated;
  }

  // -------------------------------------------------------------------------
  // Imprest top-up (approvable; on approval moves bank -> petty cash in the ledger)
  // -------------------------------------------------------------------------

  /**
   * Raise an imprest replenishment as an approvable TOP_UP txn. It is always FD-approved before
   * the disbursement (a human transfer) moves cash bank -> site petty cash in the ledger.
   */
  async createTopUp(floatId: string, dto: CreateTopUpDto, actorId: string): Promise<PettyCashTxn> {
    const float = await this.findFloat(floatId);
    const account = await this.prisma.account.findUnique({ where: { id: dto.sourceAccountId } });
    if (!account) {
      throw new BadRequestException('Source account not found');
    }
    if (account.currency !== float.currency) {
      throw new BadRequestException(
        `Source account currency ${account.currency} does not match float currency ${float.currency}`,
      );
    }

    // The funding (bank) account is carried on `linkedTxnId` (a Uuid slot unused by non-conversion
    // txns) so the ledger post at approval time knows which account to debit.
    const txn = await this.prisma.pettyCashTxn.create({
      data: {
        floatId,
        type: PettyCashTxnType.TOP_UP,
        amount: new Prisma.Decimal(dto.amount),
        currency: float.currency,
        purpose: dto.purpose ?? 'Imprest replenishment',
        linkedTxnId: dto.sourceAccountId,
        status: PettyCashTxnStatus.SUBMITTED,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: SUBJECT_TABLE,
      recordId: txn.id,
      after: {
        type: txn.type,
        amount: txn.amount.toString(),
        currency: txn.currency,
        sourceAccountId: dto.sourceAccountId,
        status: txn.status,
      },
    });

    await this.approvals.submit({
      module: APPROVAL_MODULE,
      subjectTable: SUBJECT_TABLE,
      subjectId: txn.id,
      amount: txn.amount,
      currency: float.currency,
      siteId: float.siteId,
      requesterId: actorId,
    });

    return txn;
  }

  // -------------------------------------------------------------------------
  // Posting (fired by the transition registry on APPROVED, or SM confirm below threshold)
  // -------------------------------------------------------------------------

  /** Drive an FD-APPROVED txn to POSTED (cash leaves / top-up moves bank -> petty cash). */
  private async postApprovedTxn(txnId: string): Promise<void> {
    const txn = await this.prisma.pettyCashTxn.findUnique({ where: { id: txnId } });
    if (!txn) {
      this.logger.warn(`Post skipped: petty-cash txn ${txnId} no longer exists`);
      return;
    }
    if (txn.status === PettyCashTxnStatus.POSTED) {
      return; // idempotent
    }
    await this.postTxn(txn, txn.createdBy ?? null, this.postedTemplate(txn.type));
  }

  /**
   * Core posting routine: set status POSTED, post the money movement to the ledger, and for a
   * conversion cascade the same posting onto its linked leg.
   */
  private async postTxn(
    txn: PettyCashTxn,
    actorId: string | null,
    template: string,
  ): Promise<PettyCashTxn> {
    const float = await this.findFloat(txn.floatId);
    const posted = await this.prisma.pettyCashTxn.update({
      where: { id: txn.id },
      data: { status: PettyCashTxnStatus.POSTED, updatedBy: actorId ?? undefined },
    });

    await this.postToLedger(txn, float, actorId);

    // Conversions: post the paired leg too (only when it is not yet posted, to stay idempotent).
    if (
      (txn.type === PettyCashTxnType.CONVERSION_OUT ||
        txn.type === PettyCashTxnType.CONVERSION_IN) &&
      txn.linkedTxnId
    ) {
      const linked = await this.prisma.pettyCashTxn.findUnique({ where: { id: txn.linkedTxnId } });
      if (linked && linked.status !== PettyCashTxnStatus.POSTED) {
        await this.prisma.pettyCashTxn.update({
          where: { id: linked.id },
          data: { status: PettyCashTxnStatus.POSTED, updatedBy: actorId ?? undefined },
        });
        await this.postToLedger(linked, float, actorId);
      }
    }

    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: txn.id,
      before: { status: txn.status },
      after: { status: PettyCashTxnStatus.POSTED },
    });
    await this.notifications.send({
      userIds: await this.roleUserIds(
        ['FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SITE_MANAGER'],
        float.siteId,
      ),
      template,
      payload: {
        txnId: txn.id,
        floatId: txn.floatId,
        type: txn.type,
        amount: txn.amount.toNumber(),
        currency: txn.currency,
      },
      severity: NotificationSeverity.INFO,
      subjectTable: SUBJECT_TABLE,
      subjectId: txn.id,
    });
    return posted;
  }

  /**
   * Post a txn's money movement to the ledger:
   *   - TOP_UP: the human transfer moves bank -> petty cash; DEBIT the source (bank) account.
   *   - WITHDRAWAL / CONVERSION_*: petty cash is not itself a ledger account here, so cash
   *     leaving/arriving in the float is tracked by the derived float balance, not double-posted.
   *     Only the TOP_UP has a bank-account leg to post.
   */
  private async postToLedger(
    txn: PettyCashTxn,
    float: PettyCashFloat,
    actorId: string | null,
  ): Promise<void> {
    if (txn.type !== PettyCashTxnType.TOP_UP) {
      return;
    }
    // The funding (bank/source) account was stashed on linkedTxnId at raise time.
    const sourceAccountId = txn.linkedTxnId;
    if (!sourceAccountId) {
      this.logger.warn(`Top-up ${txn.id} has no source account; skipping ledger post`);
      return;
    }
    await this.ledger.post([
      {
        accountId: sourceAccountId,
        debit: txn.amount.toNumber(),
        currency: float.currency as Currency,
        sourceTable: SUBJECT_TABLE,
        sourceId: txn.id,
        entryDate: new Date(),
        description: `Petty cash imprest top-up (float ${float.id})`,
        createdBy: actorId ?? undefined,
      },
    ]);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** True when `amount` is at or above the FD threshold for the currency. */
  private async atOrAboveThreshold(amount: number, currency: Currency): Promise<boolean> {
    const threshold = await this.thresholds.current(FD_THRESHOLD_KEY, currency);
    if (threshold.value == null) {
      // No numeric threshold configured => treat everything as below (SM-confirm) rather than
      // forcing FD approval on all vouchers.
      return false;
    }
    return new Prisma.Decimal(amount).greaterThanOrEqualTo(threshold.value);
  }

  /** The official rate of the day for a pair, as a Decimal. */
  private async officialRate(pair: string): Promise<Prisma.Decimal> {
    const row = await this.exchangeRates.rateAsOf(pair, new Date(), RateType.OFFICIAL);
    return new Prisma.Decimal(row.rate);
  }

  private postedTemplate(type: string): string {
    if (type === PettyCashTxnType.TOP_UP) {
      return 'petty_cash.top_up.posted';
    }
    if (type === PettyCashTxnType.CONVERSION_OUT || type === PettyCashTxnType.CONVERSION_IN) {
      return 'petty_cash.conversion.posted';
    }
    return 'petty_cash.withdrawal.posted';
  }

  private async findTxn(id: string): Promise<PettyCashTxn> {
    const txn = await this.prisma.pettyCashTxn.findUnique({ where: { id } });
    if (!txn) {
      throw new NotFoundException('Petty cash transaction not found');
    }
    return txn;
  }

  /** Mirror a terminal approval status (REJECTED/RETURNED) onto a petty-cash txn (+ its leg). */
  private async setTxnStatus(id: string, status: PettyCashTxnStatus): Promise<void> {
    const txn = await this.prisma.pettyCashTxn.findUnique({ where: { id } });
    if (!txn) {
      return;
    }
    await this.prisma.pettyCashTxn.update({ where: { id }, data: { status } });
    // Conversions: keep the linked leg in step with the OUT leg's decision.
    if (
      (txn.type === PettyCashTxnType.CONVERSION_OUT ||
        txn.type === PettyCashTxnType.CONVERSION_IN) &&
      txn.linkedTxnId
    ) {
      await this.prisma.pettyCashTxn.updateMany({
        where: { id: txn.linkedTxnId, status: { not: PettyCashTxnStatus.POSTED } },
        data: { status },
      });
    }
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: txn.status },
      after: { status },
    });
  }

  /** Users holding any of the given roles (optionally scoped to a site or global), minus `excludeId`. */
  private async roleUserIds(
    roles: string[],
    siteId?: string | null,
    excludeId?: string,
  ): Promise<string[]> {
    const assignments = await this.prisma.userSiteRole.findMany({
      where: {
        role: { in: roles as never[] },
        ...(siteId ? { OR: [{ siteId }, { siteId: null }] } : {}),
      },
      select: { userId: true },
    });
    return [...new Set(assignments.map((a) => a.userId))].filter((id) => id !== excludeId);
  }
}
