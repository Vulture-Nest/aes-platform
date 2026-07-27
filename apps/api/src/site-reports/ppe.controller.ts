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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import {
  CreatePpeIssueDto,
  CreatePpeRequirementDto,
  ListPpeIssuesQueryDto,
  ListPpeRequirementsQueryDto,
  PpeComplianceQueryDto,
  UpdatePpeIssueDto,
  UpdatePpeRequirementDto,
} from './dto/ppe.dto';
import { PpeService } from './ppe.service';

const READ_ROLES = [
  'SITE_MANAGER',
  'OPS_STAFF',
  'OPS_DIRECTOR',
  'FINANCE_DIRECTOR',
  'DIRECTOR',
  'SYS_ADMIN',
  'AUDITOR',
];
const WRITE_ROLES = ['SITE_MANAGER', 'OPS_STAFF', 'OPS_DIRECTOR', 'SYS_ADMIN'];

@ApiTags('site-reports-ppe')
@ApiBearerAuth()
@Controller({ path: 'site-reports/ppe', version: '1' })
export class PpeController {
  constructor(private readonly ppe: PpeService) {}

  // --- Compliance (declared before :id-style routes) ----------------------
  @Get('compliance')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'PPE compliance % and expiring items (optionally per site)' })
  compliance(@Query() query: PpeComplianceQueryDto) {
    return this.ppe.compliance(query);
  }

  // --- Requirements -------------------------------------------------------
  @Get('requirements')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List PPE requirements' })
  listRequirements(@Query() query: ListPpeRequirementsQueryDto) {
    return this.ppe.listRequirements(query);
  }

  @Post('requirements')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Create a PPE requirement (role/employee -> item, qty, lifespan)' })
  createRequirement(@Body() dto: CreatePpeRequirementDto, @CurrentUser('id') actorId: string) {
    return this.ppe.createRequirement(dto, actorId);
  }

  @Patch('requirements/:id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Update a PPE requirement' })
  updateRequirement(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePpeRequirementDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.ppe.updateRequirement(id, dto, actorId);
  }

  @Delete('requirements/:id')
  @Roles('OPS_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Delete a PPE requirement' })
  removeRequirement(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.ppe.removeRequirement(id, actorId);
  }

  // --- Issues -------------------------------------------------------------
  @Get('issues')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List PPE issues' })
  listIssues(@Query() query: ListPpeIssuesQueryDto) {
    return this.ppe.listIssues(query);
  }

  @Post('issues')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Record a PPE issue (issue date, size, replacement-due, condition)' })
  createIssue(@Body() dto: CreatePpeIssueDto, @CurrentUser('id') actorId: string) {
    return this.ppe.createIssue(dto, actorId);
  }

  @Patch('issues/:id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Update a PPE issue' })
  updateIssue(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePpeIssueDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.ppe.updateIssue(id, dto, actorId);
  }

  @Delete('issues/:id')
  @Roles('OPS_DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Delete a PPE issue' })
  removeIssue(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.ppe.removeIssue(id, actorId);
  }
}
