import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  AddSectionDto,
  ListPeriodsQueryDto,
  OpenForMonthDto,
  OpenPeriodDto,
  SubmitReportDto,
  UpdateSectionDto,
} from './dto/site-report.dto';

/** Standard section set every monthly report opens with. OTHER is configurable/extendable. */
export const STANDARD_SECTIONS: Array<{ key: string; title: string }> = [
  { key: 'ADMIN', title: 'Administration' },
  { key: 'OPERATIONS', title: 'Operations' },
  { key: 'FINANCE', title: 'Finance' },
  { key: 'PPE', title: 'PPE' },
  { key: 'WITHDRAWALS', title: 'Stores & Withdrawals' },
  { key: 'LOGISTICS', title: 'Logistics' },
  { key: 'SHE', title: 'Safety, Health & Environment' },
  { key: 'OTHER', title: 'Other' },
];

/** Status lifecycle. Terminal states reject content edits. */
export const OPEN = 'OPEN';
export const SUBMITTED = 'SUBMITTED';
export const LOCKED = 'LOCKED';

/** Month string helpers (YYYY-MM). */
function monthBounds(periodMonth: string): { start: Date; end: Date } {
  const [y, m] = periodMonth.split('-').map((n) => parseInt(n, 10));
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  return { start, end };
}

@Injectable()
export class SiteReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListPeriodsQueryDto = {}) {
    const where: Prisma.SiteReportPeriodWhereInput = {};
    if (query.siteId) where.siteId = query.siteId;
    if (query.periodMonth) where.periodMonth = query.periodMonth;
    if (query.status) where.status = query.status;
    return this.prisma.siteReportPeriod.findMany({
      where,
      orderBy: [{ periodMonth: 'desc' }, { createdAt: 'desc' }],
      include: { sections: { orderBy: { sectionKey: 'asc' } } },
    });
  }

  async findOne(id: string) {
    const period = await this.prisma.siteReportPeriod.findUnique({
      where: { id },
      include: { sections: { orderBy: { sectionKey: 'asc' } } },
    });
    if (!period) throw new NotFoundException('Site report period not found');
    return period;
  }

  /** Manually open a monthly report period for a site (creates the standard sections). */
  async open(dto: OpenPeriodDto, actorId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: dto.siteId } });
    if (!site) throw new BadRequestException('Site does not exist');

    const existing = await this.prisma.siteReportPeriod.findUnique({
      where: { siteId_periodMonth: { siteId: dto.siteId, periodMonth: dto.periodMonth } },
    });
    if (existing) {
      throw new ConflictException('A report period already exists for this site and month');
    }

    const period = await this.prisma.siteReportPeriod.create({
      data: {
        siteId: dto.siteId,
        entityId: site.entityId,
        contractId: dto.contractId ?? null,
        periodMonth: dto.periodMonth,
        status: OPEN,
        deadline: dto.deadline ? new Date(dto.deadline) : null,
        createdBy: actorId,
        updatedBy: actorId,
        sections: {
          create: STANDARD_SECTIONS.map((s) => ({
            sectionKey: s.key,
            title: s.title,
            createdBy: actorId,
            updatedBy: actorId,
          })),
        },
      },
      include: { sections: { orderBy: { sectionKey: 'asc' } } },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'site_report_periods',
      recordId: period.id,
      after: { siteId: period.siteId, periodMonth: period.periodMonth, status: period.status },
    });
    return period;
  }

  /**
   * Open report periods for every long-contract site for a given month (scheduler helper).
   * Long-contract sites are those linked to an active contract spanning the month.
   * Best-effort: skips sites that already have a period. Returns the created periods.
   */
  async openForMonth(dto: OpenForMonthDto, actorId: string) {
    const siteIds = await this.longContractSiteIds(dto.periodMonth);
    const created: Array<{ siteId: string; periodId: string }> = [];
    for (const siteId of siteIds) {
      const exists = await this.prisma.siteReportPeriod.findUnique({
        where: { siteId_periodMonth: { siteId, periodMonth: dto.periodMonth } },
      });
      if (exists) continue;
      const period = await this.open(
        { siteId, periodMonth: dto.periodMonth, deadline: dto.deadline },
        actorId,
      );
      created.push({ siteId, periodId: period.id });
    }
    return { periodMonth: dto.periodMonth, opened: created.length, created };
  }

  /**
   * Site ids considered "long-contract" for a month: sites whose clientId has an
   * ACTIVE contract whose [startDate,endDate] straddles the month. Degrades to an
   * empty list if the sources are empty.
   */
  private async longContractSiteIds(periodMonth: string): Promise<string[]> {
    const { start, end } = monthBounds(periodMonth);
    const contracts = await this.prisma.contract.findMany({
      where: {
        status: 'ACTIVE',
        startDate: { lt: end },
        endDate: { gte: start },
      },
      select: { clientId: true },
    });
    const clientIds = [...new Set(contracts.map((c) => c.clientId))];
    if (clientIds.length === 0) return [];
    const sites = await this.prisma.site.findMany({
      where: { active: true, clientId: { in: clientIds } },
      select: { id: true },
    });
    return sites.map((s) => s.id);
  }

  private assertEditable(status: string) {
    if (status !== OPEN) {
      throw new ConflictException('Report is submitted/locked and cannot be edited');
    }
  }

  /** Add a custom section (e.g. an extra OTHER_* section). */
  async addSection(reportId: string, dto: AddSectionDto, actorId: string) {
    const period = await this.findOne(reportId);
    this.assertEditable(period.status);
    if (period.sections.some((s) => s.sectionKey === dto.sectionKey)) {
      throw new ConflictException('Section already exists');
    }
    return this.prisma.siteReportSection.create({
      data: {
        reportId,
        sectionKey: dto.sectionKey,
        title: dto.title,
        content: (dto.content ?? undefined) as Prisma.InputJsonValue | undefined,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  /** Set a section's content and/or mark it complete. */
  async updateSection(reportId: string, sectionKey: string, dto: UpdateSectionDto, actorId: string) {
    const period = await this.findOne(reportId);
    this.assertEditable(period.status);
    const section = period.sections.find((s) => s.sectionKey === sectionKey);
    if (!section) throw new NotFoundException('Section not found');

    const data: Prisma.SiteReportSectionUpdateInput = { updatedBy: actorId };
    if (dto.content !== undefined) data.content = dto.content as Prisma.InputJsonValue;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.completedAt !== undefined) data.completedAt = new Date(dto.completedAt);

    const updated = await this.prisma.siteReportSection.update({
      where: { id: section.id },
      data,
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'site_report_sections',
      recordId: section.id,
      after: { sectionKey, completedAt: updated.completedAt },
    });
    return updated;
  }

  /**
   * Site Manager review + submit. Moves OPEN -> SUBMITTED -> LOCKED (archived, edits
   * rejected). A submission past the deadline flags the timeliness KPI actual (best-effort).
   */
  async submit(reportId: string, dto: SubmitReportDto, actorId: string) {
    const period = await this.findOne(reportId);
    if (period.status !== OPEN) {
      throw new ConflictException('Report has already been submitted');
    }

    const submittedAt = new Date();
    const late = period.deadline != null && submittedAt > period.deadline;

    const updated = await this.prisma.siteReportPeriod.update({
      where: { id: reportId },
      data: {
        status: LOCKED,
        narrative: dto.narrative,
        submittedAt,
        submittedByUserId: actorId,
        updatedBy: actorId,
      },
      include: { sections: { orderBy: { sectionKey: 'asc' } } },
    });

    await this.flagTimeliness(period.siteId, period.contractId, period.periodMonth, late, actorId);

    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: 'site_report_periods',
      recordId: reportId,
      before: { status: OPEN },
      after: { status: LOCKED, late, submittedAt },
    });
    return { ...updated, late };
  }

  /**
   * Best-effort: record a 100/0 timeliness actual against a KPI keyed 'timeliness' (or
   * 'report_timeliness') scoped to the site/contract. Silently no-ops if no such KPI exists.
   */
  private async flagTimeliness(
    siteId: string,
    contractId: string | null,
    periodMonth: string,
    late: boolean,
    actorId: string,
  ) {
    try {
      const kpi = await this.prisma.siteKpi.findFirst({
        where: {
          kpiKey: { in: ['timeliness', 'report_timeliness'] },
          OR: [{ siteId }, { contractId: contractId ?? undefined }],
        },
      });
      if (!kpi) return;
      const actualValue = late ? 0 : 100;
      const existing = await this.prisma.siteKpiActual.findFirst({
        where: { kpiId: kpi.id, periodMonth },
      });
      const rag = late ? 'RED' : 'GREEN';
      if (existing) {
        await this.prisma.siteKpiActual.update({
          where: { id: existing.id },
          data: { actualValue, rag, computedAt: new Date(), updatedBy: actorId },
        });
      } else {
        await this.prisma.siteKpiActual.create({
          data: { kpiId: kpi.id, periodMonth, actualValue, rag, createdBy: actorId, updatedBy: actorId },
        });
      }
    } catch {
      // Timeliness is a soft signal — never block submission on it.
    }
  }

  /**
   * Assemble auto-populated section content JSON from other modules. Every source is
   * guarded; a failing/empty source contributes an { error } / empty block rather than
   * throwing. Optionally persists into the report's sections when a reportId is given.
   */
  async buildAutoContent(siteId: string, period: string) {
    const { start, end } = monthBounds(period);

    const manhours = await this.safe(() => this.autoManhours(siteId, start, end));
    const progress = await this.safe(() => this.autoProgress(siteId));
    const pettyCash = await this.safe(() => this.autoPettyCash(siteId));
    const costVsBudget = await this.safe(() => this.autoCostVsBudget(siteId, period, start, end));
    const stores = await this.safe(() => this.autoStores(siteId, start, end));

    return {
      OPERATIONS: { manhours, progress },
      FINANCE: { pettyCash, costVsBudget },
      WITHDRAWALS: { stores },
    };
  }

  /** Build auto content and write it into the OPEN report's matching sections. */
  async autoPopulate(reportId: string, actorId: string) {
    const period = await this.findOne(reportId);
    this.assertEditable(period.status);
    const content = await this.buildAutoContent(period.siteId, period.periodMonth);
    for (const [key, value] of Object.entries(content)) {
      const section = period.sections.find((s) => s.sectionKey === key);
      if (!section) continue;
      await this.prisma.siteReportSection.update({
        where: { id: section.id },
        data: { content: value as Prisma.InputJsonValue, autoPopulated: true, updatedBy: actorId },
      });
    }
    return this.findOne(reportId);
  }

  private async safe<T>(fn: () => Promise<T>): Promise<T | { error: string }> {
    try {
      return await fn();
    } catch (e) {
      return { error: e instanceof Error ? e.message : 'unavailable' };
    }
  }

  private async autoManhours(siteId: string, start: Date, end: Date) {
    const periods = await this.prisma.timesheetPeriod.findMany({
      where: { siteId },
      include: { entries: { where: { date: { gte: start, lt: end } } } },
    });
    let normal = 0;
    let overtime = 0;
    let night = 0;
    for (const p of periods) {
      for (const e of p.entries) {
        normal += Number(e.hoursNormal);
        overtime += Number(e.hoursOt15) + Number(e.hoursOt20);
        night += Number(e.nightHours);
      }
    }
    return { normalHours: normal, overtimeHours: overtime, nightHours: night, totalHours: normal + overtime };
  }

  private async autoProgress(siteId: string) {
    const projects = await this.prisma.project.findMany({
      where: { siteId },
      select: { id: true, name: true, percentComplete: true, status: true },
    });
    return projects.map((p) => ({
      projectId: p.id,
      name: p.name,
      status: p.status,
      percentComplete: Number(p.percentComplete),
    }));
  }

  private async autoPettyCash(siteId: string) {
    const floats = await this.prisma.pettyCashFloat.findMany({
      where: { siteId },
      select: { currency: true, floatAmount: true, locked: true },
    });
    return floats.map((f) => ({
      currency: f.currency,
      floatAmount: Number(f.floatAmount),
      locked: f.locked,
    }));
  }

  private async autoCostVsBudget(siteId: string, period: string, start: Date, end: Date) {
    const budgets = await this.prisma.budget.findMany({
      where: { siteId, OR: [{ periodMonth: period }, { periodMonth: null }] },
      include: { lines: true },
    });
    const budgeted = budgets.reduce(
      (sum, b) => sum + b.lines.reduce((ls, l) => ls + Number(l.amount ?? 0), 0),
      0,
    );
    const stores = await this.prisma.storesWithdrawal.aggregate({
      where: { siteId, drawnAt: { gte: start, lt: end } },
      _sum: { value: true },
    });
    const actual = Number(stores._sum.value ?? 0);
    return { budgeted, actual, variance: budgeted - actual };
  }

  private async autoStores(siteId: string, start: Date, end: Date) {
    const grouped = await this.prisma.storesWithdrawal.groupBy({
      by: ['itemType'],
      where: { siteId, drawnAt: { gte: start, lt: end } },
      _sum: { value: true, quantity: true },
    });
    return grouped.map((g) => ({
      itemType: g.itemType,
      totalValue: Number(g._sum.value ?? 0),
      totalQuantity: Number(g._sum.quantity ?? 0),
    }));
  }
}
