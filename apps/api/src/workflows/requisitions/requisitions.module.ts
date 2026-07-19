import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../../approvals/approvals.module';
import { RequisitionsController } from './requisitions.controller';
import { RequisitionsService } from './requisitions.service';

/**
 * Cash Requisitions workflow (spec §8 / Prompt 6.1). Submits subjects to the shared
 * approval engine and reacts to terminal decisions via the StatusTransitionRegistry to
 * run the merit-first / funds-second lifecycle. LedgerService, AuditService and
 * NotificationService are provided globally.
 */
@Module({
  imports: [ApprovalsModule],
  controllers: [RequisitionsController],
  providers: [RequisitionsService],
  exports: [RequisitionsService],
})
export class RequisitionsModule {}
