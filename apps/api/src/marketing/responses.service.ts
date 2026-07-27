import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { OpportunityStage, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConvertResponseDto,
  CreateResponseDto,
  ListResponsesQueryDto,
  ResponseStatus,
} from './dto/response.dto';

/**
 * Allowed status transitions for an inbound campaign response/lead. A lead moves
 * forward NEW -> CONTACTED -> QUALIFIED, and may drop to DEAD from any open status.
 * DEAD may be re-opened to CONTACTED. Same-status is a no-op.
 */
const STATUS_TRANSITIONS: Record<ResponseStatus, ResponseStatus[]> = {
  NEW: ['CONTACTED', 'DEAD'],
  CONTACTED: ['QUALIFIED', 'DEAD'],
  QUALIFIED: ['DEAD'],
  DEAD: ['CONTACTED'],
};

@Injectable()
export class ResponsesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListResponsesQueryDto = {}) {
    const where: Prisma.CampaignResponseWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.campaignId) {
      where.campaignId = query.campaignId;
    }
    return this.prisma.campaignResponse.findMany({ where, orderBy: { receivedAt: 'desc' } });
  }

  async findOne(id: string) {
    const response = await this.prisma.campaignResponse.findUnique({ where: { id } });
    if (!response) {
      throw new NotFoundException('Response not found');
    }
    return response;
  }

  async create(dto: CreateResponseDto, actorId: string) {
    const response = await this.prisma.campaignResponse.create({
      data: {
        campaignId: dto.campaignId ?? null,
        channelId: dto.channelId ?? null,
        personName: dto.personName ?? null,
        orgName: dto.orgName ?? null,
        contactEmail: dto.contactEmail ?? null,
        contactPhone: dto.contactPhone ?? null,
        receivedAt: dto.receivedAt ?? new Date(),
        howHeard: dto.howHeard,
        status: 'NEW',
        ownerUserId: dto.ownerUserId ?? actorId,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'campaign_responses',
      recordId: response.id,
      after: { campaignId: response.campaignId, howHeard: response.howHeard },
    });
    return response;
  }

  /** Move a lead to a new status, enforcing the transition graph. */
  async updateStatus(id: string, status: ResponseStatus, actorId: string) {
    const before = await this.findOne(id);
    this.assertTransition(before.status as ResponseStatus, status);
    const response = await this.prisma.campaignResponse.update({
      where: { id },
      data: { status, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: 'campaign_responses',
      recordId: id,
      before: { status: before.status },
      after: { status: response.status },
    });
    return response;
  }

  /**
   * Convert a lead into a CRM opportunity. Creates a crm_opportunity carrying the
   * marketing attribution (campaignId + responseId), links responses.opportunityId
   * back, and marks the lead QUALIFIED.
   */
  async convert(id: string, dto: ConvertResponseDto, actorId: string) {
    const response = await this.findOne(id);
    if (response.opportunityId) {
      throw new BadRequestException('Response has already been converted');
    }

    const opportunity = await this.prisma.crmOpportunity.create({
      data: {
        title: dto.title,
        organisationId: dto.organisationId ?? null,
        contactId: dto.contactId ?? null,
        stage: OpportunityStage.CONTACT,
        estimatedValue: dto.estimatedValue ?? null,
        currency: dto.currency ?? null,
        ownerUserId: dto.ownerUserId ?? response.ownerUserId ?? actorId,
        campaignId: response.campaignId ?? null,
        responseId: response.id,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'crm_opportunities',
      recordId: opportunity.id,
      after: {
        title: opportunity.title,
        campaignId: opportunity.campaignId,
        responseId: opportunity.responseId,
        fromResponseId: response.id,
      },
    });

    const updated = await this.prisma.campaignResponse.update({
      where: { id },
      data: {
        opportunityId: opportunity.id,
        status: response.status === 'DEAD' ? response.status : 'QUALIFIED',
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: 'campaign_responses',
      recordId: id,
      before: { status: response.status, opportunityId: response.opportunityId },
      after: { status: updated.status, opportunityId: updated.opportunityId },
    });
    return { response: updated, opportunity };
  }

  private assertTransition(from: ResponseStatus, to: ResponseStatus) {
    if (from === to) {
      return;
    }
    if (!STATUS_TRANSITIONS[from].includes(to)) {
      throw new BadRequestException(`Cannot move a response from ${from} to ${to}`);
    }
  }
}
