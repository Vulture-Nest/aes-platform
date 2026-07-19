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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { ListPayrollRunsQueryDto, OpenPayrollRunDto } from './dto/payroll.dto';
import { PayrollService } from './payroll.service';

/**
 * Payroll runs (spec §13). Payroll data is privacy-restricted: mutation and detail reads are
 * limited to Finance + SysAdmin, with the Director allowed read-only. Bank account numbers are
 * masked in the run detail and every view/export is audited.
 */
@ApiTags('payroll')
@ApiBearerAuth()
@Controller({ path: 'payroll-runs', version: '1' })
export class PayrollController {
  constructor(private readonly payroll: PayrollService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({
    summary: 'Open a DRAFT payroll run for a site + month (site-approved timesheet)',
  })
  open(@Body() dto: OpenPayrollRunDto, @CurrentUser('id') preparerId: string) {
    return this.payroll.openRun(dto, preparerId);
  }

  @Post(':id/compute')
  @HttpCode(HttpStatus.OK)
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Compute (idempotent) all pay lines for a run and set it CHECKED' })
  compute(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.payroll.computeRun(id, actorId);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Submit a CHECKED run for Finance-Director approval' })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') preparerId: string) {
    return this.payroll.submit(id, preparerId);
  }

  @Get()
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'List payroll runs (optionally by site and/or month)' })
  list(@Query() query: ListPayrollRunsQueryDto) {
    return this.payroll.list(query);
  }

  @Get(':id')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Get a payroll run with its lines (bank accounts masked; audited)' })
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.payroll.findOne(id, actorId);
  }

  // ---------------------------------------------------------------------------
  // Outputs (read-only, audited) — Finance + SysAdmin only (payroll privacy).
  // ---------------------------------------------------------------------------

  @Get(':id/bank-schedule')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({
    summary: 'Per-bank, per-currency net-pay disbursement schedule (accounts masked; audited)',
  })
  bankSchedule(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.payroll.bankSchedule(id, actorId);
  }

  @Get(':id/payslips')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({
    summary: 'Per-employee payslip data — gross, statutory lines, net (JSON; accounts masked)',
  })
  payslips(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.payroll.payslips(id, actorId);
  }

  @Get(':id/sage-journal')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({
    summary: 'Sage journal rows (salaries expense, statutory liabilities, net pay payable)',
  })
  sageJournal(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.payroll.sageJournal(id, actorId);
  }

  @Get(':id/statutory-returns')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({
    summary: 'Statutory-returns summary per head (PAYE, NSSA ee+er, ZIMDEF, NEC, MIPF) with totals',
  })
  statutoryReturns(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.payroll.statutoryReturns(id, actorId);
  }
}
