import { Prisma } from '@prisma/client';
import { BackPayService } from './back-pay.service';

describe('BackPayService', () => {
  const prisma = {
    employee: { findMany: jest.fn() },
    payrollLine: { findMany: jest.fn() },
    backPayBatch: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    payrollExtraEarning: { create: jest.fn() },
    $transaction: jest.fn(),
  };
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new BackPayService(prisma as any, audit as any);

  beforeEach(() => jest.clearAllMocks());

  const hourlyEmployee = {
    id: 'e1',
    grade: 'B3',
    necClass: null,
    payMode: 'HOURLY',
    hourlyRate: new Prisma.Decimal(2),
  };

  describe('matchRate', () => {
    it('prefers a grade match over a NEC-class match', () => {
      const rates = [
        { grade: 'B3', hourly: 2.5 },
        { necClass: 'C', hourly: 9 },
      ];
      const match = service.matchRate({ grade: 'B3', necClass: 'C' }, rates);
      expect(match?.matchedBy).toBe('grade');
      expect(match?.rate.hourly).toBe(2.5);
    });

    it('falls back to NEC class when no grade matches', () => {
      const match = service.matchRate({ grade: 'Z9', necClass: 'C' }, [{ necClass: 'C', basic: 400 }]);
      expect(match?.matchedBy).toBe('necClass');
    });

    it('returns null when nothing matches', () => {
      expect(service.matchRate({ grade: 'Z9', necClass: null }, [{ grade: 'B3', hourly: 3 }])).toBeNull();
    });
  });

  describe('computeLine — old vs new rate math', () => {
    it('re-prices paid hours at the new hourly rate (hourly employee)', () => {
      // Paid basic 400 at old hourly 2 => 200 hours. New hourly 2.5 => 500. Diff 100.
      const paidLine = { basicUsd: new Prisma.Decimal(400), basicZwg: new Prisma.Decimal(0) };
      const working = service.computeLine(
        hourlyEmployee,
        '2024-01',
        [{ grade: 'B3', hourly: 2.5 }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paidLine as any,
      );
      expect(working?.hoursPaid).toBe(200);
      expect(working?.oldAmount).toBe(400);
      expect(working?.newAmount).toBe(500);
      expect(working?.difference).toBe(100);
    });

    it('accumulates the difference across N periods', () => {
      const paidLine = { basicUsd: new Prisma.Decimal(400), basicZwg: new Prisma.Decimal(0) };
      const periods = ['2024-01', '2024-02', '2024-03'];
      const total = periods
        .map(
          (p) =>
            service.computeLine(
              hourlyEmployee,
              p,
              [{ grade: 'B3', hourly: 2.5 }],
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              paidLine as any,
            )?.difference ?? 0,
        )
        .reduce((a, b) => a + b, 0);
      // 100 per period × 3 periods.
      expect(total).toBe(300);
    });

    it('compares paid basic to the new monthly basic (fixed-basic employee)', () => {
      const fixedEmployee = {
        id: 'e2',
        grade: 'M2',
        necClass: null,
        payMode: 'FIXED',
        hourlyRate: null,
      };
      const paidLine = { basicUsd: new Prisma.Decimal(450), basicZwg: new Prisma.Decimal(0) };
      const working = service.computeLine(
        fixedEmployee,
        '2024-01',
        [{ grade: 'M2', basic: 500 }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paidLine as any,
      );
      expect(working?.oldAmount).toBe(450);
      expect(working?.newAmount).toBe(500);
      expect(working?.difference).toBe(50);
    });

    it('includes knock-on OT + %-of-basic allowances (not basic-only)', () => {
      // Paid basic 400 at old hourly 2 => 200 hours; new hourly 2.5 => new basic 500, basic diff 100.
      // Knock-on: OT premium 15% + allowances 10% of the basic diff => 100 * 1.25 = 125.
      const paidLine = { basicUsd: new Prisma.Decimal(400), basicZwg: new Prisma.Decimal(0) };
      const working = service.computeLine(
        hourlyEmployee,
        '2024-01',
        [{ grade: 'B3', hourly: 2.5, otPremiumPctOfBasic: 15, allowancePctOfBasic: 10 }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paidLine as any,
      );
      expect(working?.difference).toBe(125);
    });

    it('returns null when no new rate applies to the employee', () => {
      const paidLine = { basicUsd: new Prisma.Decimal(400), basicZwg: new Prisma.Decimal(0) };
      const working = service.computeLine(
        hourlyEmployee,
        '2024-01',
        [{ grade: 'OTHER', hourly: 9 }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        paidLine as any,
      );
      expect(working).toBeNull();
    });
  });

  describe('approve', () => {
    it('rejects approving a batch that is not SUBMITTED', async () => {
      prisma.backPayBatch.findUnique.mockResolvedValue({ id: 'b1', status: 'DRAFT', lines: [] });
      await expect(service.approve('b1', 'actor')).rejects.toThrow(/SUBMITTED/);
    });

    it('emits one BACK_PAY extra earning per employee summing line differences', async () => {
      prisma.backPayBatch.findUnique.mockResolvedValue({
        id: 'b1',
        status: 'SUBMITTED',
        entityId: null,
        currency: 'USD',
        lines: [
          { employeeId: 'e1', periodMonth: '2024-01', difference: new Prisma.Decimal(100), taxable: true, pensionable: false, nssaAble: false },
          { employeeId: 'e1', periodMonth: '2024-02', difference: new Prisma.Decimal(100), taxable: true, pensionable: false, nssaAble: false },
        ],
      });
      const created: unknown[] = [];
      const tx = {
        payrollExtraEarning: {
          create: jest.fn((args: { data: unknown }) => {
            created.push(args.data);
            return Promise.resolve({ id: 'ee1', ...(args.data as object) });
          }),
        },
        backPayBatch: {
          update: jest.fn().mockResolvedValue({ id: 'b1', status: 'APPROVED', lines: [] }),
        },
      };
      prisma.$transaction.mockImplementation((fn: (t: unknown) => unknown) => fn(tx));

      const res = await service.approve('b1', 'actor');
      expect(tx.payrollExtraEarning.create).toHaveBeenCalledTimes(1);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = created[0] as any;
      expect(data.kind).toBe('BACK_PAY');
      expect(new Prisma.Decimal(data.amount).toNumber()).toBe(200);
      expect(data.label).toContain('2024-01');
      expect(data.label).toContain('2024-02');
      expect(res.extraEarnings).toHaveLength(1);
    });
  });
});
