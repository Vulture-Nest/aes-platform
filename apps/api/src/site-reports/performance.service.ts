import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RagStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateKpiDto,
  ListKpisQueryDto,
  UpdateKpiDto,
  UpsertActualDto,
  UpsertTargetDto,
} from './dto/kpi.dto';
import {
  computeRag,
  KpiDirection,
  scoreToRag,
  weightedScore,
} from './performance.util';

interface KpiWithRelations {
  id: string;
  kpiKey: string;
  name: string;
  unit: string | null;
  weight: Prisma.Decimal;
  direction: string;
  siteId: string | null;
  contractId: string | null;
  targets: Array<{
    periodMonth: string | null;
    effectiveFrom: Date | null;
    targetValue: Prisma.Decimal;
    tolerance: Prisma.Decimal | null;
  }>;
  actuals: Array<{ periodMonth: string; actualValue: Prisma.Decimal }>;
}

/**
 * Resolve the target that applies to a KPI in a given month: prefer an exact
 * periodMonth match, else the latest effective-from at/before the month, else the first.
 */
export function resolveTarget<
  T extends { periodMonth: string | null; effectiveFrom: Date | null },
>(targets: T[], periodMonth: string): T | undefined {
  const exact = targets.find((t) => t.periodMonth === periodMonth);
  if (exact) return exact;
  const monthStart = new Date(`${periodMonth}-01T00:00:00.000Z`);
  const dated = targets
    .filter((t) => t.effectiveFrom != null && t.effectiveFrom <= monthStart)
    .sort((a, b) => (b.effectiveFrom!.getTime() - a.effectiveFrom!.getTime()));
  if (dated.length) return dated[0];
  return targets.find((t) => t.periodMonth == null && t.effectiveFrom == null) ?? targets[0];
}

@Injectable()
export class PerformanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // --- KPI CRUD -----------------------------------------------------------
  list(query: ListKpisQueryDto = {}) {
    const where: Prisma.SiteKpiWhereInput = {};
    if (query.contractId) where.contractId = query.contractId;
    if (query.siteId) where.siteId = query.siteId;
    return this.prisma.siteKpi.findMany({ where, orderBy: { kpiKey: 'asc' } });
  }

  async findOne(id: string) {
    const kpi = await this.prisma.siteKpi.findUnique({ where: { id } });
    if (!kpi) throw new NotFoundException('KPI not found');
    return kpi;
  }

  async create(dto: CreateKpiDto, actorId: string) {
    const kpi = await this.prisma.siteKpi.create({
      data: {
        contractId: dto.contractId,
        siteId: dto.siteId,
        kpiKey: dto.kpiKey,
        name: dto.name,
        unit: dto.unit,
        weight: new Prisma.Decimal(dto.weight ?? 1),
        direction: dto.direction ?? 'HIGHER_BETTER',
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'site_kpis',
      recordId: kpi.id,
      after: { kpiKey: kpi.kpiKey, siteId: kpi.siteId, contractId: kpi.contractId },
    });
    return kpi;
  }

  async update(id: string, dto: UpdateKpiDto, actorId: string) {
    await this.findOne(id);
    const data: Prisma.SiteKpiUpdateInput = { updatedBy: actorId };
    if (dto.contractId !== undefined) data.contractId = dto.contractId;
    if (dto.siteId !== undefined) data.siteId = dto.siteId;
    if (dto.kpiKey !== undefined) data.kpiKey = dto.kpiKey;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.weight !== undefined) data.weight = new Prisma.Decimal(dto.weight);
    if (dto.direction !== undefined) data.direction = dto.direction;
    const kpi = await this.prisma.siteKpi.update({ where: { id }, data });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'site_kpis',
      recordId: id,
      after: { kpiKey: kpi.kpiKey },
    });
    return kpi;
  }

  async remove(id: string, actorId: string) {
    await this.findOne(id);
    await this.prisma.siteKpi.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actorId,
      action: 'DELETE',
      tableName: 'site_kpis',
      recordId: id,
    });
    return { id, deleted: true };
  }

  // --- Targets & Actuals --------------------------------------------------
  async upsertTarget(kpiId: string, dto: UpsertTargetDto, actorId: string) {
    await this.findOne(kpiId);
    if (!dto.periodMonth && !dto.effectiveFrom) {
      // A baseline (non-stepped) target.
    }
    const existing = await this.prisma.siteKpiTarget.findFirst({
      where: {
        kpiId,
        periodMonth: dto.periodMonth ?? null,
        effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
      },
    });
    const payload = {
      periodMonth: dto.periodMonth ?? null,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : null,
      targetValue: new Prisma.Decimal(dto.targetValue),
      tolerance: dto.tolerance != null ? new Prisma.Decimal(dto.tolerance) : null,
      updatedBy: actorId,
    };
    if (existing) {
      return this.prisma.siteKpiTarget.update({ where: { id: existing.id }, data: payload });
    }
    return this.prisma.siteKpiTarget.create({
      data: { kpiId, ...payload, createdBy: actorId },
    });
  }

  /** Record/replace an actual for a KPI+month and compute its RAG against the resolved target. */
  async upsertActual(kpiId: string, dto: UpsertActualDto, actorId: string) {
    const kpi = (await this.prisma.siteKpi.findUnique({
      where: { id: kpiId },
      include: { targets: true },
    })) as (KpiWithRelations & { targets: KpiWithRelations['targets'] }) | null;
    if (!kpi) throw new NotFoundException('KPI not found');

    const target = resolveTarget(kpi.targets, dto.periodMonth);
    let rag: RagStatus = RagStatus.GREEN;
    if (target) {
      rag = computeRag(
        dto.actualValue,
        Number(target.targetValue),
        target.tolerance != null ? Number(target.tolerance) : null,
        kpi.direction as KpiDirection,
      );
    }

    const existing = await this.prisma.siteKpiActual.findFirst({
      where: { kpiId, periodMonth: dto.periodMonth },
    });
    const payload = {
      actualValue: new Prisma.Decimal(dto.actualValue),
      rag,
      computedAt: new Date(),
      updatedBy: actorId,
    };
    if (existing) {
      return this.prisma.siteKpiActual.update({ where: { id: existing.id }, data: payload });
    }
    return this.prisma.siteKpiActual.create({
      data: { kpiId, periodMonth: dto.periodMonth, ...payload, createdBy: actorId },
    });
  }

  // --- Views --------------------------------------------------------------
  private evaluateKpi(kpi: KpiWithRelations, periodMonth: string) {
    const target = resolveTarget(kpi.targets, periodMonth);
    const actualRow = kpi.actuals.find((a) => a.periodMonth === periodMonth);
    const actual = actualRow ? Number(actualRow.actualValue) : null;
    let rag: RagStatus = RagStatus.RED;
    if (actual != null && target) {
      rag = computeRag(
        actual,
        Number(target.targetValue),
        target.tolerance != null ? Number(target.tolerance) : null,
        kpi.direction as KpiDirection,
      );
    } else if (actual != null && !target) {
      rag = RagStatus.GREEN; // no target set -> treat any actual as on-track
    }
    return {
      kpiId: kpi.id,
      kpiKey: kpi.kpiKey,
      name: kpi.name,
      unit: kpi.unit,
      weight: Number(kpi.weight),
      direction: kpi.direction,
      target: target ? Number(target.targetValue) : null,
      tolerance: target?.tolerance != null ? Number(target.tolerance) : null,
      actual,
      rag,
    };
  }

  /** Per-KPI actual-vs-target with RAG + a weighted site score for one site & month. */
  async performance(siteId: string, periodMonth: string) {
    if (!siteId || !periodMonth) {
      throw new BadRequestException('siteId and period are required');
    }
    const kpis = (await this.prisma.siteKpi.findMany({
      where: { siteId },
      include: {
        targets: true,
        actuals: { where: { periodMonth } },
      },
    })) as unknown as KpiWithRelations[];

    const rows = kpis.map((k) => this.evaluateKpi(k, periodMonth));
    const score = weightedScore(rows.map((r) => ({ weight: r.weight, rag: r.rag })));
    return {
      siteId,
      periodMonth,
      kpis: rows,
      weightedScore: score,
      rag: scoreToRag(score),
    };
  }

  /** Every long-contract site side-by-side for a month, each with a weighted score. */
  async crossSite(periodMonth: string) {
    if (!periodMonth) throw new BadRequestException('period is required');
    const siteIds = await this.siteIdsWithKpis();
    const sites = siteIds.length
      ? await this.prisma.site.findMany({ where: { id: { in: siteIds } }, select: { id: true, name: true } })
      : [];
    const results = [] as Array<{ siteId: string; siteName: string; weightedScore: number; rag: RagStatus }>;
    for (const site of sites) {
      const perf = await this.performance(site.id, periodMonth);
      results.push({
        siteId: site.id,
        siteName: site.name,
        weightedScore: perf.weightedScore,
        rag: perf.rag,
      });
    }
    results.sort((a, b) => b.weightedScore - a.weightedScore);
    return { periodMonth, sites: results };
  }

  private async siteIdsWithKpis(): Promise<string[]> {
    const kpis = await this.prisma.siteKpi.findMany({
      where: { siteId: { not: null } },
      select: { siteId: true },
      distinct: ['siteId'],
    });
    return kpis.map((k) => k.siteId!).filter(Boolean);
  }

  /**
   * Contract-to-date accumulation: for every KPI scoped to the contract (or to a site
   * under that contract), the trend of each period's weighted score, plus an overall
   * average score across periods.
   */
  async contractToDate(contractId: string) {
    if (!contractId) throw new BadRequestException('contractId is required');

    const contract = await this.prisma.contract.findUnique({ where: { id: contractId } });
    const siteIds = contract
      ? (
          await this.prisma.site.findMany({
            where: { clientId: contract.clientId },
            select: { id: true },
          })
        ).map((s) => s.id)
      : [];

    const kpis = (await this.prisma.siteKpi.findMany({
      where: {
        OR: [{ contractId }, siteIds.length ? { siteId: { in: siteIds } } : { id: '' }],
      },
      include: { targets: true, actuals: true },
    })) as unknown as KpiWithRelations[];

    // All months for which any actual exists.
    const months = [
      ...new Set(kpis.flatMap((k) => k.actuals.map((a) => a.periodMonth))),
    ].sort();

    const periods = months.map((month) => {
      const rows = kpis.map((k) => this.evaluateKpi(k, month));
      const withActual = rows.filter((r) => r.actual != null);
      const score = weightedScore(withActual.map((r) => ({ weight: r.weight, rag: r.rag })));
      return { periodMonth: month, weightedScore: score, rag: scoreToRag(score), kpis: withActual };
    });

    const overall =
      periods.length === 0
        ? 0
        : Math.round((periods.reduce((s, p) => s + p.weightedScore, 0) / periods.length) * 100) / 100;

    return {
      contractId,
      periods,
      overallScore: overall,
      overallRag: scoreToRag(overall),
    };
  }
}
