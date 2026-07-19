import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../../approvals/approvals.module';
import { DirectorWithdrawalsController } from './director-withdrawals.controller';
import { DirectorWithdrawalsService } from './director-withdrawals.service';

/**
 * Director Withdrawals workflow (spec §11 / Prompt 6.5). A director raises a withdrawal which
 * requires co-approval by a SECOND director (self-approval is impossible — enforced by the
 * shared approval engine). On co-approval the movement is posted to the ledger immediately as
 * "Posted — Awaiting Transfer" (so cash position reflects it at once); a human then performs
 * the actual transfer and calls complete() to record it and close the withdrawal. LedgerService,
 * AuditService and NotificationService are provided globally.
 */
@Module({
  imports: [ApprovalsModule],
  controllers: [DirectorWithdrawalsController],
  providers: [DirectorWithdrawalsService],
  exports: [DirectorWithdrawalsService],
})
export class DirectorWithdrawalsModule {}
