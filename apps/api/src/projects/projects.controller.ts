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
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { Roles } from '../rbac/roles.decorator';
import { ProjectsService } from './projects.service';
import {
  CreateDependencyDto,
  CreateNodeDto,
  CreateProjectDto,
  ListProjectsQueryDto,
  ReorderNodesDto,
  UpdateNodeDto,
  UpdateProgressDto,
  UpdateProjectDto,
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

@ApiTags('projects')
@ApiBearerAuth()
@Controller({ path: 'projects', version: '1' })
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  // ---- Portfolio (place before :id routes) --------------------------------
  @Get('portfolio')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Portfolio view — all projects with %complete, ahead/behind days, RAG' })
  portfolio() {
    return this.projects.portfolio();
  }

  // ---- Project CRUD -------------------------------------------------------
  @Get()
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List projects (optionally filter by site/status)' })
  list(@Query() query: ListProjectsQueryDto) {
    return this.projects.list(query);
  }

  @Get(':id')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Get a project with its WBS node tree' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.findOne(id);
  }

  @Post()
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Create a project' })
  create(@Body() dto: CreateProjectDto, @CurrentUser('id') actorId: string) {
    return this.projects.create(dto, actorId);
  }

  @Patch(':id')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Update a project' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.projects.update(id, dto, actorId);
  }

  // ---- Schedule health ----------------------------------------------------
  @Get(':id/health')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'Schedule health: planned% vs actual%, days ahead/behind, RAG flag' })
  health(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.health(id);
  }

  // ---- Nodes --------------------------------------------------------------
  @Get(':id/nodes')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List the WBS nodes of a project' })
  listNodes(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.listNodes(id);
  }

  @Post(':id/nodes')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Add a phase/task/subtask node' })
  addNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateNodeDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.projects.addNode(id, dto, actorId);
  }

  @Patch(':id/nodes/reorder')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Reorder nodes (set positions to the given order)' })
  reorderNodes(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReorderNodesDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.projects.reorderNodes(id, dto, actorId);
  }

  @Patch(':id/nodes/:nodeId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Update a node (weight, dates, parent, etc.)' })
  updateNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @Body() dto: UpdateNodeDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.projects.updateNode(id, nodeId, dto, actorId);
  }

  @Delete(':id/nodes/:nodeId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Delete a node (and its subtree)' })
  deleteNode(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.projects.deleteNode(id, nodeId, actorId);
  }

  // ---- Tenant progress update (mobile-light) ------------------------------
  @Patch(':id/nodes/:nodeId/progress')
  @Roles(...READ_ROLES)
  @ApiOperation({
    summary:
      'Update node progress (members of the project site). Sets %, optional note, complete=true forces 100% and cascades to the parent.',
  })
  updateProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('nodeId', ParseUUIDPipe) nodeId: string,
    @Body() dto: UpdateProgressDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.projects.updateProgress(id, nodeId, dto, user);
  }

  // ---- Dependencies -------------------------------------------------------
  @Get(':id/dependencies')
  @Roles(...READ_ROLES)
  @ApiOperation({ summary: 'List FS dependencies of a project' })
  listDependencies(@Param('id', ParseUUIDPipe) id: string) {
    return this.projects.listDependencies(id);
  }

  @Post(':id/dependencies')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Add an FS dependency (predecessor -> successor node)' })
  addDependency(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDependencyDto,
    @CurrentUser('id') actorId: string,
  ) {
    return this.projects.addDependency(id, dto, actorId);
  }

  @Delete(':id/dependencies/:depId')
  @Roles(...WRITE_ROLES)
  @ApiOperation({ summary: 'Remove a dependency' })
  deleteDependency(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('depId', ParseUUIDPipe) depId: string,
    @CurrentUser('id') actorId: string,
  ) {
    return this.projects.deleteDependency(id, depId, actorId);
  }
}
