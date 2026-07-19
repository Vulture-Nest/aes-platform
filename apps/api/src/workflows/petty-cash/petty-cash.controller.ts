import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../rbac/roles.decorator';
import {
  CreateConversionDto,
  CreateFloatDto,
  CreateTopUpDto,
  CreateWithdrawalDto,
  RecordCountDto,
} from './dto/petty-cash.dto';
import { PettyCashService } from './petty-cash.service';

@ApiTags('petty-cash')
@ApiBearerAuth()
@Controller({ path: 'petty-cash', version: '1' })
export class PettyCashController {
  constructor(private readonly pettyCash: PettyCashService) {}

  // ---- Floats ------------------------------------------------------------

  @Post('floats')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Open a petty-cash float for a site + currency with a custodian' })
  createFloat(@Body() dto: CreateFloatDto, @CurrentUser('id') actorId: string) {
    return this.pettyCash.createFloat(dto, actorId);
  }

  @Get('floats')
  @Roles(
    'SITE_CLERK',
    'SITE_MANAGER',
    'OPS_STAFF',
    'FINANCE_OFFICER',
    'FINANCE_DIRECTOR',
    'OPS_DIRECTOR',
    'DIRECTOR',
    'SYS_ADMIN',
    'AUDITOR',
  )
  @ApiOperation({ summary: 'List petty-cash floats (optionally filtered by site)' })
  @ApiQuery({ name: 'siteId', required: false })
  listFloats(@Query('siteId') siteId?: string) {
    return this.pettyCash.listFloats(siteId);
  }

  @Get('floats/:id/txns')
  @Roles(
    'SITE_CLERK',
    'SITE_MANAGER',
    'OPS_STAFF',
    'FINANCE_OFFICER',
    'FINANCE_DIRECTOR',
    'OPS_DIRECTOR',
    'DIRECTOR',
    'SYS_ADMIN',
    'AUDITOR',
  )
  @ApiOperation({ summary: 'List the transactions on a float' })
  listTxns(@Param('id', ParseUUIDPipe) id: string) {
    return this.pettyCash.listTxns(id);
  }

  // ---- Withdrawals (threshold-routed) ------------------------------------

  @Post('floats/:id/withdrawals')
  @Roles('SITE_CLERK', 'SITE_MANAGER', 'OPS_STAFF')
  @ApiOperation({
    summary:
      'Raise a petty-cash withdrawal voucher (below threshold: SM confirm; at/above: FD approval)',
  })
  createWithdrawal(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateWithdrawalDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.pettyCash.createWithdrawal(id, dto, actorId);
  }

  @Post('withdrawals/:txnId/confirm')
  @HttpCode(HttpStatus.OK)
  @Roles('SITE_MANAGER')
  @ApiOperation({
    summary: 'Site Manager confirm of a below-threshold withdrawal (posts it immediately)',
  })
  confirmWithdrawal(
    @Param('txnId', ParseUUIDPipe) txnId: string,
    @CurrentUser('id') siteManagerId: string,
  ) {
    return this.pettyCash.confirmWithdrawal(txnId, siteManagerId);
  }

  // ---- Conversions -------------------------------------------------------

  @Post('floats/:id/conversions')
  @Roles('SITE_MANAGER', 'FINANCE_OFFICER', 'FINANCE_DIRECTOR')
  @ApiOperation({
    summary: 'Record a currency conversion as two linked legs with variance vs official',
  })
  createConversion(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateConversionDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.pettyCash.createConversion(id, dto, actorId);
  }

  // ---- Reconciliation ----------------------------------------------------

  @Post('floats/:id/count')
  @HttpCode(HttpStatus.OK)
  @Roles('SITE_MANAGER', 'FINANCE_OFFICER', 'FINANCE_DIRECTOR')
  @ApiOperation({
    summary: 'Record a cash count; variance beyond tolerance locks the float and alerts FD',
  })
  recordCount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordCountDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.pettyCash.recordCount(id, dto, actorId);
  }

  @Post('floats/:id/unlock')
  @HttpCode(HttpStatus.OK)
  @Roles('FINANCE_DIRECTOR')
  @ApiOperation({ summary: 'FD clears a reconciliation lock on a float' })
  unlockFloat(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.pettyCash.unlockFloat(id, actorId);
  }

  // ---- Imprest top-up ----------------------------------------------------

  @Post('floats/:id/top-up')
  @Roles('SITE_MANAGER', 'FINANCE_OFFICER', 'FINANCE_DIRECTOR')
  @ApiOperation({
    summary:
      'Raise an imprest top-up (approvable; on approval moves bank -> petty cash in the ledger)',
  })
  createTopUp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateTopUpDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.pettyCash.createTopUp(id, dto, actorId);
  }
}
