import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import {
  AddSectionDto,
  ListPeriodsQueryDto,
  OpenForMonthDto,
  OpenPeriodDto,
  SubmitReportDto,
  UpdateSectionDto,
} from './dto/site-report.dto';
import { SiteReportsService } from './site-reports.service';

const READ_ROLES = [
  'SITE_MANAGER',
  'OPS_STAFF',
  'OPS_DIRECTOR',
  'FINANCE_DIRECTOR',
  'DIRECTOR',
  'SYS_ADMIN',
  'AUDITOR',
];
const MANAGE_ROLES = ['SITE_MANAGER', 'OPS_STAFF', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN'];

@ApiTags('site-reports')
@ApiBearerAuth()
@Controller({ path: 'site-reports', version: '1' })
export class SiteReportsController {
  constructor(private readonly reports: SiteReportsService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List site report periods (filter by site/month/status)' })
  list(@Query() query: ListPeriodsQueryDto) {
    return this.reports.list(query);
  }

  @Post('open')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({ summary: 'Manually open a monthly report period for a site' })
  open(@Body() dto: OpenPeriodDto, @CurrentUser('id') actorId: string) {
    return this.reports.open(dto, actorId);
  }

  @Post('open-for-month')
  @Roles('OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Open report periods for all long-contract sites for a month' })
  openForMonth(@Body() dto: OpenForMonthDto, @CurrentUser('id') actorId: string) {
    return this.reports.openForMonth(dto, actorId);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a site report period with its sections' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.reports.findOne(id);
  }

  @Get(':id/auto-content')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({ summary: 'Preview auto-populated content (does not persist)' })
  async autoContent(@Param('id', ParseUUIDPipe) id: string) {
    const period = await this.reports.findOne(id);
    return this.reports.buildAutoContent(period.siteId, period.periodMonth);
  }

  @Post(':id/auto-populate')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({ summary: 'Auto-populate sections from timesheets/projects/finance/stores' })
  autoPopulate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.reports.autoPopulate(id, actorId);
  }

  @Post(':id/sections')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({ summary: 'Add a custom section (e.g. an extra OTHER section)' })
  addSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddSectionDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.reports.addSection(id, dto, actorId);
  }

  @Patch(':id/sections/:key')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({ summary: 'Set a section content / mark it complete' })
  updateSection(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('key') key: string,
    @Body() dto: UpdateSectionDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.reports.updateSection(id, key, dto, actorId);
  }

  @Post(':id/submit')
  @Roles('SITE_MANAGER', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Site Manager review + submit (locks & archives the report)' })
  submit(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitReportDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.reports.submit(id, dto, actorId);
  }
}
