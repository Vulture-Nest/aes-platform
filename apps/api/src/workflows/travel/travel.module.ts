import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../../approvals/approvals.module';
import { TravelController } from './travel.controller';
import { TravelService } from './travel.service';
import { TravelRatesController } from './travel-rates.controller';
import { TravelRatesService } from './travel-rates.service';

/**
 * Travel Allowances workflow (spec §8 / Prompt 6.2). Resolves per-diem from an admin rate
 * table, submits advances to the shared approval engine and reacts to terminal decisions via
 * the StatusTransitionRegistry to run the merit-first / funds-second lifecycle, plus the
 * travel-only DISBURSED -> RETIRED -> CLOSED retirement/reconciliation step. LedgerService,
 * AuditService and NotificationService are provided globally.
 */
@Module({
  imports: [ApprovalsModule],
  controllers: [TravelController, TravelRatesController],
  providers: [TravelService, TravelRatesService],
  exports: [TravelService, TravelRatesService],
})
export class TravelModule {}
