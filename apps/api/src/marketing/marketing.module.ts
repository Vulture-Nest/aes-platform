import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { ResponsesController } from './responses.controller';
import { ResponsesService } from './responses.service';

/**
 * BD / Marketing (Additional Features — Prompt 27). Campaigns, delivery channels,
 * weekly channel metrics and inbound responses (leads) with CRM-opportunity
 * attribution (campaignId + responseId). Analytics roll up a per-campaign funnel,
 * a cost-per-lead / value-won leaderboard and a per-channelType comparison.
 * PrismaService and AuditService are global.
 */
@Module({
  controllers: [CampaignsController, ResponsesController, AnalyticsController],
  providers: [CampaignsService, ResponsesService, AnalyticsService],
  exports: [CampaignsService, ResponsesService, AnalyticsService],
})
export class MarketingModule {}
