import { Injectable, NotFoundException } from '@nestjs/common';
import { Currency, TravelRate } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateTravelRateDto } from './dto/travel-rate.dto';

const SUBJECT_TABLE = 'travel_rates';

/**
 * Admin-managed per-diem rate table. Travel requests resolve their daily rate from here
 * via {@link rateFor}, so the allowance is config, never hardcoded.
 */
@Injectable()
export class TravelRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateTravelRateDto, actorId: string): Promise<TravelRate> {
    const rate = await this.prisma.travelRate.create({
      data: {
        grade: dto.grade,
        destinationClass: dto.destinationClass,
        currency: dto.currency,
        dailyRate: dto.dailyRate,
        effectiveDate: dto.effectiveDate,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: SUBJECT_TABLE,
      recordId: rate.id,
      after: {
        grade: rate.grade,
        destinationClass: rate.destinationClass,
        currency: rate.currency,
        dailyRate: rate.dailyRate.toString(),
      },
    });
    return rate;
  }

  list(grade?: string): Promise<TravelRate[]> {
    return this.prisma.travelRate.findMany({
      where: grade ? { grade } : undefined,
      orderBy: [
        { grade: 'asc' },
        { destinationClass: 'asc' },
        { currency: 'asc' },
        { effectiveDate: 'desc' },
      ],
    });
  }

  /**
   * The per-diem rate effective on `date` for a (grade, destinationClass, currency) tuple —
   * the most recent row whose effectiveDate is on or before `date`.
   */
  async rateFor(
    grade: string,
    destinationClass: string,
    currency: Currency,
    date: Date = new Date(),
  ): Promise<TravelRate> {
    const row = await this.prisma.travelRate.findFirst({
      where: {
        grade,
        destinationClass,
        currency,
        effectiveDate: { lte: date },
      },
      orderBy: { effectiveDate: 'desc' },
    });
    if (!row) {
      throw new NotFoundException(
        `No travel rate for grade "${grade}", class "${destinationClass}", ${currency} on or before ${date.toISOString()}`,
      );
    }
    return row;
  }
}
