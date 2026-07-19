import { Global, Module } from '@nestjs/common';
import { AccountsController } from './accounts.controller';
import { AccountsService } from './accounts.service';
import { LedgerController } from './ledger.controller';
import { LedgerService } from './ledger.service';

/**
 * S5 shared ledger + funds foundation (spec §S5). Global so every workflow module
 * (requisitions, disbursements, travel, …) can inject LedgerService for posting money
 * movements and reading cash position / funds availability, and AccountsService for the
 * account registry.
 */
@Global()
@Module({
  controllers: [AccountsController, LedgerController],
  providers: [LedgerService, AccountsService],
  exports: [LedgerService, AccountsService],
})
export class LedgerModule {}
