import { Prisma } from '@prisma/client';
import { IncomeTaxProvisionService } from '../../financial/domain/income-tax-provision.service';
import { PerformanceService } from '../../financial/domain/performance.service';
import { PerformancePanelService } from './performance-panel.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

describe('PerformancePanelService — G19 income-tax provision info line', () => {
  function makeService() {
    const prisma = {
      order: { findMany: jest.fn().mockResolvedValue([]) },
      contractClaim: { findMany: jest.fn().mockResolvedValue([]) },
      orderExpense: { findMany: jest.fn().mockResolvedValue([]) },
      generalExpense: { findMany: jest.fn().mockResolvedValue([]) },
      overhead: { findMany: jest.fn().mockResolvedValue([]) },
      loanInterest: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const exchangeRates = { rateAsOf: jest.fn() };
    const statutory = { valueAsOf: jest.fn().mockRejectedValue(new Error('unseeded')) };
    const service = new PerformancePanelService(
      prisma as any,
      exchangeRates as any,
      new PerformanceService(),
      new IncomeTaxProvisionService(statutory as any),
    );
    return { service, prisma };
  }

  it('surfaces the provision as an info line WITHOUT reducing operating profit', async () => {
    const { service, prisma } = makeService();
    // Serviced order income 100000, no expenses => operating profit 100000.
    prisma.order.findMany.mockResolvedValue([
      { valueExVat: dec(100000), currency: 'USD', serviced: true },
    ]);

    const res = await service.compute({ asOf: new Date('2026-07-24T00:00:00Z') });

    expect(res.operatingProfit).toBe(100000); // unchanged by the provision
    expect(res.incomeTaxProvision.estimate).toBe(true);
    expect(res.incomeTaxProvision.operatingProfit).toBe(100000);
    // Default 25% + 3% = 28% of 100000.
    expect(res.incomeTaxProvision.provision).toBe(28000);
  });

  it('provision is zero when operating profit is a loss', async () => {
    const { service, prisma } = makeService();
    prisma.overhead.findMany.mockResolvedValue([{ amount: dec(5000), currency: 'USD' }]);

    const res = await service.compute();
    expect(res.operatingProfit).toBe(-5000);
    expect(res.incomeTaxProvision.provision).toBe(0);
  });
});
