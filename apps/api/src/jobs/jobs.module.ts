import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../approvals/approvals.module';
import { DangerModule } from '../command-centre/danger/danger.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { FinancialModule } from '../financial/financial.module';
import { ReferenceModule } from '../reference/reference.module';
import { LoanInterestAccrualService } from '../financial/domain/loan-interest-accrual.service';
import { OrderHealthRecalcService } from '../financial/domain/order-health-recalc.service';
import { ZimraInterestAccrualService } from '../financial/domain/zimra-interest-accrual.service';
import { DirectorWithdrawalsModule } from '../workflows/director-withdrawals/director-withdrawals.module';
import { RequisitionsModule } from '../workflows/requisitions/requisitions.module';
import { TravelModule } from '../workflows/travel/travel.module';
import { ScheduledJobsService } from './scheduled-jobs.service';

/**
 * Cron scheduling. Imports the feature modules whose services own the domain logic
 * and registers the @Cron handlers. ScheduleModule.forRoot() is wired in AppModule.
 *
 * The three accrual/recalc job services (G9) are declared HERE rather than in
 * FinancialModule because they depend on AlertService (DangerModule) and DangerModule
 * already imports FinancialModule — declaring them in FinancialModule would form an
 * import cycle. They pull the pure Appendix-A domain services from FinancialModule and
 * the effective-dated rate lookups from ReferenceModule.
 */
@Module({
  imports: [
    ApprovalsModule,
    DangerModule,
    ComplianceModule,
    RequisitionsModule,
    TravelModule,
    DirectorWithdrawalsModule,
    FinancialModule,
    ReferenceModule,
  ],
  providers: [
    ScheduledJobsService,
    LoanInterestAccrualService,
    ZimraInterestAccrualService,
    OrderHealthRecalcService,
  ],
})
export class JobsModule {}
