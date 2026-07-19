import {
  ContractStatus,
  ContractVarianceInput,
  ContractVarianceResult,
  ContractVarianceService,
} from './contract-variance.service';

describe('ContractVarianceService', () => {
  const service = new ContractVarianceService();

  describe('contractMonths', () => {
    const cases: Array<{ name: string; start: string; end: string; expected: number }> = [
      { name: 'same month, same day => 1', start: '2025-01-15', end: '2025-01-15', expected: 1 },
      { name: 'within a single month => 1', start: '2025-01-01', end: '2025-01-31', expected: 1 },
      { name: 'exactly 12 months inclusive', start: '2025-01-01', end: '2025-12-31', expected: 12 },
      { name: 'spanning a year boundary', start: '2025-11-01', end: '2026-02-28', expected: 4 },
      { name: 'multi-year span', start: '2024-03-01', end: '2026-03-31', expected: 25 },
    ];

    it.each(cases)('$name', ({ start, end, expected }) => {
      expect(service.contractMonths(new Date(start), new Date(end))).toBe(expected);
    });
  });

  describe('monthsElapsed', () => {
    const cases: Array<{
      name: string;
      start: string;
      asOf: string;
      contractMonths: number;
      expected: number;
    }> = [
      {
        name: '0 before the contract starts',
        start: '2025-03-01',
        asOf: '2025-02-15',
        contractMonths: 12,
        expected: 0,
      },
      {
        name: '1 in the first month',
        start: '2025-03-01',
        asOf: '2025-03-20',
        contractMonths: 12,
        expected: 1,
      },
      {
        name: 'counts inclusive calendar months mid-contract',
        start: '2025-01-01',
        asOf: '2025-06-15',
        contractMonths: 12,
        expected: 6,
      },
      {
        name: 'capped at contractMonths after the end',
        start: '2025-01-01',
        asOf: '2030-01-01',
        contractMonths: 12,
        expected: 12,
      },
    ];

    it.each(cases)('$name', ({ start, asOf, contractMonths, expected }) => {
      expect(service.monthsElapsed(new Date(start), new Date(asOf), contractMonths)).toBe(expected);
    });
  });

  describe('status', () => {
    const cases: Array<{
      name: string;
      start: string;
      end: string;
      asOf: string;
      expected: ContractStatus;
    }> = [
      {
        name: 'Upcoming before start',
        start: '2025-06-01',
        end: '2025-12-31',
        asOf: '2025-05-31',
        expected: ContractStatus.Upcoming,
      },
      {
        name: 'Active on the start boundary',
        start: '2025-06-01',
        end: '2025-12-31',
        asOf: '2025-06-01',
        expected: ContractStatus.Active,
      },
      {
        name: 'Active mid-window',
        start: '2025-06-01',
        end: '2025-12-31',
        asOf: '2025-09-15',
        expected: ContractStatus.Active,
      },
      {
        name: 'Active on the end boundary',
        start: '2025-06-01',
        end: '2025-12-31',
        asOf: '2025-12-31',
        expected: ContractStatus.Active,
      },
      {
        name: 'Completed after end',
        start: '2025-06-01',
        end: '2025-12-31',
        asOf: '2026-01-01',
        expected: ContractStatus.Completed,
      },
    ];

    it.each(cases)('$name', ({ start, end, asOf, expected }) => {
      expect(service.status(new Date(start), new Date(end), new Date(asOf))).toBe(expected);
    });
  });

  describe('compute (golden values)', () => {
    const cases: Array<{
      name: string;
      input: {
        valueExVat: number;
        startDate: string;
        endDate: string;
        invoicedToDate: number;
        asOf: string;
      };
      expected: Omit<ContractVarianceResult, 'monthlyBudget'> & { monthlyBudget: number };
    }> = [
      {
        name: 'on-track: invoiced exactly the straight-line amount',
        input: {
          valueExVat: 12000,
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          invoicedToDate: 6000,
          asOf: '2025-06-15',
        },
        expected: {
          contractMonths: 12,
          monthlyBudget: 1000,
          monthsElapsed: 6,
          shouldHaveInvoiced: 6000,
          variance: 0,
          isOverClaimed: false,
          status: ContractStatus.Active,
        },
      },
      {
        name: 'over-claimed (red): invoiced ahead of schedule',
        input: {
          valueExVat: 12000,
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          invoicedToDate: 9000,
          asOf: '2025-06-15',
        },
        expected: {
          contractMonths: 12,
          monthlyBudget: 1000,
          monthsElapsed: 6,
          shouldHaveInvoiced: 6000,
          variance: 3000,
          isOverClaimed: true,
          status: ContractStatus.Active,
        },
      },
      {
        name: 'under-claimed: invoiced behind schedule (negative variance)',
        input: {
          valueExVat: 12000,
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          invoicedToDate: 4000,
          asOf: '2025-06-15',
        },
        expected: {
          contractMonths: 12,
          monthlyBudget: 1000,
          monthsElapsed: 6,
          shouldHaveInvoiced: 6000,
          variance: -2000,
          isOverClaimed: false,
          status: ContractStatus.Active,
        },
      },
      {
        name: 'boundary: variance within tolerance (+0.01) is not over-claimed',
        input: {
          valueExVat: 12000,
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          invoicedToDate: 6000.01,
          asOf: '2025-06-15',
        },
        expected: {
          contractMonths: 12,
          monthlyBudget: 1000,
          monthsElapsed: 6,
          shouldHaveInvoiced: 6000,
          variance: 0.01,
          isOverClaimed: false,
          status: ContractStatus.Active,
        },
      },
      {
        name: 'boundary: variance just above tolerance (+0.02) is over-claimed',
        input: {
          valueExVat: 12000,
          startDate: '2025-01-01',
          endDate: '2025-12-31',
          invoicedToDate: 6000.02,
          asOf: '2025-06-15',
        },
        expected: {
          contractMonths: 12,
          monthlyBudget: 1000,
          monthsElapsed: 6,
          shouldHaveInvoiced: 6000,
          variance: 0.02,
          isOverClaimed: true,
          status: ContractStatus.Active,
        },
      },
      {
        name: 'before start: nothing should have been invoiced, Upcoming',
        input: {
          valueExVat: 12000,
          startDate: '2025-06-01',
          endDate: '2026-05-31',
          invoicedToDate: 0,
          asOf: '2025-05-01',
        },
        expected: {
          contractMonths: 12,
          monthlyBudget: 1000,
          monthsElapsed: 0,
          shouldHaveInvoiced: 0,
          variance: 0,
          isOverClaimed: false,
          status: ContractStatus.Upcoming,
        },
      },
      {
        name: 'after end: full value expected, Completed, fully invoiced',
        input: {
          valueExVat: 12000,
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          invoicedToDate: 12000,
          asOf: '2025-07-19',
        },
        expected: {
          contractMonths: 12,
          monthlyBudget: 1000,
          monthsElapsed: 12,
          shouldHaveInvoiced: 12000,
          variance: 0,
          isOverClaimed: false,
          status: ContractStatus.Completed,
        },
      },
      {
        name: 'single-month contract',
        input: {
          valueExVat: 5000,
          startDate: '2025-04-01',
          endDate: '2025-04-30',
          invoicedToDate: 5000,
          asOf: '2025-04-15',
        },
        expected: {
          contractMonths: 1,
          monthlyBudget: 5000,
          monthsElapsed: 1,
          shouldHaveInvoiced: 5000,
          variance: 0,
          isOverClaimed: false,
          status: ContractStatus.Active,
        },
      },
    ];

    it.each(cases)('$name', ({ input, expected }) => {
      const typed: ContractVarianceInput = {
        valueExVat: input.valueExVat,
        startDate: new Date(input.startDate),
        endDate: new Date(input.endDate),
        invoicedToDate: input.invoicedToDate,
        asOf: new Date(input.asOf),
      };
      const result = service.compute(typed);
      expect(result.contractMonths).toBe(expected.contractMonths);
      expect(result.monthlyBudget).toBeCloseTo(expected.monthlyBudget, 6);
      expect(result.monthsElapsed).toBe(expected.monthsElapsed);
      expect(result.shouldHaveInvoiced).toBeCloseTo(expected.shouldHaveInvoiced, 6);
      expect(result.variance).toBeCloseTo(expected.variance, 6);
      expect(result.isOverClaimed).toBe(expected.isOverClaimed);
      expect(result.status).toBe(expected.status);
    });
  });
});
