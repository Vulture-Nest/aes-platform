import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutoryRate } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LookupService } from '../../settings/lookup.service';
import { CreateStatutoryRateDto } from './dto/statutory-rate.dto';

@Injectable()
export class StatutoryRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookups: LookupService,
  ) {}

  async create(dto: CreateStatutoryRateDto, actorId: string): Promise<StatutoryRate> {
    if (dto.currency) {
      await this.lookups.assertValid('currency', dto.currency);
    }
    const rate = await this.prisma.statutoryRate.create({
      data: {
        key: dto.key,
        currency: dto.currency ?? null,
        country: dto.country ?? null,
        value: dto.value ?? null,
        params: (dto.params as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        dateEffective: dto.dateEffective,
        createdBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'statutory_rates',
      recordId: rate.id,
      after: {
        key: dto.key,
        currency: dto.currency ?? null,
        country: dto.country ?? null,
        value: dto.value ?? null,
      },
    });
    return rate;
  }

  list(key?: string): Promise<StatutoryRate[]> {
    return this.prisma.statutoryRate.findMany({
      where: key ? { key } : undefined,
      orderBy: [{ key: 'asc' }, { dateEffective: 'desc' }],
    });
  }

  /**
   * The statutory parameter effective on `date` for a key (and optional currency + country).
   *
   * Country scoping (multinational readiness): when `country` is supplied we prefer the newest
   * effective row scoped to that country; if none exists we FALL BACK to a country-agnostic
   * (`country = NULL`) row. All pre-existing rows are country-NULL, so the Zimbabwe path
   * resolves exactly the same rows whether `country` is omitted or `'ZW'`.
   */
  async valueAsOf(
    key: string,
    date = new Date(),
    currency?: string,
    country?: string,
  ): Promise<StatutoryRate> {
    // Prefer a country-scoped row when a country is given; else go straight to the NULL fallback.
    if (country) {
      const scoped = await this.prisma.statutoryRate.findFirst({
        where: { key, currency: currency ?? null, country, dateEffective: { lte: date } },
        orderBy: { dateEffective: 'desc' },
      });
      if (scoped) {
        return scoped;
      }
    }
    const row = await this.prisma.statutoryRate.findFirst({
      where: { key, currency: currency ?? null, country: null, dateEffective: { lte: date } },
      orderBy: { dateEffective: 'desc' },
    });
    if (!row) {
      throw new NotFoundException(
        `No statutory value for "${key}" on or before ${date.toISOString()}`,
      );
    }
    return row;
  }
}
