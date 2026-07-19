import { Module } from '@nestjs/common';
import { ApprovalsModule } from '../../approvals/approvals.module';
import { ReferenceModule } from '../../reference/reference.module';
import { PettyCashController } from './petty-cash.controller';
import { PettyCashService } from './petty-cash.service';

/**
 * Petty Cash workflow (spec §9 / Prompt 6.3). A float is held per site + currency by a
 * custodian; withdrawals route on the FD threshold (below = Site Manager confirm + immediate
 * post, at/above = FD approval via the shared engine before cash leaves). Conversions record
 * two linked legs with the achieved rate and its variance vs the official rate of the day.
 * Reconciliation counts lock the float on out-of-tolerance variance, and imprest top-ups are
 * approvable items that move bank -> petty cash in the ledger on approval.
 *
 * Imports ApprovalsModule (ApprovalService + StatusTransitionRegistry) and ReferenceModule
 * (ThresholdsService + ExchangeRatesService). LedgerService, AuditService, NotificationService
 * and PrismaService are provided globally.
 */
@Module({
  imports: [ApprovalsModule, ReferenceModule],
  controllers: [PettyCashController],
  providers: [PettyCashService],
  exports: [PettyCashService],
})
export class PettyCashModule {}
