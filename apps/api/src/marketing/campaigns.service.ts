import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCampaignDto,
  CreateChannelDto,
  CreateMetricDto,
  ListCampaignsQueryDto,
  UpdateCampaignDto,
  UpdateChannelDto,
} from './dto/campaign.dto';

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // Campaigns
  // -------------------------------------------------------------------------

  list(query: ListCampaignsQueryDto = {}) {
    const where: Prisma.CampaignWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    if (query.entityId) {
      where.entityId = query.entityId;
    }
    return this.prisma.campaign.findMany({ where, orderBy: { updatedAt: 'desc' } });
  }

  async findOne(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { channels: true },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  async create(dto: CreateCampaignDto, actorId: string) {
    const campaign = await this.prisma.campaign.create({
      data: {
        name: dto.name,
        entityId: dto.entityId ?? null,
        objective: dto.objective ?? null,
        audience: dto.audience ?? null,
        budget: dto.budget ?? null,
        currency: dto.currency ?? null,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        status: dto.status ?? 'PLANNED',
        ownerUserId: dto.ownerUserId ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'campaigns',
      recordId: campaign.id,
      after: { name: campaign.name, status: campaign.status },
    });
    return campaign;
  }

  async update(id: string, dto: UpdateCampaignDto, actorId: string) {
    await this.assertCampaign(id);
    const campaign = await this.prisma.campaign.update({
      where: { id },
      data: {
        name: dto.name,
        entityId: dto.entityId,
        objective: dto.objective,
        audience: dto.audience,
        budget: dto.budget,
        currency: dto.currency,
        startDate: dto.startDate,
        endDate: dto.endDate,
        status: dto.status,
        ownerUserId: dto.ownerUserId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'campaigns',
      recordId: id,
      after: { name: campaign.name, status: campaign.status },
    });
    return campaign;
  }

  // -------------------------------------------------------------------------
  // Channels (nested under a campaign)
  // -------------------------------------------------------------------------

  async listChannels(campaignId: string) {
    await this.assertCampaign(campaignId);
    return this.prisma.campaignChannel.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createChannel(campaignId: string, dto: CreateChannelDto, actorId: string) {
    await this.assertCampaign(campaignId);
    const isFlier = dto.channelType.trim().toLowerCase() === 'flier';

    let flierCode = dto.flierCode ?? null;
    let trackingLink = dto.trackingLink ?? null;
    if (isFlier) {
      if (!flierCode) {
        flierCode = await this.nextFlierCode();
      }
      if (!trackingLink) {
        trackingLink = `https://aes.co.zw/f/${flierCode}`;
      }
    }

    const channel = await this.prisma.campaignChannel.create({
      data: {
        campaignId,
        channelType: dto.channelType,
        cost: dto.cost ?? 0,
        currency: dto.currency ?? null,
        trackingLink,
        flierCode,
        printRunQty: dto.printRunQty ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'campaign_channels',
      recordId: channel.id,
      after: { campaignId, channelType: channel.channelType, flierCode: channel.flierCode },
    });
    return channel;
  }

  async updateChannel(id: string, dto: UpdateChannelDto, actorId: string) {
    await this.assertChannel(id);
    const channel = await this.prisma.campaignChannel.update({
      where: { id },
      data: {
        channelType: dto.channelType,
        cost: dto.cost,
        currency: dto.currency,
        trackingLink: dto.trackingLink,
        flierCode: dto.flierCode,
        printRunQty: dto.printRunQty,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'campaign_channels',
      recordId: id,
      after: { channelType: channel.channelType },
    });
    return channel;
  }

  async deleteChannel(id: string, actorId: string) {
    await this.assertChannel(id);
    const channel = await this.prisma.campaignChannel.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actorId,
      action: 'DELETE',
      tableName: 'campaign_channels',
      recordId: id,
      before: { channelType: channel.channelType },
    });
    return { deleted: true };
  }

  // -------------------------------------------------------------------------
  // Metrics (weekly snapshots per channel)
  // -------------------------------------------------------------------------

  async listMetrics(channelId: string) {
    await this.assertChannel(channelId);
    return this.prisma.channelMetric.findMany({
      where: { channelId },
      orderBy: { weekOf: 'desc' },
    });
  }

  async createMetric(channelId: string, dto: CreateMetricDto, actorId: string) {
    await this.assertChannel(channelId);
    const metric = await this.prisma.channelMetric.create({
      data: {
        channelId,
        weekOf: dto.weekOf,
        impressions: dto.impressions ?? 0,
        engagements: dto.engagements ?? 0,
        clicks: dto.clicks ?? 0,
        spend: dto.spend ?? 0,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'channel_metrics',
      recordId: metric.id,
      after: { channelId, weekOf: metric.weekOf },
    });
    return metric;
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** Generate the next sequential flier code, e.g. AES-FL-0007. */
  private async nextFlierCode(): Promise<string> {
    const count = await this.prisma.campaignChannel.count({
      where: { flierCode: { not: null } },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `AES-FL-${seq}`;
  }

  private async assertCampaign(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    return campaign;
  }

  private async assertChannel(id: string) {
    const channel = await this.prisma.campaignChannel.findUnique({ where: { id } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }
}
