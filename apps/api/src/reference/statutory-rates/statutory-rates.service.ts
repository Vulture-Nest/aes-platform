import { Injectable, NotFoundException } from '@nestjs/common';
import { Currency, Prisma, StatutoryRate } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateStatutoryRateDto } from './dto/statutory-rate.dto';

@Injectable()
export class StatutoryRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateStatutoryRateDto, actorId: string): Promise<StatutoryRate> {
    const rate = await this.prisma.statutoryRate.create({
      data: {
        key: dto.key,
        currency: dto.currency ?? null,
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
      after: { key: dto.key, currency: dto.currency ?? null, value: dto.value ?? null },
    });
    return rate;
  }

  list(key?: string): Promise<StatutoryRate[]> {
    return this.prisma.statutoryRate.findMany({
      where: key ? { key } : undefined,
      orderBy: [{ key: 'asc' }, { dateEffective: 'desc' }],
    });
  }

  /** The statutory parameter effective on `date` for a key (and optional currency). */
  async valueAsOf(key: string, date = new Date(), currency?: Currency): Promise<StatutoryRate> {
    const row = await this.prisma.statutoryRate.findFirst({
      where: { key, currency: currency ?? null, dateEffective: { lte: date } },
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
