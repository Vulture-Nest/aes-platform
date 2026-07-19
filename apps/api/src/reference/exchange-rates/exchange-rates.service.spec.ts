import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ExchangeRatesService } from './exchange-rates.service';
import { RateType } from './rate-type.enum';

describe('ExchangeRatesService.rateAsOf', () => {
  const prisma = { exchangeRate: { findFirst: jest.fn() } };
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new ExchangeRatesService(prisma as any, audit as any);

  const row = {
    id: 'r1',
    currencyPair: 'USD/ZWG',
    officialRate: new Prisma.Decimal('26.5'),
    parallelRate: new Prisma.Decimal('40'),
    dateEffective: new Date('2025-03-01'),
  };

  beforeEach(() => jest.clearAllMocks());

  it('returns the official rate by default', async () => {
    prisma.exchangeRate.findFirst.mockResolvedValue(row);
    const res = await service.rateAsOf('USD/ZWG', new Date('2025-03-15'));
    expect(res.rate).toBe('26.5');
    expect(res.type).toBe(RateType.OFFICIAL);
  });

  it('returns the parallel rate when requested', async () => {
    prisma.exchangeRate.findFirst.mockResolvedValue(row);
    const res = await service.rateAsOf('USD/ZWG', new Date('2025-03-15'), RateType.PARALLEL);
    expect(res.rate).toBe('40');
  });

  it('queries for the latest rate on or before the date', async () => {
    prisma.exchangeRate.findFirst.mockResolvedValue(row);
    await service.rateAsOf('USD/ZWG', new Date('2025-03-15'));
    const arg = prisma.exchangeRate.findFirst.mock.calls[0][0];
    expect(arg.where.dateEffective.lte).toEqual(new Date('2025-03-15'));
    expect(arg.orderBy).toEqual({ dateEffective: 'desc' });
  });

  it('throws when no rate exists on or before the date', async () => {
    prisma.exchangeRate.findFirst.mockResolvedValue(null);
    await expect(service.rateAsOf('USD/ZWG', new Date('2020-01-01'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
