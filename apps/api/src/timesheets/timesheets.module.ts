import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { HrModule } from '../hr/hr.module';
import { TimesheetsController } from './timesheets.controller';
import { TimesheetsService } from './timesheets.service';

/**
 * Timesheets (spec §12 / Prompt 9). Periods are submitted to the shared approval engine for
 * Site-Manager sign-off (module 'timesheet_period') and react to the terminal decision via
 * the StatusTransitionRegistry to move OPEN -> SITE_APPROVED, from where they can be LOCKED.
 * PrismaService/AuditService are global; ConfigService supplies the max-hours/day ceiling.
 */
@Module({
  imports: [ApprovalsModule, HrModule],
  controllers: [TimesheetsController],
  providers: [TimesheetsService],
  exports: [TimesheetsService],
})
export class TimesheetsModule {}
