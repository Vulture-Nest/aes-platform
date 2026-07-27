import { Prisma } from '@prisma/client';
import { HealthVerdict, HealthVerdictService } from '../../financial/domain/health-verdict.service';
import { LoanInterestService } from '../../financial/domain/loan-interest.service';
import { TaxLedgerConsolidationService } from '../../financial/domain/tax-ledger-consolidation.service';
import { HealthVerdictPanelService } from './health-verdict.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

/** Order value + 15.5% VAT (receivables are the VAT-inclusive balance owed). */
const inclVat = (exVat: number) => exVat * 1.155;
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

function makePanel() {
  const prisma = {
    order: { findMany: jest.fn().mockResolvedValue([]) },
    taxLedger: { findMany: jest.fn().mockResolvedValue([]) },
    otherTaxDebt: { findMany: jest.fn().mockResolvedValue([]) },
    zimraAssessment: { findMany: jest.fn().mockResolvedValue([]) },
    loan: { findMany: jest.fn().mockResolvedValue([]) },
  };
  // Default: an official USD/ZWG rate of 30 (1 USD = 30 ZWG).
  const exchangeRates = {
    rateAsOf: jest.fn().mockResolvedValue({ rate: '30' }),
  };
  const healthVerdict = new HealthVerdictService();
  const loanInterest = new LoanInterestService();
  const taxConsolidation = new TaxLedgerConsolidationService();
  const panel = new HealthVerdictPanelService(
    prisma as any,
    healthVerdict,
    loanInterest,
    taxConsolidation,
    exchangeRates as any,
  );
  return { panel, prisma, exchangeRates };
}

describe('HealthVerdictPanelService.compute', () => {
  it('computes the A.8 verdict and driver figures from current data (USD)', async () => {
    const { panel, prisma } = makePanel();

    // One order worth 10,000 ex VAT (11,550 incl VAT) with 2,000 received
    // => 9,550 receivable, 2,000 cash.
    prisma.order.findMany.mockResolvedValue([
      {
        valueExVat: dec(10000),
        currency: 'USD',
        receipts: [{ amount: dec(2000), currency: 'USD' }],
      },
    ]);
    // Tax: 1,000 unpaid VAT ledger + 500 other debt (not overdue, no interest) + 300 ZIMRA = 1,800.
    prisma.taxLedger.findMany.mockResolvedValue([
      { amountDue: dec(1200), amountPaid: dec(200), currency: 'USD' },
    ]);
    prisma.otherTaxDebt.findMany.mockResolvedValue([
      { principal: dec(500), paidToDate: dec(0), ratePct: dec(0), dueDate: new Date('2027-01-01'), currency: 'USD' },
    ]);
    prisma.zimraAssessment.findMany.mockResolvedValue([
      { assessedAmount: dec(300), currency: 'USD' },
    ]);
    // Loan: 5,000 principal, 0% weekly (no accrual), no repayments => 5,000 balance.
    prisma.loan.findMany.mockResolvedValue([
      {
        principal: dec(5000),
        currency: 'USD',
        weeklyRatePct: dec(0),
        startDate: new Date('2026-01-01'),
        repayments: [],
      },
    ]);

    const result = await panel.compute({ asOf: new Date('2026-07-19') });

    expect(result.panel).toBe('health_verdict');
    expect(result.drivers).toEqual({
      receivables: round2(inclVat(10000) - 2000), // 9,550
      taxLiability: 1800,
      loanBalance: 5000,
      totalCashReceived: 2000,
    });
    // obligations 16,350 > cash 2,000 => ACT.
    expect(result.totalObligations).toBe(round2(9550 + 1800 + 5000));
    expect(result.watchThreshold).toBe(1000);
    expect(result.verdict).toBe(HealthVerdict.ACT);
  });

  it('accrues loan interest and floors negative per-line tax balances', async () => {
    const { panel, prisma } = makePanel();

    // Fully-collected order: 10,000 ex VAT (11,550 incl) fully received => 0 receivable.
    prisma.order.findMany.mockResolvedValue([
      {
        valueExVat: dec(10000),
        currency: 'USD',
        receipts: [{ amount: dec(11550), currency: 'USD' }],
      },
    ]);
    // Over-paid tax line: net -100, floored to 0 (no negative liability).
    prisma.taxLedger.findMany.mockResolvedValue([
      { amountDue: dec(100), amountPaid: dec(200), currency: 'USD' },
    ]);
    // 1,000 principal @ 10% / week for exactly 1 week => 100 interest, less 50 repaid = 1,050.
    prisma.loan.findMany.mockResolvedValue([
      {
        principal: dec(1000),
        currency: 'USD',
        weeklyRatePct: dec(10),
        startDate: new Date('2026-07-12'),
        repayments: [{ amount: dec(50), currency: 'USD' }],
      },
    ]);

    const result = await panel.compute({ asOf: new Date('2026-07-19') });

    expect(result.drivers.receivables).toBe(0);
    expect(result.drivers.totalCashReceived).toBe(11550);
    expect(result.drivers.taxLiability).toBe(0);
    expect(result.drivers.loanBalance).toBe(1050);
    // obligations 1,050 < cash 11,550, receivables 0 <= watch => HEALTHY.
    expect(result.verdict).toBe(HealthVerdict.HEALTHY);
  });

  it('normalises ZWG amounts to USD at the official rate (guards divide-by-zero)', async () => {
    const { panel, prisma, exchangeRates } = makePanel();
    // Rate 30 ZWG per USD.
    exchangeRates.rateAsOf.mockResolvedValue({ rate: '30' });

    // 3,000 ZWG order value => 100 USD ex VAT => 115.50 USD incl VAT receivable; no receipts.
    prisma.order.findMany.mockResolvedValue([
      { valueExVat: dec(3000), currency: 'ZWG', receipts: [] },
    ]);

    const result = await panel.compute({ asOf: new Date('2026-07-19') });

    expect(result.fxRate).toBe(30);
    expect(result.drivers.receivables).toBe(round2(inclVat(100)));
    // obligations 115.50 > cash 0 => ACT.
    expect(result.verdict).toBe(HealthVerdict.ACT);
  });

  it('does not throw and contributes 0 for ZWG when no FX rate is configured', async () => {
    const { panel, prisma, exchangeRates } = makePanel();
    exchangeRates.rateAsOf.mockRejectedValue(new Error('no rate'));

    prisma.order.findMany.mockResolvedValue([
      { valueExVat: dec(3000), currency: 'ZWG', receipts: [] },
    ]);

    const result = await panel.compute({ asOf: new Date('2026-07-19') });

    expect(result.fxRate).toBe(0);
    // ZWG receivable contributes 0 when the rate is unavailable.
    expect(result.drivers.receivables).toBe(0);
    expect(result.verdict).toBe(HealthVerdict.HEALTHY);
  });

  it('returns HEALTHY with zeroed drivers on empty data', async () => {
    const { panel } = makePanel();

    const result = await panel.compute();

    expect(result.drivers).toEqual({
      receivables: 0,
      taxLiability: 0,
      loanBalance: 0,
      totalCashReceived: 0,
    });
    expect(result.totalObligations).toBe(0);
    expect(result.watchThreshold).toBe(0);
    expect(result.verdict).toBe(HealthVerdict.HEALTHY);
    expect(typeof result.asOf).toBe('string');
  });
});
