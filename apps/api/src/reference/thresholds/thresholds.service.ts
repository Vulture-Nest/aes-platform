import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Threshold } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LookupService } from '../../settings/lookup.service';
import { CreateThresholdDto } from './dto/threshold.dto';

@Injectable()
export class ThresholdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookups: LookupService,
  ) {}

  /** Records a new effective-dated threshold value (history preserved). */
  async create(dto: CreateThresholdDto, actorId: string): Promise<Threshold> {
    if (dto.currency) {
      await this.lookups.assertValid('currency', dto.currency);
    }
    const threshold = await this.prisma.threshold.create({
      data: {
        key: dto.key,
        currency: dto.currency ?? null,
        value: dto.value ?? null,
        params: (dto.params as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        createdBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'thresholds',
      recordId: threshold.id,
      after: { key: dto.key, currency: dto.currency ?? null, value: dto.value ?? null },
    });
    return threshold;
  }

  list(key?: string): Promise<Threshold[]> {
    return this.prisma.threshold.findMany({
      where: key ? { key } : undefined,
      orderBy: [{ key: 'asc' }, { dateEffective: 'desc' }],
    });
  }

  /** Current (latest effective) value for a key + optional currency. */
  async current(key: string, currency?: string): Promise<Threshold> {
    const row = await this.prisma.threshold.findFirst({
      where: { key, currency: currency ?? null, dateEffective: { lte: new Date() } },
      orderBy: { dateEffective: 'desc' },
    });
    if (!row) {
      throw new NotFoundException(`No threshold configured for "${key}"`);
    }
    return row;
  }
}
