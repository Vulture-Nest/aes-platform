import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import {
  CreateKpiDto,
  ListKpisQueryDto,
  UpdateKpiDto,
  UpsertActualDto,
  UpsertTargetDto,
} from './dto/kpi.dto';
import { PerformanceService } from './performance.service';

const READ_ROLES = [
  'SITE_MANAGER',
  'OPS_STAFF',
  'OPS_DIRECTOR',
  'FINANCE_DIRECTOR',
  'DIRECTOR',
  'SYS_ADMIN',
  'AUDITOR',
];
const MANAGE_ROLES = ['OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN'];
const ACTUAL_ROLES = ['SITE_MANAGER', 'OPS_STAFF', 'OPS_DIRECTOR', 'SYS_ADMIN'];

@ApiTags('site-reports-performance')
@ApiBearerAuth()
@Controller({ path: 'site-reports', version: '1' })
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  // --- Views (declared before KPI :id CRUD) ------------------------------
  @Get('performance')
  @Roles(...READ_ROLES)
  @ApiQuery({ name: 'siteId', required: true })
  @ApiQuery({ name: 'period', required: true, example: '2026-07' })
  @ApiOperation({ summary: 'KPI actual-vs-target with RAG + weighted score for a site & month' })
  siteperf(@Query('siteId') siteId: string, @Query('period') period: string) {
    return this.performance.performance(siteId, period);
  }

  @Get('cross-site')
  @Roles(...READ_ROLES)
  @ApiQuery({ name: 'period', required: true, example: '2026-07' })
  @ApiOperation({ summary: 'All long-contract sites side-by-side with weighted scores' })
  crossSite(@Query('period') period: string) {
    return this.performance.crossSite(period);
  }

  @Get('contract-to-date')
  @Roles(...READ_ROLES)
  @ApiQuery({ name: 'contractId', required: true })
  @ApiOperation({ summary: 'Contract-to-date accumulation of weighted scores per period' })
  contractToDate(@Query('contractId', ParseUUIDPipe) contractId: string) {
    return this.performance.contractToDate(contractId);
  }

  // --- KPI CRUD -----------------------------------------------------------
  @Get('kpis')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List KPI definitions (filter by contract/site)' })
  listKpis(@Query() query: ListKpisQueryDto) {
    return this.performance.list(query);
  }

  @Post('kpis')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({ summary: 'Create a KPI definition (key, weight, direction)' })
  createKpi(@Body() dto: CreateKpiDto, @CurrentUser('id') actorId: string) {
    return this.performance.create(dto, actorId);
  }

  @Get('kpis/:id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a KPI definition' })
  findKpi(@Param('id', ParseUUIDPipe) id: string) {
    return this.performance.findOne(id);
  }

  @Patch('kpis/:id')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({ summary: 'Update a KPI definition' })
  updateKpi(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateKpiDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.performance.update(id, dto, actorId);
  }

  @Delete('kpis/:id')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({ summary: 'Delete a KPI definition' })
  removeKpi(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.performance.remove(id, actorId);
  }

  @Post('kpis/:id/targets')
  @Roles(...MANAGE_ROLES)
  @ApiOperation({ summary: 'Set a (possibly stepped) target for a KPI' })
  upsertTarget(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertTargetDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.performance.upsertTarget(id, dto, actorId);
  }

  @Post('kpis/:id/actuals')
  @Roles(...ACTUAL_ROLES)
  @ApiOperation({ summary: 'Record a KPI actual for a month (auto-computes RAG)' })
  upsertActual(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpsertActualDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.performance.upsertActual(id, dto, actorId);
  }
}
