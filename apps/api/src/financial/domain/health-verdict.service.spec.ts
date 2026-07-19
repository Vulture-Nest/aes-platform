import { HealthVerdict, HealthVerdictInput, HealthVerdictService } from './health-verdict.service';

describe('HealthVerdictService', () => {
  const service = new HealthVerdictService();

  describe('evaluate — golden values', () => {
    interface Case {
      name: string;
      input: HealthVerdictInput;
      expected: HealthVerdict;
    }

    const cases: Case[] = [
      {
        name: 'ACT when obligations strictly exceed cash received',
        input: {
          receivables: 400,
          taxLiability: 300,
          loanBalance: 400,
          totalCashReceived: 1000,
        },
        expected: HealthVerdict.ACT,
      },
      {
        name: 'ACT takes precedence over WATCH when both would trigger',
        input: {
          receivables: 900,
          taxLiability: 100,
          loanBalance: 100,
          totalCashReceived: 1000,
        },
        expected: HealthVerdict.ACT,
      },
      {
        name: 'ACT when no cash received but obligations exist',
        input: {
          receivables: 1,
          taxLiability: 0,
          loanBalance: 0,
          totalCashReceived: 0,
        },
        expected: HealthVerdict.ACT,
      },
      {
        name: 'WATCH when receivables exceed half of cash received',
        input: {
          receivables: 600,
          taxLiability: 100,
          loanBalance: 100,
          totalCashReceived: 1000,
        },
        expected: HealthVerdict.WATCH,
      },
      {
        name: 'HEALTHY when obligations under cash and receivables at or under half',
        input: {
          receivables: 500,
          taxLiability: 100,
          loanBalance: 100,
          totalCashReceived: 1000,
        },
        expected: HealthVerdict.HEALTHY,
      },
      {
        name: 'HEALTHY at all-zero baseline',
        input: {
          receivables: 0,
          taxLiability: 0,
          loanBalance: 0,
          totalCashReceived: 0,
        },
        expected: HealthVerdict.HEALTHY,
      },
      // --- boundaries: comparisons are strict `>` ---
      {
        name: 'BOUNDARY: obligations exactly equal to cash is NOT ACT (falls to HEALTHY)',
        input: {
          receivables: 400,
          taxLiability: 300,
          loanBalance: 300,
          totalCashReceived: 1000,
        },
        expected: HealthVerdict.HEALTHY,
      },
      {
        name: 'BOUNDARY: obligations one cent over cash flips to ACT',
        input: {
          receivables: 400,
          taxLiability: 300,
          loanBalance: 300.01,
          totalCashReceived: 1000,
        },
        expected: HealthVerdict.ACT,
      },
      {
        name: 'BOUNDARY: receivables exactly half of cash is NOT WATCH (HEALTHY)',
        input: {
          receivables: 500,
          taxLiability: 0,
          loanBalance: 0,
          totalCashReceived: 1000,
        },
        expected: HealthVerdict.HEALTHY,
      },
      {
        name: 'BOUNDARY: receivables one cent over half flips to WATCH',
        input: {
          receivables: 500.01,
          taxLiability: 0,
          loanBalance: 0,
          totalCashReceived: 1000,
        },
        expected: HealthVerdict.WATCH,
      },
    ];

    it.each(cases)('$name', ({ input, expected }) => {
      expect(service.evaluate(input).verdict).toBe(expected);
    });
  });

  describe('evaluate — driver figures', () => {
    it('returns the obligations sum, watch threshold, and echoes drivers', () => {
      const result = service.evaluate({
        receivables: 600,
        taxLiability: 100,
        loanBalance: 200,
        totalCashReceived: 1000,
      });

      expect(result).toEqual({
        verdict: HealthVerdict.WATCH,
        totalObligations: 900,
        totalCashReceived: 1000,
        watchThreshold: 500,
        receivables: 600,
      });
    });
  });
});
