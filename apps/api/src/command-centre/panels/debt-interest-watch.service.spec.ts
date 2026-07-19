import { Prisma } from '@prisma/client';
import { LoanInterestService } from '../../financial/domain/loan-interest.service';
import { ZimraReconciliationService } from '../../financial/domain/zimra-reconciliation.service';
import { DebtInterestWatchService } from './debt-interest-watch.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

function makePrisma() {
  return {
    loan: { findMany: jest.fn().mockResolvedValue([]) },
    otherTaxDebt: { findMany: jest.fn().mockResolvedValue([]) },
    zimraAssessment: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new DebtInterestWatchService(
    prisma as any,
    new LoanInterestService(),
    new ZimraReconciliationService(),
  );
}

describe('DebtInterestWatchService.compute', () => {
  const asOf = new Date('2026-07-19T00:00:00.000Z');

  it('returns zeroed totals and empty lines when there is no debt data', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    const result = await service.compute({ asOf });

    expect(result.asOf).toBe(asOf.toISOString());
    expect(result.loans.lines).toEqual([]);
    expect(result.loans.totalPrincipal).toBe(0);
    expect(result.loans.totalAccruedInterest).toBe(0);
    expect(result.loans.totalOutstanding).toBe(0);
    expect(result.loans.totalWeeklyBurn).toBe(0);

    expect(result.zimra.lines).toEqual([]);
    expect(result.zimra.totalDue).toBe(0);

    // Buckets still present, all zeroed — no divide-by-zero, no throw.
    expect(result.debtServiceDue).toEqual([
      { withinDays: 30, amountDue: 0, count: 0 },
      { withinDays: 60, amountDue: 0, count: 0 },
      { withinDays: 90, amountDue: 0, count: 0 },
    ]);
    // Only ACTIVE loans are queried.
    expect(prisma.loan.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: 'ACTIVE' } }),
    );
  });

  it('computes per-loan principal, accrued interest, weekly burn and outstanding', async () => {
    const prisma = makePrisma();
    // 10000 principal @ 1%/week (0.01), started exactly 7 days before asOf.
    // accrued = 10000 * 0.01 * (7/7) = 100; weekly burn = 10000 * 0.01 = 100.
    prisma.loan.findMany.mockResolvedValue([
      {
        id: 'loan-1',
        lender: 'Acme Finance',
        currency: 'USD',
        principal: dec(10000),
        weeklyRatePct: dec(1),
        interestMethod: 'FLAT',
        startDate: new Date('2026-07-12T00:00:00.000Z'),
        status: 'ACTIVE',
        repayments: [{ amount: dec(500) }],
      },
    ]);
    const service = makeService(prisma);

    const result = await service.compute({ asOf });

    expect(result.loans.lines).toHaveLength(1);
    const line = result.loans.lines[0];
    expect(line.loanId).toBe('loan-1');
    expect(line.principal).toBe(10000);
    expect(line.repaid).toBe(500);
    expect(line.accruedInterest).toBe(100);
    expect(line.weeklyBurn).toBe(100);
    // outstanding = principal + accrued - repaid = 10000 + 100 - 500 = 9600.
    expect(line.outstanding).toBe(9600);

    expect(result.loans.totalPrincipal).toBe(10000);
    expect(result.loans.totalAccruedInterest).toBe(100);
    expect(result.loans.totalWeeklyBurn).toBe(100);
    expect(result.loans.totalOutstanding).toBe(9600);
  });

  it('computes ZIMRA debt from other_tax_debt (with accruing interest) and assessments', async () => {
    const prisma = makePrisma();
    // other_tax_debt: 3650 principal @ 10% p.a., 365 days overdue => interest = 365.
    prisma.otherTaxDebt.findMany.mockResolvedValue([
      {
        id: 'otd-1',
        taxType: 'VAT',
        principal: dec(3650),
        currency: 'USD',
        dueDate: new Date('2025-07-19T00:00:00.000Z'),
        ratePct: dec(10),
      },
    ]);
    prisma.zimraAssessment.findMany.mockResolvedValue([
      {
        id: 'za-1',
        taxType: 'PAYE',
        assessedAmount: dec(2000),
        currency: 'USD',
        dueDate: new Date('2026-06-01T00:00:00.000Z'),
      },
    ]);
    const service = makeService(prisma);

    const result = await service.compute({ asOf });

    expect(result.zimra.lines).toHaveLength(2);

    const other = result.zimra.lines.find((l) => l.source === 'other_tax_debt');
    expect(other).toBeDefined();
    expect(other!.principal).toBe(3650);
    expect(other!.accruedInterest).toBe(365);
    expect(other!.total).toBe(4015);
    expect(other!.daysOverdue).toBe(365);

    const assessment = result.zimra.lines.find((l) => l.source === 'zimra_assessment');
    expect(assessment).toBeDefined();
    expect(assessment!.principal).toBe(2000);
    expect(assessment!.accruedInterest).toBe(0);
    expect(assessment!.total).toBe(2000);

    expect(result.zimra.totalPrincipal).toBe(5650);
    expect(result.zimra.totalAccruedInterest).toBe(365);
    expect(result.zimra.totalDue).toBe(6015);
  });

  it('buckets debt service due within 30 / 60 / 90 days cumulatively', async () => {
    const prisma = makePrisma();
    prisma.loan.findMany.mockResolvedValue([
      {
        id: 'loan-1',
        lender: 'Acme Finance',
        currency: 'USD',
        principal: dec(10000),
        weeklyRatePct: dec(1),
        interestMethod: 'FLAT',
        startDate: new Date('2026-07-12T00:00:00.000Z'),
        status: 'ACTIVE',
        repayments: [],
      },
    ]);
    prisma.otherTaxDebt.findMany.mockResolvedValue([
      {
        // Due in ~20 days -> lands in all three buckets.
        id: 'otd-soon',
        taxType: 'VAT',
        principal: dec(1000),
        currency: 'USD',
        dueDate: new Date('2026-08-08T00:00:00.000Z'),
        ratePct: dec(0),
      },
    ]);
    prisma.zimraAssessment.findMany.mockResolvedValue([
      {
        // Due in ~75 days -> lands only in the 90-day bucket.
        id: 'za-later',
        taxType: 'PAYE',
        assessedAmount: dec(500),
        currency: 'USD',
        dueDate: new Date('2026-10-02T00:00:00.000Z'),
      },
    ]);
    const service = makeService(prisma);

    const result = await service.compute({ asOf });

    // Loan outstanding = 10000 + 100 accrued - 0 repaid = 10100, in every bucket.
    const [d30, d60, d90] = result.debtServiceDue;

    // 30d: loan 10100 + otd 1000 = 11100 (2 items).
    expect(d30).toEqual({ withinDays: 30, amountDue: 11100, count: 2 });
    // 60d: same as 30d (assessment not yet due).
    expect(d60).toEqual({ withinDays: 60, amountDue: 11100, count: 2 });
    // 90d: adds the 500 assessment (3 items).
    expect(d90).toEqual({ withinDays: 90, amountDue: 11600, count: 3 });
  });

  it('defaults asOf to now and does not throw with a zero-rate loan (no divide-by-zero)', async () => {
    const prisma = makePrisma();
    prisma.loan.findMany.mockResolvedValue([
      {
        id: 'loan-zero',
        lender: 'Zero Co',
        currency: 'ZWG',
        principal: dec(5000),
        weeklyRatePct: dec(0),
        interestMethod: 'REDUCING',
        startDate: new Date('2026-01-01T00:00:00.000Z'),
        status: 'ACTIVE',
        repayments: [{ amount: dec(1000) }],
      },
    ]);
    const service = makeService(prisma);

    const result = await service.compute();

    const line = result.loans.lines[0];
    expect(line.accruedInterest).toBe(0);
    expect(line.weeklyBurn).toBe(0);
    // Reducing balance, zero interest: outstanding = principal - repaid = 4000.
    expect(line.outstanding).toBe(4000);
    expect(typeof result.asOf).toBe('string');
  });
});
