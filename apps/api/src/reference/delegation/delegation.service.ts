import { BadRequestException, Injectable } from '@nestjs/common';
import { DelegationRule } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDelegationDto } from './dto/delegation.dto';

@Injectable()
export class DelegationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateDelegationDto, actorId: string): Promise<DelegationRule> {
    if (dto.dateTo < dto.dateFrom) {
      throw new BadRequestException('dateTo must not be before dateFrom');
    }
    if (dto.approverUserId === dto.delegateUserId) {
      throw new BadRequestException('An approver cannot delegate to themselves');
    }
    const rule = await this.prisma.delegationRule.create({
      data: {
        approverUserId: dto.approverUserId,
        delegateUserId: dto.delegateUserId,
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
        createdBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'delegation_rules',
      recordId: rule.id,
      after: { approverUserId: dto.approverUserId, delegateUserId: dto.delegateUserId },
    });
    return rule;
  }

  list(approverUserId?: string): Promise<DelegationRule[]> {
    return this.prisma.delegationRule.findMany({
      where: approverUserId ? { approverUserId } : undefined,
      orderBy: { dateFrom: 'desc' },
    });
  }

  /**
   * Resolves the active delegate for an approver on a date, or null. Used by the
   * approval engine to substitute the alternate when a delegation window is active.
   */
  async activeDelegateFor(approverUserId: string, date = new Date()): Promise<string | null> {
    const rule = await this.prisma.delegationRule.findFirst({
      where: {
        approverUserId,
        active: true,
        dateFrom: { lte: date },
        dateTo: { gte: date },
      },
      orderBy: { dateFrom: 'desc' },
    });
    return rule?.delegateUserId ?? null;
  }

  /**
   * Reverse of {@link activeDelegateFor}: the users who have an ACTIVE delegation to
   * `delegateUserId` on `date` (i.e. the delegators this caller is currently standing in
   * for). Lets the approval engine surface a delegator's pending items to the delegate and
   * authorise the delegate to decide on the delegator's behalf.
   */
  async activeDelegatorsFor(delegateUserId: string, date = new Date()): Promise<string[]> {
    const rules = await this.prisma.delegationRule.findMany({
      where: {
        delegateUserId,
        active: true,
        dateFrom: { lte: date },
        dateTo: { gte: date },
      },
      select: { approverUserId: true },
    });
    return [...new Set(rules.map((r) => r.approverUserId))];
  }

  /**
   * All active delegate userIds for the given set of approvers on `date`. Used when
   * notifying a step's approvers so their stand-ins are told too.
   */
  async activeDelegatesForMany(approverUserIds: string[], date = new Date()): Promise<string[]> {
    if (approverUserIds.length === 0) {
      return [];
    }
    const rules = await this.prisma.delegationRule.findMany({
      where: {
        approverUserId: { in: approverUserIds },
        active: true,
        dateFrom: { lte: date },
        dateTo: { gte: date },
      },
      select: { delegateUserId: true },
    });
    return [...new Set(rules.map((r) => r.delegateUserId))];
  }
}
