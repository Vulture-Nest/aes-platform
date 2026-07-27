import { LoanInterestService } from '../financial/domain/loan-interest.service';
import { OrderFinancialsService } from '../financial/domain/order-financials.service';
import { OrderHealthService } from '../financial/domain/order-health.service';
import { ParityService } from './parity.service';

describe('ParityService', () => {
  const health = { compute: jest.fn() };
  const performance = { compute: jest.fn() };
  const prisma = {
    order: { findMany: jest.fn() },
    orderExpense: { findMany: jest.fn() },
    orderReceipt: { findMany: jest.fn() },
    loan: { findMany: jest.fn() },
    taxLedger: { findMany: jest.fn() },
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
    new OrderFinancialsService(),
    new OrderHealthService(),
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
    // The order.findMany stub must serve BOTH the profit query (select valueExVat) and the
    // per-order granular query (include receipts/expenses/milestones). Its receipt (52463.42)
    // and value (144100) are chosen so the per-order lines reconcile to the mocked headlines:
    //   cash        = 52463.42
    //   receivables = 144100 * 1.155 − 52463.42 = 113972.08
    prisma.order.findMany.mockResolvedValue([
      {
        reference: 'ORD-1',
        valueExVat: 144100,
        currency: 'USD',
        serviced: true,
        closingDate: null,
        receipts: [{ amount: 52463.42, currency: 'USD' }],
        expenses: [{ amount: 53850 }],
        milestones: [],
      },
    ]);
    prisma.orderExpense.findMany.mockResolvedValue([{ amount: 53850 }]);
    prisma.taxLedger.findMany.mockResolvedValue([
      { taxType: 'VAT', periodMonth: 'IMPORT', amountDue: 52062.83, amountPaid: 0 },
    ]);
    // A single loan whose accrued interest at the snapshot is 14054.29 (net profit → 76195.71):
    // 25553.25 principal * 0.05/week * 11 weeks (2026-05-08 → 2026-07-24) = 14054.29.
    prisma.loan.findMany.mockResolvedValue([
      { principal: 25553.25, weeklyRatePct: 5, startDate: new Date('2026-05-08T00:00:00.000Z') },
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
    // Orders are queried twice: once for the order-centric profit (select valueExVat)
    // and once for the granular per-order checks (include receipts/expenses/milestones).
    expect(prisma.order.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.orderExpense.findMany).toHaveBeenCalledTimes(1);
    // The Performance panel is NOT used for the profit headline.
    expect(performance.compute).not.toHaveBeenCalled();
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

  it('emits granular per-order and per-tax-line checks that reconcile at $0.01 (G23)', async () => {
    stubMatching();
    const res = await service.check(new Date('2026-07-24T00:00:00.000Z'));
    expect(res.granularTolerance).toBe(0.01);
    // One order line, reconciling its identities.
    expect(res.orderChecks).toHaveLength(1);
    expect(res.orderChecks[0].reference).toBe('ORD-1');
    expect(res.orderChecks.every((o) => o.pass)).toBe(true);
    // One tax line, net = due − paid.
    expect(res.taxChecks).toHaveLength(1);
    expect(res.taxChecks[0].net).toBe(52062.83);
    expect(res.taxChecks.every((t) => t.pass)).toBe(true);
  });

  it('reports allPass true when headlines, verdict and every granular line pass', async () => {
    stubMatching();
    const res = await service.check(new Date('2026-07-24T00:00:00.000Z'));
    expect(res.verdict).toBe('ACT');
    expect(res.allPass).toBe(true);
  });
});
