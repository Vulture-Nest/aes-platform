import { Injectable } from '@nestjs/common';
import { OpportunityStage, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RESPONSE_STATUSES, ResponseStatus } from './dto/response.dto';

export interface CampaignFunnel {
  campaignId: string;
  name: string;
  byStatus: Record<ResponseStatus, number>;
  totalResponses: number;
}

export interface LeaderboardEntry {
  campaignId: string;
  name: string;
  totalChannelCost: number;
  totalResponses: number;
  costPerLead: number | null;
  valueWon: number;
}

export interface ChannelComparisonEntry {
  channelType: string;
  totalCost: number;
  responses: number;
  costPerResponse: number | null;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [campaigns, channels, responses, opportunities] = await Promise.all([
      this.prisma.campaign.findMany({ orderBy: { updatedAt: 'desc' } }),
      this.prisma.campaignChannel.findMany(),
      this.prisma.campaignResponse.findMany(),
      this.prisma.crmOpportunity.findMany({ where: { responseId: { not: null } } }),
    ]);

    return {
      funnel: this.buildFunnel(campaigns, responses),
      leaderboard: this.buildLeaderboard(campaigns, channels, responses, opportunities),
      channelComparison: this.buildChannelComparison(channels, responses),
    };
  }

  // -------------------------------------------------------------------------
  // Pure calculation helpers (unit-tested)
  // -------------------------------------------------------------------------

  /** Responses grouped by status, per campaign. */
  buildFunnel(
    campaigns: Array<{ id: string; name: string }>,
    responses: Array<{ campaignId: string | null; status: string }>,
  ): CampaignFunnel[] {
    return campaigns.map((campaign) => {
      const byStatus = this.emptyStatusMap();
      let totalResponses = 0;
      for (const r of responses) {
        if (r.campaignId !== campaign.id) {
          continue;
        }
        if ((RESPONSE_STATUSES as readonly string[]).includes(r.status)) {
          byStatus[r.status as ResponseStatus] += 1;
        }
        totalResponses += 1;
      }
      return { campaignId: campaign.id, name: campaign.name, byStatus, totalResponses };
    });
  }

  /**
   * Per-campaign leaderboard: cost per lead = total channel cost / responses (null
   * when there are no responses), and value won = sum of estimatedValue of attributed
   * opportunities that reached WON.
   */
  buildLeaderboard(
    campaigns: Array<{ id: string; name: string }>,
    channels: Array<{ campaignId: string; cost: Prisma.Decimal | number }>,
    responses: Array<{ campaignId: string | null }>,
    opportunities: Array<{
      campaignId: string | null;
      stage: OpportunityStage;
      estimatedValue: Prisma.Decimal | number | null;
    }>,
  ): LeaderboardEntry[] {
    return campaigns.map((campaign) => {
      const totalChannelCost = channels
        .filter((c) => c.campaignId === campaign.id)
        .reduce((sum, c) => sum + this.num(c.cost), 0);
      const totalResponses = responses.filter((r) => r.campaignId === campaign.id).length;
      const valueWon = opportunities
        .filter((o) => o.campaignId === campaign.id && o.stage === OpportunityStage.WON)
        .reduce((sum, o) => sum + this.num(o.estimatedValue), 0);
      const costPerLead =
        totalResponses > 0 ? this.round(totalChannelCost / totalResponses) : null;
      return {
        campaignId: campaign.id,
        name: campaign.name,
        totalChannelCost: this.round(totalChannelCost),
        totalResponses,
        costPerLead,
        valueWon: this.round(valueWon),
      };
    });
  }

  /**
   * Channel comparison (e.g. flier vs social): total cost, responses and
   * cost-per-response aggregated per channelType.
   */
  buildChannelComparison(
    channels: Array<{ id: string; channelType: string; cost: Prisma.Decimal | number }>,
    responses: Array<{ channelId: string | null }>,
  ): ChannelComparisonEntry[] {
    const byType = new Map<string, { totalCost: number; responses: number }>();
    const channelType = new Map<string, string>();
    for (const c of channels) {
      channelType.set(c.id, c.channelType);
      const bucket = byType.get(c.channelType) ?? { totalCost: 0, responses: 0 };
      bucket.totalCost += this.num(c.cost);
      byType.set(c.channelType, bucket);
    }
    for (const r of responses) {
      if (!r.channelId) {
        continue;
      }
      const type = channelType.get(r.channelId);
      if (!type) {
        continue;
      }
      const bucket = byType.get(type) ?? { totalCost: 0, responses: 0 };
      bucket.responses += 1;
      byType.set(type, bucket);
    }
    return [...byType.entries()].map(([type, agg]) => ({
      channelType: type,
      totalCost: this.round(agg.totalCost),
      responses: agg.responses,
      costPerResponse: agg.responses > 0 ? this.round(agg.totalCost / agg.responses) : null,
    }));
  }

  private emptyStatusMap(): Record<ResponseStatus, number> {
    return RESPONSE_STATUSES.reduce(
      (acc, s) => {
        acc[s] = 0;
        return acc;
      },
      {} as Record<ResponseStatus, number>,
    );
  }

  private num(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return typeof value === 'number' ? value : Number(value);
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
