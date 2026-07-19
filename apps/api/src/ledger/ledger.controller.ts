import { Controller, Get, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../rbac/roles.decorator';
import { LedgerService } from './ledger.service';

@ApiTags('ledger')
@ApiBearerAuth()
@Controller({ path: 'ledger', version: '1' })
export class LedgerController {
  constructor(private readonly ledger: LedgerService) {}

  @Get('cash-position')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Per-account cash/bank/wallet balances with per-currency totals' })
  cashPosition() {
    return this.ledger.cashPosition();
  }

  @Get('entries')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN', 'AUDITOR')
  @ApiOperation({ summary: 'List ledger entries, optionally filtered by account' })
  @ApiQuery({ name: 'accountId', required: false })
  listEntries(@Query('accountId', new ParseUUIDPipe({ optional: true })) accountId?: string) {
    return this.ledger.listEntries(accountId);
  }
}
