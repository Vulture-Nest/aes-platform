import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { ProjectsService } from './projects.service';
import {
  CreateTemplateDto,
  FromTemplateDto,
  UpdateTemplateDto,
} from './dto/project.dto';

const READ_ROLES = [
  'SITE_MANAGER',
  'OPS_STAFF',
  'OPS_DIRECTOR',
  'FINANCE_DIRECTOR',
  'DIRECTOR',
  'SYS_ADMIN',
  'AUDITOR',
];
const WRITE_ROLES = ['SITE_MANAGER', 'OPS_DIRECTOR', 'FINANCE_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN'];

@ApiTags('projects-templates')
@ApiBearerAuth()
@Controller({ path: 'projects/templates', version: '1' })
export class TemplatesController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List WBS templates' })
  list() {
    return this.projects.listTemplates();
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a WBS template' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.getTemplate(id);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Create a WBS template (nested structure JSON)' })
  create(@Body() dto: CreateTemplateDto, @CurrentUser('id') actorId: string) {
    return this.projects.createTemplate(dto, actorId);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Update a WBS template' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.projects.updateTemplate(id, dto, actorId);
  }

  @Delete(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Delete a WBS template' })
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') actorId: string) {
    return this.projects.deleteTemplate(id, actorId);
  }
}

@ApiTags('projects')
@ApiBearerAuth()
@Controller({ path: 'projects/from-template', version: '1' })
export class FromTemplateController {
  constructor(private readonly projects: ProjectsService) {}

  @Post(':templateId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Create a project by exploding a template structure into nodes' })
  fromTemplate(
    @Param('templateId', ParseUUIDPipe) templateId: string,
    @Body() dto: FromTemplateDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.projects.fromTemplate(templateId, dto, actorId);
  }
}
