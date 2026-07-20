import { Controller, Get, Param, ParseUUIDPipe, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { MoneyWindow } from '../command-centre/panels/money-in-out.service';
import { ExportFile, ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth()
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  private send(res: Response, file: ExportFile): void {
    res.set({
      'Content-Type': file.contentType,
      'Content-Disposition': `attachment; filename="${file.filename}"`,
      'Content-Length': String(file.body.length),
    });
    res.end(file.body);
  }

  @Get('financial-summary')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN')
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOperation({ summary: 'Financial summary (P&L) as XLSX' })
  async financialSummary(
    @Res() res: Response,
    @Query('currency') currency?: string,
    @Query('asOf') asOf?: string,
  ): Promise<void> {
    const file = await this.reports.financialSummaryXlsx({
      currency,
      asOf: asOf ? new Date(asOf) : undefined,
    });
    this.send(res, file);
  }

  @Get('cashflow')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN')
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOperation({ summary: 'Cashflow (money in/out) as XLSX' })
  async cashflow(
    @Res() res: Response,
    @Query('window') window?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('currency') currency?: string,
  ): Promise<void> {
    const win = Object.values(MoneyWindow).find((w) => w === window) as MoneyWindow | undefined;
    const file = await this.reports.cashflowXlsx({
      window: win,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      currency,
    });
    this.send(res, file);
  }

  @Get('timesheets/:periodId/manhours')
  @Roles(
    'SITE_MANAGER',
    'OPS_DIRECTOR',
    'FINANCE_OFFICER',
    'FINANCE_DIRECTOR',
    'DIRECTOR',
    'SYS_ADMIN',
    'AUDITOR',
  )
  @ApiProduces('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @ApiOperation({ summary: 'Timesheet-period man-hours as XLSX' })
  async manhours(
    @Param('periodId', ParseUUIDPipe) periodId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.reports.manhoursXlsx(periodId);
    this.send(res, file);
  }

  @Get('payroll/:runId/sage-journal')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiProduces('text/csv')
  @ApiOperation({ summary: 'Payroll-run Sage journal as CSV' })
  async sageJournal(
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser('id') actorId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.reports.sageJournalCsv(runId, actorId);
    this.send(res, file);
  }

  @Get('payroll/:runId/payslips')
  @Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiProduces('application/pdf')
  @ApiOperation({ summary: 'Payroll-run payslips as PDF' })
  async payslips(
    @Param('runId', ParseUUIDPipe) runId: string,
    @CurrentUser('id') actorId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.reports.payslipsPdf(runId, actorId);
    this.send(res, file);
  }
}
