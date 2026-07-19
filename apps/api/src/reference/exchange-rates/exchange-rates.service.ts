import { Injectable, NotFoundException } from '@nestjs/common';
import { ExchangeRate } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateExchangeRateDto } from './dto/exchange-rate.dto';
import { RateType } from './rate-type.enum';

@Injectable()
export class ExchangeRatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Append a new effective-dated rate. Existing rows are never mutated. */
  async create(dto: CreateExchangeRateDto, actorId: string): Promise<ExchangeRate> {
    const rate = await this.prisma.exchangeRate.create({
      data: {
        dateEffective: dto.dateEffective,
        currencyPair: dto.currencyPair,
        officialRate: dto.officialRate,
        parallelRate: dto.parallelRate ?? null,
        source: dto.source ?? null,
        enteredBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'exchange_rates',
      recordId: rate.id,
      after: { currencyPair: dto.currencyPair, officialRate: dto.officialRate },
    });
    return rate;
  }

  list(currencyPair?: string): Promise<ExchangeRate[]> {
    return this.prisma.exchangeRate.findMany({
      where: currencyPair ? { currencyPair } : undefined,
      orderBy: { dateEffective: 'desc' },
    });
  }

  /** The rate row effective on `date` (latest date_effective ≤ date). */
  async rowAsOf(currencyPair: string, date = new Date()): Promise<ExchangeRate> {
    const row = await this.prisma.exchangeRate.findFirst({
      where: { currencyPair, dateEffective: { lte: date } },
      orderBy: { dateEffective: 'desc' },
    });
    if (!row) {
      throw new NotFoundException(
        `No exchange rate for ${currencyPair} on or before ${date.toISOString()}`,
      );
    }
    return row;
  }

  /** The numeric rate effective on `date` for the requested basis. */
  async rateAsOf(
    currencyPair: string,
    date = new Date(),
    type: RateType = RateType.OFFICIAL,
  ): Promise<{ currencyPair: string; type: RateType; rate: string; dateEffective: Date }> {
    const row = await this.rowAsOf(currencyPair, date);
    const value =
      type === RateType.PARALLEL && row.parallelRate != null ? row.parallelRate : row.officialRate;
    return {
      currencyPair,
      type,
      rate: value.toString(),
      dateEffective: row.dateEffective,
    };
  }
}
