import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../../approvals/approvals.module';
import { ReferenceModule } from '../../reference/reference.module';
import { BudgetsController } from './budgets.controller';
import { BudgetsService } from './budgets.service';

/**
 * Budgets workflow (spec §10 / Prompt 6.4). A budget is submitted to the shared approval engine
 * under a PARALLEL co-approval by the Ops Director + Finance Director (both required) and becomes
 * ACTIVE only once both approve. Active budgets track actuals per line/category against
 * order_expenses + general_expenses + overheads + requisitions and warn at 85% / alert at 100%.
 * Revisions clone to a new version (a fresh approvable); Budget Change Requests reuse the same
 * dual-approval path. AuditService and NotificationService are provided globally.
 */
@Module({
  imports: [ApprovalsModule, ReferenceModule],
  controllers: [BudgetsController],
  providers: [BudgetsService],
  exports: [BudgetsService],
})
export class BudgetsModule {}
