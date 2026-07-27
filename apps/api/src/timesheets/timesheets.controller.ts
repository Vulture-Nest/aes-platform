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
import {
  CreateTimesheetPeriodDto,
  ListTimesheetPeriodsQueryDto,
  ReopenDto,
  ReopenRequestDto,
  UpsertEntriesDto,
} from './dto/timesheet.dto';
import { TimesheetsService } from './timesheets.service';

/**
 * Monthly timesheets (spec §12). Site clerks/managers capture the grid; a period is
 * submitted for Site-Manager approval, then locked for payroll. Payroll may only read
 * SITE_APPROVED / LOCKED periods (enforced in the service).
 */
@ApiTags('timesheets')
@ApiBearerAuth()
@Controller({ path: 'timesheet-periods', version: '1' })
export class TimesheetsController {
  constructor(private readonly timesheets: TimesheetsService) {}

  @Post()
  @Roles('SITE_CLERK', 'SITE_MANAGER', 'OPS_STAFF', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Create a monthly timesheet period for a site' })
  createPeriod(@Body() dto: CreateTimesheetPeriodDto, @CurrentUser('id') actorId: string) {
    return this.timesheets.createPeriod(dto, actorId);
  }

  @Get()
  @Roles(
    'SITE_CLERK',
    'SITE_MANAGER',
    'OPS_STAFF',
    'OPS_DIRECTOR',
    'FINANCE_OFFICER',
    'FINANCE_DIRECTOR',
    'DIRECTOR',
    'SYS_ADMIN',
    'AUDITOR',
  )
  @ApiOperation({ summary: 'List timesheet periods (optionally by site and/or month)' })
  list(@Query() query: ListTimesheetPeriodsQueryDto) {
    return this.timesheets.list(query);
  }

  @Get(':id')
  @Roles(
    'SITE_CLERK',
    'SITE_MANAGER',
    'OPS_STAFF',
    'OPS_DIRECTOR',
    'FINANCE_OFFICER',
    'FINANCE_DIRECTOR',
    'DIRECTOR',
    'SYS_ADMIN',
    'AUDITOR',
  )
  @ApiOperation({ summary: 'Get the full timesheet grid (period + entries)' })
  getGrid(@Param('id', ParseUUIDPipe) id: string) {
    return this.timesheets.getGrid(id);
  }

  @Post(':id/entries')
  @Roles('SITE_CLERK', 'SITE_MANAGER', 'OPS_STAFF', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Bulk upsert timesheet grid rows (validated; OPEN periods only)' })
  upsertEntries(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertEntriesDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.timesheets.upsertEntries(id, dto, actorId);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @Roles('SITE_CLERK', 'SITE_MANAGER', 'OPS_STAFF', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Submit the period for Site-Manager approval' })
  submit(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') requesterId: string) {
    return this.timesheets.submit(id, requesterId);
  }

  @Post(':id/lock')
  @HttpCode(HttpStatus.OK)
  @Roles('SITE_MANAGER', 'FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Lock a SITE_APPROVED period, freezing it for payroll' })
  lock(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.timesheets.lock(id, actorId);
  }

  @Post(':id/reopen-request')
  @HttpCode(HttpStatus.OK)
  @Roles('SITE_CLERK', 'SITE_MANAGER', 'OPS_STAFF', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Record an audited request to reopen a locked/approved period' })
  requestReopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenRequestDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.timesheets.requestReopen(id, dto, actorId);
  }

  @Post(':id/reopen')
  @HttpCode(HttpStatus.OK)
  @Roles('SITE_MANAGER', 'SYS_ADMIN')
  @ApiOperation({
    summary:
      'Reopen a LOCKED/SITE_APPROVED period back to OPEN (guarded against payroll-consumed; SYS_ADMIN may force)',
  })
  reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.timesheets.reopen(id, dto, actorId);
  }

  @Get(':id/manhours')
  @Roles(
    'SITE_MANAGER',
    'OPS_DIRECTOR',
    'FINANCE_OFFICER',
    'FINANCE_DIRECTOR',
    'DIRECTOR',
    'SYS_ADMIN',
    'AUDITOR',
  )
  @ApiOperation({ summary: 'Per-employee man-hour totals per category (data only; XLSX later)' })
  manhours(@Param('id', ParseUUIDPipe) id: string) {
    return this.timesheets.manhours(id);
  }
}
