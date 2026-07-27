import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePpeIssueDto,
  CreatePpeRequirementDto,
  ListPpeIssuesQueryDto,
  ListPpeRequirementsQueryDto,
  PpeComplianceQueryDto,
  UpdatePpeIssueDto,
  UpdatePpeRequirementDto,
} from './dto/ppe.dto';

/** Add N months to a date (used to derive replacement-due from lifespan). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * Compliance % = items in-date and issued ÷ items required. Pure so it can be unit-tested.
 * `issuedInDate` is the count of required items that have a current (not-expired) issue.
 */
export function compliancePercent(required: number, issuedInDate: number): number {
  if (required <= 0) return 100;
  return Math.round((issuedInDate / required) * 10000) / 100;
}

@Injectable()
export class PpeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- Requirements -------------------------------------------------------
  listRequirements(query: ListPpeRequirementsQueryDto = {}) {
    const where: Prisma.PpeRequirementWhereInput = {};
    if (query.role) where.role = query.role;
    if (query.employeeId) where.employeeId = query.employeeId;
    return this.prisma.ppeRequirement.findMany({ where, orderBy: { itemType: 'asc' } });
  }

  async createRequirement(dto: CreatePpeRequirementDto, actorId: string) {
    const req = await this.prisma.ppeRequirement.create({
      data: {
        role: dto.role,
        employeeId: dto.employeeId,
        itemType: dto.itemType,
        quantity: dto.quantity ?? 1,
        lifespanMonths: dto.lifespanMonths,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'ppe_requirements',
      recordId: req.id,
      after: { itemType: req.itemType, role: req.role, employeeId: req.employeeId },
    });
    return req;
  }

  async updateRequirement(id: string, dto: UpdatePpeRequirementDto, actorId: string) {
    const before = await this.prisma.ppeRequirement.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('PPE requirement not found');
    const req = await this.prisma.ppeRequirement.update({
      where: { id },
      data: { ...dto, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'ppe_requirements',
      recordId: id,
      after: { itemType: req.itemType, quantity: req.quantity },
    });
    return req;
  }

  async removeRequirement(id: string, actorId: string) {
    const before = await this.prisma.ppeRequirement.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('PPE requirement not found');
    await this.prisma.ppeRequirement.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actorId,
      action: 'DELETE',
      tableName: 'ppe_requirements',
      recordId: id,
    });
    return { id, deleted: true };
  }

  // --- Issues -------------------------------------------------------------
  listIssues(query: ListPpeIssuesQueryDto = {}) {
    const where: Prisma.PpeIssueWhereInput = {};
    if (query.employeeId) where.employeeId = query.employeeId;
    return this.prisma.ppeIssue.findMany({ where, orderBy: { issueDate: 'desc' } });
  }

  async createIssue(dto: CreatePpeIssueDto, actorId: string) {
    const issueDate = new Date(dto.issueDate);
    let replacementDue = dto.replacementDue ? new Date(dto.replacementDue) : null;
    // Derive replacement-due from the matching requirement's lifespan when not supplied.
    if (!replacementDue) {
      const req = await this.prisma.ppeRequirement.findFirst({
        where: { itemType: dto.itemType, OR: [{ employeeId: dto.employeeId }, { employeeId: null }] },
      });
      if (req?.lifespanMonths) replacementDue = addMonths(issueDate, req.lifespanMonths);
    }
    const issue = await this.prisma.ppeIssue.create({
      data: {
        employeeId: dto.employeeId,
        itemType: dto.itemType,
        issueDate,
        size: dto.size,
        replacementDue,
        condition: dto.condition,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'ppe_issues',
      recordId: issue.id,
      after: { itemType: issue.itemType, employeeId: issue.employeeId },
    });
    return issue;
  }

  async updateIssue(id: string, dto: UpdatePpeIssueDto, actorId: string) {
    const before = await this.prisma.ppeIssue.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('PPE issue not found');
    const data: Prisma.PpeIssueUpdateInput = { updatedBy: actorId };
    if (dto.employeeId !== undefined) data.employeeId = dto.employeeId;
    if (dto.itemType !== undefined) data.itemType = dto.itemType;
    if (dto.issueDate !== undefined) data.issueDate = new Date(dto.issueDate);
    if (dto.size !== undefined) data.size = dto.size;
    if (dto.replacementDue !== undefined) {
      data.replacementDue = dto.replacementDue ? new Date(dto.replacementDue) : null;
    }
    if (dto.condition !== undefined) data.condition = dto.condition;
    const issue = await this.prisma.ppeIssue.update({ where: { id }, data });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'ppe_issues',
      recordId: id,
      after: { itemType: issue.itemType },
    });
    return issue;
  }

  async removeIssue(id: string, actorId: string) {
    const before = await this.prisma.ppeIssue.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('PPE issue not found');
    await this.prisma.ppeIssue.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actorId,
      action: 'DELETE',
      tableName: 'ppe_issues',
      recordId: id,
    });
    return { id, deleted: true };
  }

  /**
   * PPE compliance: for each employee's required item, an item is compliant when it has a
   * PPE issue that is not past its replacementDue. Returns the overall compliance % plus a
   * list of expiring items (replacementDue within `expiringWithinDays`). Best-effort: an
   * empty employee set yields 100% and no expiring items.
   */
  async compliance(query: PpeComplianceQueryDto = {}) {
    const now = new Date();
    const horizonDays = query.expiringWithinDays ?? 30;
    const horizon = new Date(now.getTime() + horizonDays * 24 * 60 * 60 * 1000);

    // Employees in scope (optionally restricted to a site).
    const employees = await this.prisma.employee.findMany({
      where: query.siteId ? { siteId: query.siteId } : undefined,
      select: { id: true, occupation: true },
    });
    const employeeIds = employees.map((e) => e.id);

    const requirements = await this.prisma.ppeRequirement.findMany();
    const issues = employeeIds.length
      ? await this.prisma.ppeIssue.findMany({ where: { employeeId: { in: employeeIds } } })
      : [];

    let requiredCount = 0;
    let compliantCount = 0;
    const expiring: Array<{
      employeeId: string;
      itemType: string;
      replacementDue: Date | null;
    }> = [];

    for (const emp of employees) {
      // Requirements applicable to this employee: employee-specific or role-based.
      const applicable = requirements.filter(
        (r) =>
          r.employeeId === emp.id ||
          (r.employeeId == null && r.role != null && r.role === emp.occupation),
      );
      for (const req of applicable) {
        requiredCount += req.quantity;
        const matching = issues.filter(
          (i) => i.employeeId === emp.id && i.itemType === req.itemType,
        );
        // In-date issued items for this requirement.
        const inDate = matching.filter((i) => i.replacementDue == null || i.replacementDue >= now);
        compliantCount += Math.min(inDate.length, req.quantity);
        for (const i of matching) {
          if (i.replacementDue != null && i.replacementDue >= now && i.replacementDue <= horizon) {
            expiring.push({ employeeId: i.employeeId, itemType: i.itemType, replacementDue: i.replacementDue });
          }
        }
      }
    }

    return {
      siteId: query.siteId ?? null,
      requiredCount,
      compliantCount,
      compliancePercent: compliancePercent(requiredCount, compliantCount),
      expiring: expiring.sort(
        (a, b) => (a.replacementDue?.getTime() ?? 0) - (b.replacementDue?.getTime() ?? 0),
      ),
    };
  }
}
