import { Prisma } from '@prisma/client';
import { ZimraReconciliationService } from './zimra-reconciliation.service';
import { ZimraInterestAccrualService } from './zimra-interest-accrual.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function makeService(opts: {
  otherDebts?: any[];
  assessments?: any[];
  statutoryRate?: number | null;
}) {
  const prisma = {
    otherTaxDebt: {
      findMany: jest.fn().mockResolvedValue(opts.otherDebts ?? []),
      update: jest.fn(async ({ data }: any) => data),
    },
    zimraAssessment: {
      findMany: jest.fn().mockResolvedValue(opts.assessments ?? []),
      update: jest.fn(async ({ data }: any) => data),
    },
  };
  const statutoryRates = {
    valueAsOf: jest.fn(async () => {
      if (opts.statutoryRate == null) {
        throw new Error('no rate');
      }
      return { value: opts.statutoryRate };
    }),
  };
  const service = new ZimraInterestAccrualService(
    prisma as any,
    new ZimraReconciliationService(),
    statutoryRates as any,
  );
  return { service, prisma, statutoryRates };
}

describe('ZimraInterestAccrualService', () => {
  it('accrues A.6 interest on an overdue other_tax_debt using its own ratePct', async () => {
    // principal 100000 outstanding, 20% p.a., 365 days overdue.
    // interest = 100000 * 20/100 * 365/365 = 20000.00
    const debt = {
      id: 'd1',
      principal: dec(100000),
      paidToDate: dec(0),
      currency: 'USD',
      dueDate: day('2025-07-01'),
      ratePct: dec(20),
    };
    const { service, prisma } = makeService({ otherDebts: [debt] });

    const res = await service.accrueAll(day('2026-07-01')); // exactly 365 days later

    expect(res.otherTaxDebts).toBe(1);
    const update = prisma.otherTaxDebt.update.mock.calls[0][0];
    expect(update.where.id).toBe('d1');
    expect(Number(update.data.accruedInterest)).toBeCloseTo(20000, 2);
    expect(update.data.accruedInterestAt).toEqual(day('2026-07-01'));
  });

  it('accrues on the OUTSTANDING principal (principal - paidToDate)', async () => {
    // outstanding = 100000 - 40000 = 60000; 20% p.a.; 365 days => 12000.00
    const debt = {
      id: 'd2',
      principal: dec(100000),
      paidToDate: dec(40000),
      currency: 'USD',
      dueDate: day('2025-07-01'),
      ratePct: dec(20),
    };
    const { service, prisma } = makeService({ otherDebts: [debt] });
    await service.accrueAll(day('2026-07-01'));
    const update = prisma.otherTaxDebt.update.mock.calls[0][0];
    expect(Number(update.data.accruedInterest)).toBeCloseTo(12000, 2);
  });

  it('accrues assessment interest at the statutory zimra_interest_pct rate', async () => {
    // assessed 50000, statutory 25% p.a., 365 days => 12500.00
    const assessment = {
      id: 'a1',
      assessedAmount: dec(50000),
      currency: 'USD',
      dueDate: day('2025-07-01'),
      taxType: 'VAT',
    };
    const { service, prisma } = makeService({ assessments: [assessment], statutoryRate: 25 });

    const res = await service.accrueAll(day('2026-07-01'));

    expect(res.assessments).toBe(1);
    const update = prisma.zimraAssessment.update.mock.calls[0][0];
    expect(Number(update.data.accruedInterest)).toBeCloseTo(12500, 2);
  });

  it('falls back to the Zimbabwe default (25%) when no statutory rate is configured', async () => {
    const assessment = {
      id: 'a2',
      assessedAmount: dec(50000),
      currency: 'USD',
      dueDate: day('2025-07-01'),
      taxType: 'VAT',
    };
    const { service, prisma } = makeService({ assessments: [assessment], statutoryRate: null });
    await service.accrueAll(day('2026-07-01'));
    const update = prisma.zimraAssessment.update.mock.calls[0][0];
    // default 25% => 50000 * 25/100 * 365/365 = 12500.00
    expect(Number(update.data.accruedInterest)).toBeCloseTo(12500, 2);
  });

  it('accrues zero on a debt that is not yet overdue', async () => {
    const debt = {
      id: 'd3',
      principal: dec(100000),
      paidToDate: dec(0),
      currency: 'USD',
      dueDate: day('2027-01-01'),
      ratePct: dec(20),
    };
    const { service, prisma } = makeService({ otherDebts: [debt] });
    await service.accrueAll(day('2026-07-01'));
    const update = prisma.otherTaxDebt.update.mock.calls[0][0];
    expect(Number(update.data.accruedInterest)).toBe(0);
  });

  it('is idempotent: re-running writes the same amount (no accumulation)', async () => {
    const debt = {
      id: 'd4',
      principal: dec(100000),
      paidToDate: dec(0),
      currency: 'USD',
      dueDate: day('2025-07-01'),
      ratePct: dec(20),
    };
    const { service, prisma } = makeService({ otherDebts: [debt] });
    await service.accrueAll(day('2026-07-01'));
    await service.accrueAll(day('2026-07-01'));
    const first = Number(prisma.otherTaxDebt.update.mock.calls[0][0].data.accruedInterest);
    const second = Number(prisma.otherTaxDebt.update.mock.calls[1][0].data.accruedInterest);
    expect(second).toBe(first);
  });
});
