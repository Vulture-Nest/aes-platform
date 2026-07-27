import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, ProjectNode } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import {
  CreateDependencyDto,
  CreateNodeDto,
  CreateProjectDto,
  CreateTemplateDto,
  FromTemplateDto,
  ListProjectsQueryDto,
  ReorderNodesDto,
  UpdateNodeDto,
  UpdateProgressDto,
  UpdateProjectDto,
  UpdateTemplateDto,
} from './dto/project.dto';
import {
  flattenTemplate,
  projectPercent,
  rollUp,
  RollUpNode,
  scheduleHealth,
} from './wbs.logic';

/** Default RAG red threshold (% behind schedule). Command-centre reads `slip` off this. */
const DEFAULT_RED_THRESHOLD = 10;
const DEFAULT_AMBER_THRESHOLD = 5;

@Injectable()
export class ProjectsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private toNum(d: Prisma.Decimal | number | null | undefined): number {
    if (d === null || d === undefined) return 0;
    return typeof d === 'number' ? d : d.toNumber();
  }

  private toRollUpNodes(nodes: ProjectNode[]): RollUpNode[] {
    return nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId ?? null,
      weight: this.toNum(n.weight),
      percentComplete: this.toNum(n.percentComplete),
    }));
  }

  // -------------------------------------------------------------------------
  // Project CRUD
  // -------------------------------------------------------------------------
  list(query: ListProjectsQueryDto = {}) {
    return this.prisma.project.findMany({
      where: {
        ...(query.siteId ? { siteId: query.siteId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const project = await this.prisma.project.findUnique({
      where: { id },
      include: { nodes: { orderBy: [{ parentId: 'asc' }, { position: 'asc' }] } },
    });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async create(dto: CreateProjectDto, actorId: string) {
    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        siteId: dto.siteId ?? null,
        entityId: dto.entityId ?? null,
        contractId: dto.contractId ?? null,
        orderId: dto.orderId ?? null,
        ownerUserId: dto.ownerUserId ?? null,
        status: dto.status ?? 'ACTIVE',
        plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : null,
        plannedFinish: dto.plannedFinish ? new Date(dto.plannedFinish) : null,
        actualStart: dto.actualStart ? new Date(dto.actualStart) : null,
        actualFinish: dto.actualFinish ? new Date(dto.actualFinish) : null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'projects',
      recordId: project.id,
      after: { name: project.name, siteId: project.siteId, status: project.status },
    });
    return project;
  }

  async update(id: string, dto: UpdateProjectDto, actorId: string) {
    const before = await this.prisma.project.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Project not found');
    const project = await this.prisma.project.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.siteId !== undefined ? { siteId: dto.siteId } : {}),
        ...(dto.entityId !== undefined ? { entityId: dto.entityId } : {}),
        ...(dto.contractId !== undefined ? { contractId: dto.contractId } : {}),
        ...(dto.orderId !== undefined ? { orderId: dto.orderId } : {}),
        ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
        ...(dto.plannedStart !== undefined
          ? { plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : null }
          : {}),
        ...(dto.plannedFinish !== undefined
          ? { plannedFinish: dto.plannedFinish ? new Date(dto.plannedFinish) : null }
          : {}),
        ...(dto.actualStart !== undefined
          ? { actualStart: dto.actualStart ? new Date(dto.actualStart) : null }
          : {}),
        ...(dto.actualFinish !== undefined
          ? { actualFinish: dto.actualFinish ? new Date(dto.actualFinish) : null }
          : {}),
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'projects',
      recordId: id,
      before: { name: before.name, status: before.status },
      after: { name: project.name, status: project.status },
    });
    return project;
  }

  // -------------------------------------------------------------------------
  // Node CRUD
  // -------------------------------------------------------------------------
  async listNodes(projectId: string) {
    await this.assertProjectExists(projectId);
    return this.prisma.projectNode.findMany({
      where: { projectId },
      orderBy: [{ parentId: 'asc' }, { position: 'asc' }],
    });
  }

  private async assertProjectExists(projectId: string) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    return project;
  }

  async addNode(projectId: string, dto: CreateNodeDto, actorId: string) {
    await this.assertProjectExists(projectId);
    if (dto.parentId) {
      const parent = await this.prisma.projectNode.findFirst({
        where: { id: dto.parentId, projectId },
      });
      if (!parent) throw new BadRequestException('Parent node not found in this project');
    }
    // Default position = end of sibling list.
    let position = dto.position;
    if (position === undefined) {
      const count = await this.prisma.projectNode.count({
        where: { projectId, parentId: dto.parentId ?? null },
      });
      position = count;
    }
    const node = await this.prisma.projectNode.create({
      data: {
        projectId,
        parentId: dto.parentId ?? null,
        type: dto.type,
        title: dto.title,
        ownerUserId: dto.ownerUserId ?? null,
        weight: dto.weight !== undefined ? new Prisma.Decimal(dto.weight) : new Prisma.Decimal(1),
        position,
        plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : null,
        plannedFinish: dto.plannedFinish ? new Date(dto.plannedFinish) : null,
        actualStart: dto.actualStart ? new Date(dto.actualStart) : null,
        actualFinish: dto.actualFinish ? new Date(dto.actualFinish) : null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'project_nodes',
      recordId: node.id,
      after: { projectId, type: node.type, title: node.title, parentId: node.parentId },
    });
    await this.recomputeProject(projectId, actorId);
    return node;
  }

  async updateNode(projectId: string, nodeId: string, dto: UpdateNodeDto, actorId: string) {
    const before = await this.prisma.projectNode.findFirst({ where: { id: nodeId, projectId } });
    if (!before) throw new NotFoundException('Node not found');
    if (dto.parentId && dto.parentId !== before.parentId) {
      if (dto.parentId === nodeId) throw new BadRequestException('A node cannot be its own parent');
      const parent = await this.prisma.projectNode.findFirst({
        where: { id: dto.parentId, projectId },
      });
      if (!parent) throw new BadRequestException('Parent node not found in this project');
    }
    const node = await this.prisma.projectNode.update({
      where: { id: nodeId },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        ...(dto.ownerUserId !== undefined ? { ownerUserId: dto.ownerUserId } : {}),
        ...(dto.weight !== undefined ? { weight: new Prisma.Decimal(dto.weight) } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
        ...(dto.plannedStart !== undefined
          ? { plannedStart: dto.plannedStart ? new Date(dto.plannedStart) : null }
          : {}),
        ...(dto.plannedFinish !== undefined
          ? { plannedFinish: dto.plannedFinish ? new Date(dto.plannedFinish) : null }
          : {}),
        ...(dto.actualStart !== undefined
          ? { actualStart: dto.actualStart ? new Date(dto.actualStart) : null }
          : {}),
        ...(dto.actualFinish !== undefined
          ? { actualFinish: dto.actualFinish ? new Date(dto.actualFinish) : null }
          : {}),
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'project_nodes',
      recordId: nodeId,
      before: { title: before.title, weight: this.toNum(before.weight) },
      after: { title: node.title, weight: this.toNum(node.weight) },
    });
    await this.recomputeProject(projectId, actorId);
    return node;
  }

  async deleteNode(projectId: string, nodeId: string, actorId: string) {
    const node = await this.prisma.projectNode.findFirst({ where: { id: nodeId, projectId } });
    if (!node) throw new NotFoundException('Node not found');
    await this.prisma.projectNode.delete({ where: { id: nodeId } });
    await this.audit.record({
      actorUserId: actorId,
      action: 'DELETE',
      tableName: 'project_nodes',
      recordId: nodeId,
      before: { title: node.title, projectId },
    });
    await this.recomputeProject(projectId, actorId);
    return { deleted: true };
  }

  async reorderNodes(projectId: string, dto: ReorderNodesDto, actorId: string) {
    await this.assertProjectExists(projectId);
    const nodes = await this.prisma.projectNode.findMany({
      where: { id: { in: dto.nodeIds }, projectId },
      select: { id: true },
    });
    if (nodes.length !== dto.nodeIds.length) {
      throw new BadRequestException('One or more nodes do not belong to this project');
    }
    await this.prisma.$transaction(
      dto.nodeIds.map((id, position) =>
        this.prisma.projectNode.update({
          where: { id },
          data: { position, updatedBy: actorId },
        }),
      ),
    );
    return this.listNodes(projectId);
  }

  // -------------------------------------------------------------------------
  // Tenant progress update (mobile-light)
  // -------------------------------------------------------------------------
  async updateProgress(
    projectId: string,
    nodeId: string,
    dto: UpdateProgressDto,
    user: AuthenticatedUser,
  ) {
    const project = await this.assertProjectExists(projectId);
    this.assertSiteMember(project.siteId, user);

    const node = await this.prisma.projectNode.findFirst({ where: { id: nodeId, projectId } });
    if (!node) throw new NotFoundException('Node not found');

    let percent = node.percentComplete;
    if (dto.percentComplete !== undefined) {
      percent = new Prisma.Decimal(dto.percentComplete);
    }
    const markComplete = dto.complete === true;
    if (markComplete) percent = new Prisma.Decimal(100);

    await this.prisma.projectNode.update({
      where: { id: nodeId },
      data: {
        percentComplete: percent,
        ...(markComplete && !node.actualFinish ? { actualFinish: new Date() } : {}),
        ...(this.toNum(percent) > 0 && !node.actualStart ? { actualStart: new Date() } : {}),
        updatedBy: user.id,
      },
    });

    if (dto.note && dto.note.trim().length > 0) {
      await this.prisma.projectNodeNote.create({
        data: { nodeId, authorId: user.id, body: dto.note.trim() },
      });
    }

    await this.audit.record({
      actorUserId: user.id,
      action: 'UPDATE',
      tableName: 'project_nodes',
      recordId: nodeId,
      before: { percentComplete: this.toNum(node.percentComplete) },
      after: { percentComplete: this.toNum(percent), complete: markComplete },
    });

    // Cascade: completing the last remaining sibling completes the parent.
    if (markComplete && node.parentId) {
      await this.cascadeComplete(projectId, node.parentId, user.id);
    }

    await this.recomputeProject(projectId, user.id);
    return this.findOne(projectId);
  }

  /** If all children of `parentId` are 100%, set the parent to 100% and recurse upward. */
  private async cascadeComplete(projectId: string, parentId: string, actorId: string) {
    let currentParentId: string | null = parentId;
    while (currentParentId) {
      const children = await this.prisma.projectNode.findMany({
        where: { projectId, parentId: currentParentId },
        select: { percentComplete: true },
      });
      const allComplete =
        children.length > 0 && children.every((c) => this.toNum(c.percentComplete) >= 100);
      if (!allComplete) break;
      const parent: { parentId: string | null } = await this.prisma.projectNode.update({
        where: { id: currentParentId },
        data: {
          percentComplete: new Prisma.Decimal(100),
          actualFinish: new Date(),
          updatedBy: actorId,
        },
        select: { parentId: true },
      });
      currentParentId = parent.parentId;
    }
  }

  private assertSiteMember(siteId: string | null, user: AuthenticatedUser) {
    // A global-role user (siteId null) is a member of every site.
    const hasGlobal = user.roles.some((r) => r.siteId === null);
    if (hasGlobal) return;
    // Site-scoped projects: user must hold a role for that site.
    if (siteId && user.roles.some((r) => r.siteId === siteId)) return;
    // Shared/global project (no site): any authenticated role may update.
    if (!siteId && user.roles.length > 0) return;
    throw new ForbiddenException('You are not a member of this project site');
  }

  // -------------------------------------------------------------------------
  // Roll-up (weighted average up the tree + onto the project)
  // -------------------------------------------------------------------------
  /** Recompute every node's rolled-up percent and the project percent; persist changes. */
  async recomputeProject(projectId: string, actorId: string) {
    const nodes = await this.prisma.projectNode.findMany({ where: { projectId } });
    const flat = this.toRollUpNodes(nodes);
    const rolled = rollUp(flat);

    // Persist any node whose rolled-up percent differs from stored (parents only change).
    const updates = nodes
      .filter((n) => {
        const isLeaf = !nodes.some((c) => c.parentId === n.id);
        if (isLeaf) return false; // leaves keep their own entered percent
        return this.toNum(n.percentComplete) !== rolled[n.id];
      })
      .map((n) =>
        this.prisma.projectNode.update({
          where: { id: n.id },
          data: { percentComplete: new Prisma.Decimal(rolled[n.id]), updatedBy: actorId },
        }),
      );
    if (updates.length > 0) await this.prisma.$transaction(updates);

    const pct = projectPercent(flat, rolled);
    await this.prisma.project.update({
      where: { id: projectId },
      data: { percentComplete: new Prisma.Decimal(pct), updatedBy: actorId },
    });
    return pct;
  }

  // -------------------------------------------------------------------------
  // Schedule health
  // -------------------------------------------------------------------------
  async health(projectId: string, asOf: Date = new Date()) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) throw new NotFoundException('Project not found');
    const h = scheduleHealth({
      plannedStart: project.plannedStart,
      plannedFinish: project.plannedFinish,
      actualPercent: this.toNum(project.percentComplete),
      asOf,
      redThreshold: DEFAULT_RED_THRESHOLD,
      amberThreshold: DEFAULT_AMBER_THRESHOLD,
    });
    return {
      projectId: project.id,
      name: project.name,
      siteId: project.siteId,
      status: project.status,
      ...h,
    };
  }

  async portfolio(asOf: Date = new Date()) {
    const projects = await this.prisma.project.findMany({ orderBy: { createdAt: 'desc' } });
    return projects.map((project) => {
      const h = scheduleHealth({
        plannedStart: project.plannedStart,
        plannedFinish: project.plannedFinish,
        actualPercent: this.toNum(project.percentComplete),
        asOf,
        redThreshold: DEFAULT_RED_THRESHOLD,
        amberThreshold: DEFAULT_AMBER_THRESHOLD,
      });
      return {
        projectId: project.id,
        name: project.name,
        siteId: project.siteId,
        status: project.status,
        percentComplete: this.toNum(project.percentComplete),
        ...h,
      };
    });
  }

  // -------------------------------------------------------------------------
  // Dependencies (FS predecessor -> successor)
  // -------------------------------------------------------------------------
  async listDependencies(projectId: string) {
    await this.assertProjectExists(projectId);
    return this.prisma.projectDependency.findMany({ where: { projectId } });
  }

  async addDependency(projectId: string, dto: CreateDependencyDto, actorId: string) {
    await this.assertProjectExists(projectId);
    if (dto.predecessorNodeId === dto.successorNodeId) {
      throw new BadRequestException('A node cannot depend on itself');
    }
    const nodes = await this.prisma.projectNode.findMany({
      where: { id: { in: [dto.predecessorNodeId, dto.successorNodeId] }, projectId },
      select: { id: true },
    });
    if (nodes.length !== 2) {
      throw new BadRequestException('Both nodes must belong to this project');
    }
    const dep = await this.prisma.projectDependency.create({
      data: {
        projectId,
        predecessorNodeId: dto.predecessorNodeId,
        successorNodeId: dto.successorNodeId,
        depType: dto.depType ?? 'FS',
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'project_dependencies',
      recordId: dep.id,
      after: { predecessorNodeId: dep.predecessorNodeId, successorNodeId: dep.successorNodeId },
    });
    return dep;
  }

  async deleteDependency(projectId: string, depId: string, actorId: string) {
    const dep = await this.prisma.projectDependency.findFirst({
      where: { id: depId, projectId },
    });
    if (!dep) throw new NotFoundException('Dependency not found');
    await this.prisma.projectDependency.delete({ where: { id: depId } });
    await this.audit.record({
      actorUserId: actorId,
      action: 'DELETE',
      tableName: 'project_dependencies',
      recordId: depId,
    });
    return { deleted: true };
  }

  // -------------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------------
  listTemplates() {
    return this.prisma.wbsTemplate.findMany({ orderBy: { name: 'asc' } });
  }

  async getTemplate(id: string) {
    const tpl = await this.prisma.wbsTemplate.findUnique({ where: { id } });
    if (!tpl) throw new NotFoundException('Template not found');
    return tpl;
  }

  async createTemplate(dto: CreateTemplateDto, actorId: string) {
    return this.prisma.wbsTemplate.create({
      data: {
        name: dto.name,
        entityId: dto.entityId ?? null,
        jobType: dto.jobType ?? null,
        structure: dto.structure as Prisma.InputJsonValue,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  async updateTemplate(id: string, dto: UpdateTemplateDto, actorId: string) {
    await this.getTemplate(id);
    return this.prisma.wbsTemplate.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.entityId !== undefined ? { entityId: dto.entityId } : {}),
        ...(dto.jobType !== undefined ? { jobType: dto.jobType } : {}),
        ...(dto.structure !== undefined
          ? { structure: dto.structure as Prisma.InputJsonValue }
          : {}),
        updatedBy: actorId,
      },
    });
  }

  async deleteTemplate(id: string, actorId: string) {
    await this.getTemplate(id);
    await this.prisma.wbsTemplate.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actorId,
      action: 'DELETE',
      tableName: 'wbs_templates',
      recordId: id,
    });
    return { deleted: true };
  }

  /** Explode a template's structure JSON into a new project's node tree. */
  async fromTemplate(templateId: string, dto: FromTemplateDto, actorId: string) {
    const tpl = await this.getTemplate(templateId);
    const flat = flattenTemplate(tpl.structure);

    const project = await this.prisma.project.create({
      data: {
        name: dto.name,
        description: dto.description,
        siteId: dto.siteId ?? null,
        entityId: dto.entityId ?? tpl.entityId ?? null,
        contractId: dto.contractId ?? null,
        orderId: dto.orderId ?? null,
        status: 'ACTIVE',
        createdBy: actorId,
        updatedBy: actorId,
      },
    });

    // Create nodes level-by-level so parent ids resolve. flattenTemplate emits parents
    // before children, so a single pass keeping a tempId->realId map suffices.
    const idMap = new Map<string, string>();
    for (const n of flat) {
      const created = await this.prisma.projectNode.create({
        data: {
          projectId: project.id,
          parentId: n.parentTempId ? (idMap.get(n.parentTempId) ?? null) : null,
          type: n.type,
          title: n.title,
          weight: new Prisma.Decimal(n.weight),
          position: n.position,
          createdBy: actorId,
          updatedBy: actorId,
        },
      });
      idMap.set(n.tempId, created.id);
    }

    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'projects',
      recordId: project.id,
      after: { name: project.name, fromTemplate: templateId, nodeCount: flat.length },
    });

    return this.findOne(project.id);
  }
}
