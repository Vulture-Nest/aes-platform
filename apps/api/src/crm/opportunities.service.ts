import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CrmOpportunity, Currency, OpportunityStage, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConvertOpportunityDto,
  ConvertTarget,
  CreateOpportunityDto,
  ListOpportunitiesQueryDto,
  UpdateOpportunityDto,
} from './dto/opportunity.dto';

/**
 * Allowed stage transitions for a sales-pipeline opportunity. A deal generally moves
 * forward, may drop to LOST from any open stage, and a LOST deal may be re-opened to
 * CONTACT. WON and LOST are terminal (WON only via move/convert). Same-stage is a no-op.
 */
const STAGE_TRANSITIONS: Record<OpportunityStage, OpportunityStage[]> = {
  [OpportunityStage.CONTACT]: [OpportunityStage.QUALIFIED, OpportunityStage.LOST],
  [OpportunityStage.QUALIFIED]: [
    OpportunityStage.PROPOSAL,
    OpportunityStage.CONTACT,
    OpportunityStage.LOST,
  ],
  [OpportunityStage.PROPOSAL]: [
    OpportunityStage.NEGOTIATION,
    OpportunityStage.QUALIFIED,
    OpportunityStage.LOST,
  ],
  [OpportunityStage.NEGOTIATION]: [
    OpportunityStage.WON,
    OpportunityStage.PROPOSAL,
    OpportunityStage.LOST,
  ],
  [OpportunityStage.WON]: [],
  [OpportunityStage.LOST]: [OpportunityStage.CONTACT],
};

const BOARD_STAGES: OpportunityStage[] = [
  OpportunityStage.CONTACT,
  OpportunityStage.QUALIFIED,
  OpportunityStage.PROPOSAL,
  OpportunityStage.NEGOTIATION,
  OpportunityStage.WON,
  OpportunityStage.LOST,
];

@Injectable()
export class OpportunitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListOpportunitiesQueryDto = {}) {
    const where: Prisma.CrmOpportunityWhereInput = {};
    if (query.stage) {
      where.stage = query.stage;
    }
    if (query.ownerUserId) {
      where.ownerUserId = query.ownerUserId;
    }
    return this.prisma.crmOpportunity.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const opportunity = await this.prisma.crmOpportunity.findUnique({ where: { id } });
    if (!opportunity) {
      throw new NotFoundException('Opportunity not found');
    }
    return opportunity;
  }

  async create(dto: CreateOpportunityDto, actorId: string) {
    const opportunity = await this.prisma.crmOpportunity.create({
      data: {
        title: dto.title,
        organisationId: dto.organisationId ?? null,
        contactId: dto.contactId ?? null,
        stage: dto.stage ?? OpportunityStage.CONTACT,
        estimatedValue: dto.estimatedValue ?? null,
        currency: dto.currency ?? null,
        ownerUserId: dto.ownerUserId ?? null,
        expectedCloseDate: dto.expectedCloseDate ?? null,
        wonAt: dto.stage === OpportunityStage.WON ? new Date() : null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'crm_opportunities',
      recordId: opportunity.id,
      after: this.snapshot(opportunity),
    });
    return opportunity;
  }

  async update(id: string, dto: UpdateOpportunityDto, actorId: string) {
    const before = await this.findOne(id);
    const opportunity = await this.prisma.crmOpportunity.update({
      where: { id },
      data: {
        title: dto.title,
        organisationId: dto.organisationId,
        contactId: dto.contactId,
        estimatedValue: dto.estimatedValue,
        currency: dto.currency,
        ownerUserId: dto.ownerUserId,
        expectedCloseDate: dto.expectedCloseDate,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'crm_opportunities',
      recordId: id,
      before: this.snapshot(before),
      after: this.snapshot(opportunity),
    });
    return opportunity;
  }

  /** Move a deal to a new stage, enforcing the transition graph. */
  async move(id: string, stage: OpportunityStage, actorId: string, lostReason?: string) {
    const before = await this.findOne(id);
    this.assertTransition(before.stage, stage);

    if (stage === OpportunityStage.LOST && !lostReason) {
      throw new BadRequestException('lostReason is required when moving to LOST');
    }

    const opportunity = await this.prisma.crmOpportunity.update({
      where: { id },
      data: {
        stage,
        wonAt: stage === OpportunityStage.WON ? (before.wonAt ?? new Date()) : before.wonAt,
        lostReason: stage === OpportunityStage.LOST ? lostReason : before.lostReason,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: 'crm_opportunities',
      recordId: id,
      before: { stage: before.stage },
      after: { stage: opportunity.stage, lostReason: opportunity.lostReason },
    });
    return opportunity;
  }

  /** Kanban view: every stage keyed to its opportunities (ordered within a stage). */
  async board(query: ListOpportunitiesQueryDto = {}) {
    const where: Prisma.CrmOpportunityWhereInput = {};
    if (query.ownerUserId) {
      where.ownerUserId = query.ownerUserId;
    }
    const opportunities = await this.prisma.crmOpportunity.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
    });
    const board = {} as Record<OpportunityStage, CrmOpportunity[]>;
    for (const stage of BOARD_STAGES) {
      board[stage] = [];
    }
    for (const opportunity of opportunities) {
      board[opportunity.stage].push(opportunity);
    }
    return board;
  }

  /**
   * One-action conversion of a WON opportunity into a real finance-core Order or
   * Contract. If the deal is not yet WON, moving to WON is attempted first (respecting
   * the transition graph). The created record's id is linked back on the opportunity
   * and the linkage is audited.
   */
  async convert(id: string, dto: ConvertOpportunityDto, actorId: string) {
    const opportunity = await this.findOne(id);

    if (opportunity.convertedOrderId || opportunity.convertedContractId) {
      throw new BadRequestException('Opportunity has already been converted');
    }

    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) {
      throw new BadRequestException('Client not found');
    }

    const value = dto.valueExVat ?? this.decimalToNumber(opportunity.estimatedValue);
    if (value === null || value === undefined) {
      throw new BadRequestException('valueExVat is required (opportunity has no estimatedValue)');
    }
    const currency = dto.currency ?? opportunity.currency ?? undefined;
    if (!currency) {
      throw new BadRequestException('currency is required (opportunity has no currency)');
    }

    if (opportunity.stage !== OpportunityStage.WON) {
      this.assertTransition(opportunity.stage, OpportunityStage.WON);
    }

    if (dto.as === ConvertTarget.ORDER) {
      return this.convertToOrder(opportunity, dto, value, currency, actorId);
    }
    return this.convertToContract(opportunity, dto, value, currency, actorId);
  }

  private async convertToOrder(
    opportunity: CrmOpportunity,
    dto: ConvertOpportunityDto,
    value: number,
    currency: Currency,
    actorId: string,
  ) {
    const order = await this.prisma.order.create({
      data: {
        clientId: dto.clientId,
        reference: dto.reference,
        valueExVat: value,
        currency,
        closingDate: dto.closingDate ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'orders',
      recordId: order.id,
      after: {
        clientId: order.clientId,
        reference: order.reference,
        valueExVat: order.valueExVat.toString(),
        currency: order.currency,
        fromOpportunityId: opportunity.id,
      },
    });

    const updated = await this.prisma.crmOpportunity.update({
      where: { id: opportunity.id },
      data: {
        stage: OpportunityStage.WON,
        wonAt: opportunity.wonAt ?? new Date(),
        convertedOrderId: order.id,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: 'crm_opportunities',
      recordId: opportunity.id,
      before: { stage: opportunity.stage, convertedOrderId: opportunity.convertedOrderId },
      after: { stage: updated.stage, convertedOrderId: updated.convertedOrderId },
    });
    return { opportunity: updated, order };
  }

  private async convertToContract(
    opportunity: CrmOpportunity,
    dto: ConvertOpportunityDto,
    value: number,
    currency: Currency,
    actorId: string,
  ) {
    if (!dto.startDate || !dto.endDate) {
      throw new BadRequestException('startDate and endDate are required to convert to a CONTRACT');
    }
    const contract = await this.prisma.contract.create({
      data: {
        clientId: dto.clientId,
        reference: dto.reference,
        valueExVat: value,
        currency,
        startDate: dto.startDate,
        endDate: dto.endDate,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'contracts',
      recordId: contract.id,
      after: {
        clientId: contract.clientId,
        reference: contract.reference,
        valueExVat: contract.valueExVat.toString(),
        currency: contract.currency,
        status: contract.status,
        fromOpportunityId: opportunity.id,
      },
    });

    const updated = await this.prisma.crmOpportunity.update({
      where: { id: opportunity.id },
      data: {
        stage: OpportunityStage.WON,
        wonAt: opportunity.wonAt ?? new Date(),
        convertedContractId: contract.id,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: 'crm_opportunities',
      recordId: opportunity.id,
      before: { stage: opportunity.stage, convertedContractId: opportunity.convertedContractId },
      after: { stage: updated.stage, convertedContractId: updated.convertedContractId },
    });
    return { opportunity: updated, contract };
  }

  private assertTransition(from: OpportunityStage, to: OpportunityStage) {
    if (from === to) {
      return;
    }
    if (!STAGE_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(`Cannot move an opportunity from ${from} to ${to}`);
    }
  }

  private decimalToNumber(value: Prisma.Decimal | null): number | null {
    return value === null ? null : Number(value);
  }

  private snapshot(opportunity: CrmOpportunity) {
    return {
      title: opportunity.title,
      stage: opportunity.stage,
      organisationId: opportunity.organisationId,
      contactId: opportunity.contactId,
      estimatedValue: this.decimalToNumber(opportunity.estimatedValue),
      currency: opportunity.currency,
      ownerUserId: opportunity.ownerUserId,
    };
  }
}
