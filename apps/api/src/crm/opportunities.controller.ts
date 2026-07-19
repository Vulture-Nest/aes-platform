import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import {
  ConvertOpportunityDto,
  CreateOpportunityDto,
  ListOpportunitiesQueryDto,
  MoveOpportunityDto,
  UpdateOpportunityDto,
} from './dto/opportunity.dto';
import { OpportunitiesService } from './opportunities.service';

@ApiTags('crm-opportunities')
@ApiBearerAuth()
@Controller({ path: 'crm/opportunities', version: '1' })
export class OpportunitiesController {
  constructor(private readonly opportunities: OpportunitiesService) {}

  @Get()
  @Roles(
    Role.OPS_STAFF,
    Role.OPS_DIRECTOR,
    Role.DIRECTOR,
    Role.SYS_ADMIN,
    Role.FINANCE_DIRECTOR,
    Role.AUDITOR,
  )
  @ApiOperation({ summary: 'List sales-pipeline opportunities (filter by stage/ownerUserId)' })
  list(@Query() query: ListOpportunitiesQueryDto) {
    return this.opportunities.list(query);
  }

  @Get('board')
  @Roles(
    Role.OPS_STAFF,
    Role.OPS_DIRECTOR,
    Role.DIRECTOR,
    Role.SYS_ADMIN,
    Role.FINANCE_DIRECTOR,
    Role.AUDITOR,
  )
  @ApiOperation({ summary: 'Kanban board of opportunities grouped by stage' })
  board(@Query() query: ListOpportunitiesQueryDto) {
    return this.opportunities.board(query);
  }

  @Get(':id')
  @Roles(
    Role.OPS_STAFF,
    Role.OPS_DIRECTOR,
    Role.DIRECTOR,
    Role.SYS_ADMIN,
    Role.FINANCE_DIRECTOR,
    Role.AUDITOR,
  )
  @ApiOperation({ summary: 'Get a sales-pipeline opportunity' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.opportunities.findOne(id);
  }

  @Post()
  @Roles(Role.OPS_STAFF, Role.OPS_DIRECTOR, Role.DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Create a sales-pipeline opportunity' })
  create(@Body() dto: CreateOpportunityDto, @CurrentUser('id') actorId: string) {
    return this.opportunities.create(dto, actorId);
  }

  @Patch(':id')
  @Roles(Role.OPS_STAFF, Role.OPS_DIRECTOR, Role.DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Update a sales-pipeline opportunity' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOpportunityDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.opportunities.update(id, dto, actorId);
  }

  @Post(':id/move')
  @Roles(Role.OPS_STAFF, Role.OPS_DIRECTOR, Role.DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Move an opportunity to a new pipeline stage' })
  move(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveOpportunityDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.opportunities.move(id, dto.stage, actorId, dto.lostReason);
  }

  @Post(':id/convert')
  @Roles(Role.OPS_DIRECTOR, Role.DIRECTOR, Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Convert a WON opportunity into a finance-core Order or Contract' })
  convert(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertOpportunityDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.opportunities.convert(id, dto, actorId);
  }
}
