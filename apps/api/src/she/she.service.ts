import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateSheRecordDto,
  ListSheRecordsQueryDto,
  SHE_TYPES,
  SheStatsQueryDto,
  UpdateSheRecordDto,
} from './dto/she.dto';

const OPEN = 'OPEN';
const CLOSED = 'CLOSED';

/**
 * SHE — Safety, Health & Environment (G21 / spec §16.10, add-feat §8.3).
 *
 * Captures structured SHE records at a site (site-scoped → RLS applies automatically via the
 * request context), tracks lost-time injuries (LTI) and investigations, and produces a simple
 * TRIFR-style summary (counts by type, LTI count, open investigations) for the site dashboard.
 */
@Injectable()
export class SheService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListSheRecordsQueryDto = {}) {
    const where: Prisma.SheRecordWhereInput = {};
    if (query.siteId) where.siteId = query.siteId;
    if (query.type) where.type = query.type;
    if (query.status) where.status = query.status;
    return this.prisma.sheRecord.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.sheRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('SHE record not found');
    return record;
  }

  /** Capture a SHE record. The site's entity is copied onto the record when available. */
  async create(dto: CreateSheRecordDto, actorId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: dto.siteId } });
    if (!site) throw new BadRequestException('Site does not exist');

    const record = await this.prisma.sheRecord.create({
      data: {
        entityId: site.entityId ?? null,
        siteId: dto.siteId,
        type: dto.type,
        title: dto.title,
        description: dto.description ?? null,
        severity: dto.severity ?? null,
        occurredAt: new Date(dto.occurredAt),
        investigation: dto.investigation ?? null,
        lti: dto.lti ?? false,
        status: OPEN,
        reportedByUserId: actorId,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'she_records',
      recordId: record.id,
      after: { siteId: record.siteId, type: record.type, lti: record.lti, status: record.status },
    });
    return record;
  }

  /** Advance an investigation: set status / investigation notes / LTI flag. */
  async update(id: string, dto: UpdateSheRecordDto, actorId: string) {
    const existing = await this.findOne(id);

    const data: Prisma.SheRecordUpdateInput = { updatedBy: actorId };
    if (dto.status !== undefined) data.status = dto.status;
    if (dto.investigation !== undefined) data.investigation = dto.investigation;
    if (dto.lti !== undefined) data.lti = dto.lti;

    const updated = await this.prisma.sheRecord.update({ where: { id }, data });

    await this.audit.record({
      actorUserId: actorId,
      action: dto.status && dto.status !== existing.status ? 'STATUS_CHANGE' : 'UPDATE',
      tableName: 'she_records',
      recordId: id,
      before: { status: existing.status, lti: existing.lti },
      after: { status: updated.status, lti: updated.lti },
    });
    return updated;
  }

  /**
   * TRIFR-style summary for a site (or org-wide when siteId is omitted): total records, a
   * count per SHE type, the number of lost-time injuries, and the number of records whose
   * investigation is still open (not CLOSED).
   */
  async stats(query: SheStatsQueryDto = {}) {
    const where: Prisma.SheRecordWhereInput = {};
    if (query.siteId) where.siteId = query.siteId;

    const byTypeRaw = await this.prisma.sheRecord.groupBy({
      by: ['type'],
      where,
      _count: { _all: true },
    });

    const byType: Record<string, number> = {};
    for (const t of SHE_TYPES) byType[t] = 0;
    for (const row of byTypeRaw) byType[row.type] = row._count._all;

    const total = byTypeRaw.reduce((sum, row) => sum + row._count._all, 0);
    const ltiCount = await this.prisma.sheRecord.count({ where: { ...where, lti: true } });
    const openInvestigations = await this.prisma.sheRecord.count({
      where: { ...where, status: { not: CLOSED } },
    });
    const incidentCount = byType.INCIDENT ?? 0;

    return {
      siteId: query.siteId ?? null,
      total,
      byType,
      incidentCount,
      ltiCount,
      openInvestigations,
    };
  }
}
