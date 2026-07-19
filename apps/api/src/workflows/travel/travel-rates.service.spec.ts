import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { TravelRatesService } from './travel-rates.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeService() {
  const prisma = {
    travelRate: { create: jest.fn(), findMany: jest.fn(), findFirst: jest.fn() },
  };
  const audit = { record: jest.fn() };
  const lookups = { assertValid: jest.fn().mockResolvedValue(undefined) };
  const service = new TravelRatesService(prisma as any, audit as any, lookups as any);
  return { service, prisma, audit, lookups };
}

describe('TravelRatesService.rateFor', () => {
  it('returns the most recent rate effective on or before the date', async () => {
    const { service, prisma } = makeService();
    const row = { id: 'r1', dailyRate: new Prisma.Decimal(85) };
    prisma.travelRate.findFirst.mockResolvedValue(row);

    const res = await service.rateFor('M3', 'A', 'USD' as any, new Date('2026-08-01'));

    expect(prisma.travelRate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          grade: 'M3',
          destinationClass: 'A',
          currency: 'USD',
          effectiveDate: { lte: new Date('2026-08-01') },
        }),
        orderBy: { effectiveDate: 'desc' },
      }),
    );
    expect(res).toBe(row);
  });

  it('throws when no rate is effective for the tuple', async () => {
    const { service, prisma } = makeService();
    prisma.travelRate.findFirst.mockResolvedValue(null);
    await expect(
      service.rateFor('M3', 'A', 'USD' as any, new Date('2026-08-01')),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('TravelRatesService.create', () => {
  it('persists a rate and writes an audit record', async () => {
    const { service, prisma, audit } = makeService();
    prisma.travelRate.create.mockResolvedValue({
      id: 'r1',
      grade: 'M3',
      destinationClass: 'A',
      currency: 'USD',
      dailyRate: new Prisma.Decimal(85),
    });

    await service.create(
      {
        grade: 'M3',
        destinationClass: 'A',
        currency: 'USD' as any,
        dailyRate: 85,
        effectiveDate: new Date('2026-07-01'),
      },
      'admin1',
    );

    expect(prisma.travelRate.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', tableName: 'travel_rates' }),
    );
  });
});
