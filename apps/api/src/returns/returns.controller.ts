import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import {
  PostFromPayrollDto,
  PostVatDto,
  RemitDto,
  ReturnsHubQueryDto,
  SummaryQueryDto,
} from './dto/returns.dto';
import { ReturnsService } from './returns.service';

@ApiTags('returns')
@ApiBearerAuth()
@Controller({ path: 'returns', version: '1' })
export class ReturnsController {
  constructor(private readonly returns: ReturnsService) {}

  @Get()
  @Roles('FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN', 'DIRECTOR', 'AUDITOR')
  @ApiOperation({
    summary: 'Statutory Returns Hub for a period (one row per taxType/currency, status computed)',
  })
  hub(@Query() query: ReturnsHubQueryDto) {
    return this.returns.hub(query.period, query.entityId);
  }

  @Get('summary')
  @Roles('FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN', 'DIRECTOR', 'AUDITOR')
  @ApiOperation({ summary: 'Year-to-date + per-period statutory returns summary (JSON)' })
  summary(@Query() query: SummaryQueryDto) {
    return this.returns.summary(query.period, query.entityId);
  }

  @Post('recompute')
  @Roles('FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Persist freshly-computed status (DUE/OVERDUE/PARTIAL/PAID) for a period' })
  recompute(@Query('period') period?: string) {
    return this.returns.persistStatuses(period);
  }

  @Post('post-from-payroll')
  @Roles('FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Upsert statutory returns from approved payroll runs (idempotent)' })
  postFromPayroll(@Body() dto: PostFromPayrollDto, @CurrentUser('id') actorId: string) {
    return this.returns.postFromPayroll(dto, actorId);
  }

  @Post('post-vat')
  @Roles('FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Post the VAT statutory return for a period from the tax ledger' })
  postVat(@Body() dto: PostVatDto, @CurrentUser('id') actorId: string) {
    return this.returns.postVat(dto, actorId);
  }

  @Post(':id/remit')
  @Roles('FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Record a remittance against a return and recompute status' })
  remit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RemitDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.returns.remit(id, dto, actorId);
  }
}
