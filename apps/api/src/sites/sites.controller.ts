import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';
import { SitesService } from './sites.service';

@ApiTags('sites')
@ApiBearerAuth()
@Controller({ path: 'sites', version: '1' })
export class SitesController {
  constructor(private readonly sites: SitesService) {}

  @Get()
  @ApiOperation({ summary: 'List all sites (any authenticated user)' })
  list() {
    return this.sites.list();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a site' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.sites.findOne(id);
  }

  @Post()
  @Roles(Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Create a site (admin only)' })
  create(@Body() dto: CreateSiteDto, @CurrentUser('id') actorId: string) {
    return this.sites.create(dto, actorId);
  }

  @Patch(':id')
  @Roles(Role.SYS_ADMIN)
  @ApiOperation({ summary: 'Update a site (admin only)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSiteDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.sites.update(id, dto, actorId);
  }
}
