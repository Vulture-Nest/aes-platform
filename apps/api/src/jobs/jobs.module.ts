import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { DangerModule } from '../command-centre/danger/danger.module';
import { RequisitionsModule } from '../workflows/requisitions/requisitions.module';
import { TravelModule } from '../workflows/travel/travel.module';
import { ScheduledJobsService } from './scheduled-jobs.service';

/**
 * Cron scheduling. Imports the feature modules whose services own the domain logic
 * and registers the @Cron handlers. ScheduleModule.forRoot() is wired in AppModule.
 */
@Module({
  imports: [ApprovalsModule, DangerModule, RequisitionsModule, TravelModule],
  providers: [ScheduledJobsService],
})
export class JobsModule {}
