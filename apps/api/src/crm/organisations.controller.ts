import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import {
  CreateOrganisationDto,
  ListOrganisationsQueryDto,
  UpdateOrganisationDto,
} from './dto/organisation.dto';
import { OrganisationsService } from './organisations.service';

@ApiTags('crm-organisations')
@ApiBearerAuth()
@Controller({ path: 'crm/organisations', version: '1' })
export class OrganisationsController {
  constructor(private readonly organisations: OrganisationsService) {}

  @Get()
  @Roles('OPS_STAFF', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN', 'FINANCE_DIRECTOR', 'AUDITOR')
  @ApiOperation({ summary: 'List CRM organisations (optionally filter by clientId)' })
  list(@Query() query: ListOrganisationsQueryDto) {
    return this.organisations.list(query);
  }

  @Get(':id')
  @Roles('OPS_STAFF', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN', 'FINANCE_DIRECTOR', 'AUDITOR')
  @ApiOperation({ summary: 'Get a CRM organisation' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.organisations.findOne(id);
  }

  @Post()
  @Roles('OPS_STAFF', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Create a CRM organisation' })
  create(@Body() dto: CreateOrganisationDto, @CurrentUser('id') actorId: string) {
    return this.organisations.create(dto, actorId);
  }

  @Patch(':id')
  @Roles('OPS_STAFF', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN')
  @ApiOperation({ summary: 'Update a CRM organisation' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateOrganisationDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.organisations.update(id, dto, actorId);
  }
}
