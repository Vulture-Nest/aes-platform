import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { ContactsController } from './contacts.controller';
import { ContactsService } from './contacts.service';
import { InteractionsController } from './interactions.controller';
import { InteractionsService } from './interactions.service';
import { OpportunitiesController } from './opportunities.controller';
import { OpportunitiesService } from './opportunities.service';
import { OrganisationsController } from './organisations.controller';
import { OrganisationsService } from './organisations.service';

/**
 * CRM core (spec §17 / Prompt 12). A lightweight business-development pipeline:
 * organisations, their contacts, logged interactions (calls/visits/emails/tenders/
 * meetings) and the sales pipeline of opportunities (with Won->Order/Contract
 * conversion). AuditService, NotificationService and PrismaService are global.
 */
@Module({
  controllers: [
    OrganisationsController,
    ContactsController,
    InteractionsController,
    OpportunitiesController,
    AnalyticsController,
  ],
  providers: [
    OrganisationsService,
    ContactsService,
    InteractionsService,
    OpportunitiesService,
    AnalyticsService,
  ],
  exports: [
    OrganisationsService,
    ContactsService,
    InteractionsService,
    OpportunitiesService,
    AnalyticsService,
  ],
})
export class CrmModule {}
