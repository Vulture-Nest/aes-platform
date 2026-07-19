import { Prisma, TaxType } from '@prisma/client';
import { PerformanceService } from '../../financial/domain/performance.service';
import { TaxLedgerConsolidationService } from '../../financial/domain/tax-ledger-consolidation.service';
import { ZimraReconciliationService } from '../../financial/domain/zimra-reconciliation.service';
import { TaxExposureService } from './tax-exposure.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

/**
 * Build a service under test with a mocked PrismaService + StatutoryRatesService
 * and REAL pure domain services (they carry the Appendix A math we want to
 * exercise end-to-end). Each Prisma model's findMany returns [] by default;
 * tests override per-model as needed.
 */
function makeService(overrides?: {
  taxLedger?: any[];
  zimraAssessment?: any[];
  order?: any[];
  contractClaim?: any[];
  orderExpense?: any[];
  generalExpense?: any[];
  overhead?: any[];
  loanInterest?: any[];
  statutory?: Record<string, number | null>;
}) {
  const taxLedgerRows = overrides?.taxLedger ?? [];
  const prisma = {
    // Honour the taxType filter the service passes, like Prisma would.
    taxLedger: {
      findMany: jest.fn(async ({ where }: { where: { taxType: string } }) =>
        taxLedgerRows.filter((r) => r.taxType === where.taxType),
      ),
    },
    zimraAssessment: {
      findMany: jest.fn().mockResolvedValue(overrides?.zimraAssessment ?? []),
    },
    order: { findMany: jest.fn().mockResolvedValue(overrides?.order ?? []) },
    contractClaim: { findMany: jest.fn().mockResolvedValue(overrides?.contractClaim ?? []) },
    orderExpense: { findMany: jest.fn().mockResolvedValue(overrides?.orderExpense ?? []) },
    generalExpense: {
      findMany: jest.fn().mockResolvedValue(overrides?.generalExpense ?? []),
    },
    overhead: { findMany: jest.fn().mockResolvedValue(overrides?.overhead ?? []) },
    loanInterest: { findMany: jest.fn().mockResolvedValue(overrides?.loanInterest ?? []) },
  };

  const statutoryRates = {
    valueAsOf: jest.fn(async (key: string) => {
      const table = overrides?.statutory;
      if (table && key in table) {
        return { value: table[key] === null ? null : dec(table[key] as number) };
      }
      // Simulate an unseeded reference table -> service falls back to defaults.
      throw new Error(`No statutory value for "${key}"`);
    }),
  };

  const service = new TaxExposureService(
    prisma as any,
    new TaxLedgerConsolidationService(),
    new ZimraReconciliationService(),
    new PerformanceService(),
    statutoryRates as any,
  );

  return { service, prisma, statutoryRates };
}

describe('TaxExposureService.compute', () => {
  it('returns zeroed lines and an empty assessment list when there is no data', async () => {
    const { service } = makeService();

    const result = await service.compute({ asOf: new Date('2026-07-19') });

    expect(result.currency).toBe('USD');
    expect(result.vat).toEqual(
      expect.objectContaining({ taxType: TaxType.VAT, due: 0, paid: 0, net: 0 }),
    );
    expect(result.paye).toEqual(
      expect.objectContaining({ taxType: TaxType.PAYE, due: 0, paid: 0, net: 0 }),
    );
    expect(result.assessments).toEqual([]);
    expect(result.assessmentTotals).toEqual({
      count: 0,
      assessedAmount: 0,
      accruedInterest: 0,
      totalWithInterest: 0,
    });
    // No profit -> zero provision, still clearly flagged as an estimate.
    expect(result.corporateIncomeTax.estimate).toBe(true);
    expect(result.corporateIncomeTax.operatingProfit).toBe(0);
    expect(result.corporateIncomeTax.provision).toBe(0);
    expect(result.corporateIncomeTax.effectiveRatePct).toBe(0);
    expect(result.totalExposure).toBe(0);
  });

  it('consolidates net VAT + net PAYE, ages assessments with interest, and estimates CIT', async () => {
    const { service } = makeService({
      // VAT: due 1500, paid 500 -> net 1000. PAYE: due 800, paid 800 -> net 0.
      taxLedger: [
        { taxType: TaxType.VAT, currency: 'USD', amountDue: dec(1500), amountPaid: dec(500) },
        { taxType: TaxType.PAYE, currency: 'USD', amountDue: dec(800), amountPaid: dec(800) },
      ],
      // One assessment overdue by 100 days: 10000 @ 25% p.a. => 10000*0.25*100/365 = 684.93.
      zimraAssessment: [
        {
          id: 'z1',
          taxType: TaxType.VAT,
          currency: 'USD',
          assessedAmount: dec(10000),
          dueDate: new Date('2026-04-10'),
        },
      ],
      // Income: serviced order 100000 ex VAT + claim 20000 = 120000.
      order: [{ valueExVat: dec(100000), serviced: true, currency: 'USD' }],
      contractClaim: [{ amountExVat: dec(20000), currency: 'USD' }],
      // Expenses: order 10000 + general 5000 + overheads 5000 + loan interest 0 = 20000.
      orderExpense: [{ amount: dec(10000), currency: 'USD' }],
      generalExpense: [{ amount: dec(5000), currency: 'USD' }],
      overhead: [{ amount: dec(5000), currency: 'USD' }],
      loanInterest: [],
    });

    // asOf 100 days after the assessment due date.
    const result = await service.compute({ asOf: new Date('2026-07-19') });

    // Ledger nets.
    expect(result.vat.net).toBe(1000);
    expect(result.paye.net).toBe(0);

    // Assessment ageing + interest.
    expect(result.assessments).toHaveLength(1);
    const a = result.assessments[0];
    expect(a.id).toBe('z1');
    expect(a.daysOverdue).toBe(100);
    expect(a.accruedInterest).toBeCloseTo(684.93, 2);
    expect(a.totalWithInterest).toBeCloseTo(10684.93, 2);
    expect(result.assessmentTotals.count).toBe(1);
    expect(result.assessmentTotals.totalWithInterest).toBeCloseTo(10684.93, 2);

    // CIT estimate: operating profit = 120000 - 20000 = 100000.
    // cit = 100000 * 25% = 25000; levy = 25000 * 3% = 750; provision = 25750.
    const cit = result.corporateIncomeTax;
    expect(cit.estimate).toBe(true);
    expect(cit.operatingProfit).toBe(100000);
    expect(cit.citRatePct).toBe(25);
    expect(cit.aidsLevyPct).toBe(3);
    expect(cit.corporateIncomeTax).toBe(25000);
    expect(cit.aidsLevy).toBe(750);
    expect(cit.provision).toBe(25750);
    expect(cit.effectiveRatePct).toBe(25.75);
    expect(cit.note).toContain('ESTIMATE');

    // Total exposure = netVat 1000 + netPaye 0 + assessments 10684.93 + provision 25750.
    expect(result.totalExposure).toBeCloseTo(37434.93, 2);
  });

  it('floors recoverable (negative) net positions at zero in the roll-up', async () => {
    const { service } = makeService({
      // VAT paid exceeds due -> recoverable (negative) net, floored to 0 in total.
      taxLedger: [
        { taxType: TaxType.VAT, currency: 'USD', amountDue: dec(200), amountPaid: dec(500) },
      ],
    });

    const result = await service.compute({ asOf: new Date('2026-07-19') });

    expect(result.vat.net).toBe(-300);
    // Recoverable position must not reduce the exposure below zero.
    expect(result.totalExposure).toBe(0);
  });

  it('uses configured statutory rates when the reference table is seeded', async () => {
    const { service, statutoryRates } = makeService({
      order: [{ valueExVat: dec(1000), serviced: true, currency: 'USD' }],
      statutory: {
        corporate_income_tax_pct: 24,
        aids_levy_pct: 3,
        zimra_interest_pct: 30,
      },
    });

    const result = await service.compute({ asOf: new Date('2026-07-19') });

    expect(statutoryRates.valueAsOf).toHaveBeenCalledWith(
      'corporate_income_tax_pct',
      expect.any(Date),
    );
    expect(result.corporateIncomeTax.citRatePct).toBe(24);
    // op profit 1000 -> cit 240, levy 7.2, provision 247.2.
    expect(result.corporateIncomeTax.corporateIncomeTax).toBe(240);
    expect(result.corporateIncomeTax.aidsLevy).toBe(7.2);
    expect(result.corporateIncomeTax.provision).toBe(247.2);
  });

  it('does not accrue interest on assessments that are not yet due', async () => {
    const { service } = makeService({
      zimraAssessment: [
        {
          id: 'future',
          taxType: TaxType.PAYE,
          currency: 'USD',
          assessedAmount: dec(5000),
          dueDate: new Date('2026-12-31'),
        },
      ],
    });

    const result = await service.compute({ asOf: new Date('2026-07-19') });

    expect(result.assessments[0].daysOverdue).toBe(0);
    expect(result.assessments[0].accruedInterest).toBe(0);
    expect(result.assessments[0].totalWithInterest).toBe(5000);
  });
});
