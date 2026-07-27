import { BadRequestException } from '@nestjs/common';
import { ActingBasis, Prisma } from '@prisma/client';
import { ActingService } from './acting.service';

describe('ActingService', () => {
  const prisma = {
    actingAssignment: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    payrollExtraEarning: { create: jest.fn() },
    employee: { findUnique: jest.fn() },
  };
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new ActingService(prisma as any, audit as any);

  beforeEach(() => jest.clearAllMocks());

  describe('computeProration — FIXED basis, mid-month end', () => {
    it('pro-rates a fixed allowance for an assignment ending mid-month', () => {
      // June has 30 days; acting active 1st..15th = 15 days => 150 × 15/30 = 75.
      const proration = service.computeProration(
        {
          employeeId: 'e1',
          basis: ActingBasis.FIXED,
          fixedAmount: new Prisma.Decimal(150),
          percent: null,
          minQualifyingDays: null,
          dateFrom: new Date(Date.UTC(2026, 5, 1)),
          dateTo: new Date(Date.UTC(2026, 5, 15)),
        },
        '2026-06',
      );
      expect(proration.daysInMonth).toBe(30);
      expect(proration.qualifyingDays).toBe(15);
      expect(proration.fullAllowance).toBe(150);
      expect(proration.proratedAllowance).toBe(75);
    });

    it('pays the full allowance when the assignment spans the whole month', () => {
      const proration = service.computeProration(
        {
          employeeId: 'e1',
          basis: ActingBasis.FIXED,
          fixedAmount: new Prisma.Decimal(150),
          percent: null,
          minQualifyingDays: null,
          dateFrom: new Date(Date.UTC(2026, 5, 1)),
          dateTo: new Date(Date.UTC(2026, 5, 30)),
        },
        '2026-06',
      );
      expect(proration.qualifyingDays).toBe(30);
      expect(proration.proratedAllowance).toBe(150);
    });

    it('earns nothing below the minimum qualifying days', () => {
      const proration = service.computeProration(
        {
          employeeId: 'e1',
          basis: ActingBasis.FIXED,
          fixedAmount: new Prisma.Decimal(150),
          percent: null,
          minQualifyingDays: 15,
          dateFrom: new Date(Date.UTC(2026, 5, 25)),
          dateTo: new Date(Date.UTC(2026, 5, 30)),
        },
        '2026-06',
      );
      expect(proration.qualifyingDays).toBe(6);
      expect(proration.qualifies).toBe(false);
      expect(proration.proratedAllowance).toBe(0);
    });
  });

  describe('computeProration — PERCENT basis', () => {
    it('allowance = percent × (acting grade basic − own basic), pro-rated', () => {
      // 20% × (600 − 400) = 40 full; active whole month => 40.
      const proration = service.computeProration(
        {
          employeeId: 'e1',
          basis: ActingBasis.PERCENT,
          fixedAmount: null,
          percent: new Prisma.Decimal(20),
          minQualifyingDays: null,
          dateFrom: new Date(Date.UTC(2026, 5, 1)),
          dateTo: new Date(Date.UTC(2026, 5, 30)),
        },
        '2026-06',
        { ownBasic: 400, actingGradeBasic: 600 },
      );
      expect(proration.fullAllowance).toBe(40);
      expect(proration.proratedAllowance).toBe(40);
    });

    it('never goes negative when own basic exceeds acting grade basic', () => {
      const proration = service.computeProration(
        {
          employeeId: 'e1',
          basis: ActingBasis.PERCENT,
          fixedAmount: null,
          percent: new Prisma.Decimal(20),
          minQualifyingDays: null,
          dateFrom: new Date(Date.UTC(2026, 5, 1)),
          dateTo: new Date(Date.UTC(2026, 5, 30)),
        },
        '2026-06',
        { ownBasic: 800, actingGradeBasic: 600 },
      );
      expect(proration.fullAllowance).toBe(0);
      expect(proration.proratedAllowance).toBe(0);
    });
  });

  describe('create — overlap rejection', () => {
    const dto = {
      employeeId: 'e1',
      actingPosition: 'Site Manager',
      dateFrom: new Date(Date.UTC(2026, 5, 1)),
      dateTo: new Date(Date.UTC(2026, 5, 30)),
      basis: ActingBasis.FIXED,
      fixedAmount: 150,
    };

    it('rejects an overlapping acting assignment for the same employee', async () => {
      prisma.actingAssignment.findFirst.mockResolvedValue({ id: 'existing' });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect(service.create(dto as any, 'actor')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.actingAssignment.create).not.toHaveBeenCalled();
    });

    it('creates a DRAFT when there is no overlap', async () => {
      prisma.actingAssignment.findFirst.mockResolvedValue(null);
      prisma.actingAssignment.create.mockResolvedValue({
        id: 'a1',
        employeeId: 'e1',
        actingPosition: 'Site Manager',
        basis: ActingBasis.FIXED,
        status: 'DRAFT',
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = await service.create(dto as any, 'actor');
      expect(res.status).toBe('DRAFT');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', tableName: 'acting_assignments' }),
      );
    });

    it('rejects FIXED basis with no fixedAmount', async () => {
      prisma.actingAssignment.findFirst.mockResolvedValue(null);
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        service.create({ ...dto, fixedAmount: undefined } as any, 'actor'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
