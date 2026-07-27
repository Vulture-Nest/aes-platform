import { LoanInterestService } from '../financial/domain/loan-interest.service';
import { ParityService } from './parity.service';

describe('ParityService', () => {
  const health = { compute: jest.fn() };
  const performance = { compute: jest.fn() };
  const prisma = {
    order: { findMany: jest.fn() },
    orderExpense: { findMany: jest.fn() },
    loan: { findMany: jest.fn() },
  };
  const loanInterest = new LoanInterestService();
  const service = new ParityService(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    health as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    performance as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    prisma as any,
    loanInterest,
  );

  beforeEach(() => jest.clearAllMocks());

  /** Drivers + order data that reproduce the expected workbook figures exactly. */
  function stubMatching() {
    health.compute.mockResolvedValue({
      verdict: 'ACT',
      drivers: {
        totalCashReceived: 52463.42,
        receivables: 113972.08,
        taxLiability: 52062.83,
        loanBalance: 44054.29,
      },
    });
    // Order-centric operating profit ex VAT = Σ value ex VAT (144100) − Σ order expenses (53850) = 90250.
    prisma.order.findMany.mockResolvedValue([{ valueExVat: 144100 }]);
    prisma.orderExpense.findMany.mockResolvedValue([{ amount: 53850 }]);
    // A single loan whose accrued interest at the snapshot is 14054.29 (net profit → 76195.71).
    // 40000 principal * 0.05/week * (49.19 weeks) ≈ 14054.29; use an explicit start date.
    prisma.loan.findMany.mockResolvedValue([
      { principal: 36000, weeklyRatePct: 5, startDate: new Date('2026-05-08T00:00:00.000Z') },
    ]);
  }

  it('passes when the recomputed figures match within tolerance', async () => {
    stubMatching();
    // Order profit is deterministic; loan interest depends on the snapshot date passed in.
    const res = await service.check(new Date('2026-07-24T00:00:00.000Z'));
    const opProfit = res.checks.find((c) => c.name === 'Operating profit ex VAT');
    expect(opProfit?.actual).toBe(90250);
    expect(opProfit?.pass).toBe(true);
    expect(res.verdictPass).toBe(true);
  });

  it('recomputes profit from order data, not the holistic Performance panel', async () => {
    stubMatching();
    await service.check();
    expect(prisma.order.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.orderExpense.findMany).toHaveBeenCalledTimes(1);
    // The health-verdict panel still supplies cash/receivables/tax/loan + the verdict.
    expect(health.compute).toHaveBeenCalledTimes(1);
  });

  it('annotates the order-centric operating-profit definition', async () => {
    stubMatching();
    const res = await service.check();
    const opProfit = res.checks.find((c) => c.name === 'Operating profit ex VAT');
    expect(opProfit?.note).toMatch(/order-centric/i);
  });

  it('fails a check when a figure drifts beyond $1', async () => {
    stubMatching();
    health.compute.mockResolvedValue({
      verdict: 'ACT',
      drivers: { totalCashReceived: 52463.42, receivables: 113972.08, taxLiability: 52062.83, loanBalance: 44000 },
    });
    const res = await service.check();
    const loan = res.checks.find((c) => c.name === 'Loan balance');
    expect(loan?.pass).toBe(false);
    expect(res.allPass).toBe(false);
  });

  it('fails overall when the verdict differs', async () => {
    stubMatching();
    health.compute.mockResolvedValue({
      verdict: 'HEALTHY',
      drivers: { totalCashReceived: 52463.42, receivables: 113972.08, taxLiability: 52062.83, loanBalance: 44054.29 },
    });
    const res = await service.check();
    expect(res.verdictPass).toBe(false);
    expect(res.allPass).toBe(false);
  });
});
