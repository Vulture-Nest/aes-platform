import { Prisma } from '@prisma/client';
import { IncomeTaxProvisionService } from './income-tax-provision.service';

const dec = (n: number) => new Prisma.Decimal(n);

describe('IncomeTaxProvisionService', () => {
  const statutory = { valueAsOf: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new IncomeTaxProvisionService(statutory as any);

  beforeEach(() => jest.clearAllMocks());

  it('uses the 0.25 income-tax + 0.03 AIDS levy defaults when unseeded', async () => {
    statutory.valueAsOf.mockRejectedValue(new Error('no rate'));
    const res = await service.estimate(100000);
    expect(res.incomeTaxRate).toBe(0.25);
    expect(res.aidsLevyRate).toBe(0.03);
    expect(res.combinedRate).toBe(0.28);
    expect(res.provision).toBe(28000); // 100000 * 0.28
    expect(res.estimate).toBe(true);
  });

  it('floors the provision at 0 for a loss (no tax on negative profit)', async () => {
    statutory.valueAsOf.mockRejectedValue(new Error('no rate'));
    const res = await service.estimate(-5000);
    expect(res.operatingProfit).toBe(0);
    expect(res.provision).toBe(0);
  });

  it('normalises percentage-stored rates to fractions (income_tax_pct 25 => 0.25)', async () => {
    statutory.valueAsOf.mockImplementation((key: string) => {
      if (key === 'income_tax_pct') return Promise.resolve({ value: dec(25) });
      if (key === 'aids_levy_pct') return Promise.resolve({ value: dec(3) });
      return Promise.reject(new Error('unknown'));
    });
    const res = await service.estimate(10000);
    expect(res.incomeTaxRate).toBe(0.25);
    expect(res.aidsLevyRate).toBe(0.03);
    expect(res.provision).toBe(2800);
  });

  it('accepts fraction-stored rates directly (income_tax_pct 0.25)', async () => {
    statutory.valueAsOf.mockImplementation((key: string) => {
      if (key === 'income_tax_pct') return Promise.resolve({ value: dec(0.25) });
      if (key === 'aids_levy_pct') return Promise.resolve({ value: dec(0.03) });
      return Promise.reject(new Error('unknown'));
    });
    const res = await service.estimate(10000);
    expect(res.provision).toBe(2800);
  });

  it('notes it is an estimate excluded from the health verdict', async () => {
    statutory.valueAsOf.mockRejectedValue(new Error('no rate'));
    const res = await service.estimate(1000);
    expect(res.note).toMatch(/estimate/i);
    expect(res.note.toLowerCase()).toContain('health verdict');
  });
});
