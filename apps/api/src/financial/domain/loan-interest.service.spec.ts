import { InterestMethod, LoanInterestInput, LoanInterestService } from './loan-interest.service';

/**
 * Golden-value regression net for the LoanInterest domain math. These cases
 * pin the exact arithmetic (weekly simple interest, USD/ZiG repayment, the
 * +/-0.01 settlement tolerance) so a future migration/port must reproduce them.
 */
describe('LoanInterestService', () => {
  const svc = new LoanInterestService();

  // A tight epsilon for fractional (non-rounded) floating-point comparisons.
  const EPS = 1e-9;

  const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

  describe('compute() golden values', () => {
    interface Case {
      name: string;
      input: LoanInterestInput;
      expected: {
        elapsedDays: number;
        weeksElapsed: number;
        accrued: number;
        totalDue: number;
        repaid: number;
        balance: number;
        settled: boolean;
      };
    }

    const cases: Case[] = [
      {
        name: 'exactly one week, flat, no repayment',
        input: {
          principal: 1000,
          weeklyRate: 0.05,
          startDate: day('2026-01-01'),
          asOfDate: day('2026-01-08'),
        },
        expected: {
          elapsedDays: 7,
          weeksElapsed: 1,
          accrued: 50, // 1000 * 0.05 * (7/7)
          totalDue: 1050,
          repaid: 0,
          balance: 1050,
          settled: false,
        },
      },
      {
        name: 'fractional weeks (10 days) accrue fractionally, not rounded',
        input: {
          principal: 1000,
          weeklyRate: 0.05,
          startDate: day('2026-01-01'),
          asOfDate: day('2026-01-11'),
        },
        expected: {
          elapsedDays: 10,
          weeksElapsed: 10 / 7,
          accrued: 1000 * 0.05 * (10 / 7), // 71.4285714...
          totalDue: 1000 + 1000 * 0.05 * (10 / 7),
          repaid: 0,
          balance: 1000 + 1000 * 0.05 * (10 / 7),
          settled: false,
        },
      },
      {
        name: 'before start date: no accrual, zero elapsed',
        input: {
          principal: 5000,
          weeklyRate: 0.1,
          startDate: day('2026-02-01'),
          asOfDate: day('2026-01-15'),
        },
        expected: {
          elapsedDays: 0,
          weeksElapsed: 0,
          accrued: 0,
          totalDue: 5000,
          repaid: 0,
          balance: 5000,
          settled: false,
        },
      },
      {
        name: 'asOf equals start: zero elapsed, principal only',
        input: {
          principal: 2000,
          weeklyRate: 0.03,
          startDate: day('2026-03-10'),
          asOfDate: day('2026-03-10'),
        },
        expected: {
          elapsedDays: 0,
          weeksElapsed: 0,
          accrued: 0,
          totalDue: 2000,
          repaid: 0,
          balance: 2000,
          settled: false,
        },
      },
      {
        name: 'USD + ZiG repayment converts at official rate',
        input: {
          principal: 1000,
          weeklyRate: 0.05,
          startDate: day('2026-01-01'),
          asOfDate: day('2026-01-08'),
          repaidUsd: 500,
          repaidZig: 1300, // /13 = 100 USD
          officialRate: 13,
        },
        expected: {
          elapsedDays: 7,
          weeksElapsed: 1,
          accrued: 50,
          totalDue: 1050,
          repaid: 600, // 500 + 1300/13
          balance: 450,
          settled: false,
        },
      },
      {
        name: 'boundary: balance exactly 0.01 is settled',
        input: {
          principal: 1000,
          weeklyRate: 0.05,
          startDate: day('2026-01-01'),
          asOfDate: day('2026-01-08'),
          repaidUsd: 1049.99, // totalDue 1050 -> balance 0.01
        },
        expected: {
          elapsedDays: 7,
          weeksElapsed: 1,
          accrued: 50,
          totalDue: 1050,
          repaid: 1049.99,
          balance: 0.01,
          settled: true,
        },
      },
      {
        name: 'boundary: balance just above tolerance (0.02) is NOT settled',
        input: {
          principal: 1000,
          weeklyRate: 0.05,
          startDate: day('2026-01-01'),
          asOfDate: day('2026-01-08'),
          repaidUsd: 1049.98, // balance 0.02
        },
        expected: {
          elapsedDays: 7,
          weeksElapsed: 1,
          accrued: 50,
          totalDue: 1050,
          repaid: 1049.98,
          balance: 0.02,
          settled: false,
        },
      },
      {
        name: 'over-repayment: negative balance is settled',
        input: {
          principal: 1000,
          weeklyRate: 0.05,
          startDate: day('2026-01-01'),
          asOfDate: day('2026-01-08'),
          repaidUsd: 1100,
        },
        expected: {
          elapsedDays: 7,
          weeksElapsed: 1,
          accrued: 50,
          totalDue: 1050,
          repaid: 1100,
          balance: -50,
          settled: true,
        },
      },
      {
        name: 'reducing-balance accrues on outstanding principal only',
        input: {
          principal: 1000,
          weeklyRate: 0.05,
          startDate: day('2026-01-01'),
          asOfDate: day('2026-01-08'),
          method: InterestMethod.REDUCING_BALANCE,
          principalRepaidUsd: 400, // base 600
        },
        expected: {
          elapsedDays: 7,
          weeksElapsed: 1,
          accrued: 30, // 600 * 0.05 * 1
          totalDue: 1030,
          repaid: 0,
          balance: 1030,
          settled: false,
        },
      },
      {
        name: 'flat (default) ignores principalRepaidUsd for accrual base',
        input: {
          principal: 1000,
          weeklyRate: 0.05,
          startDate: day('2026-01-01'),
          asOfDate: day('2026-01-08'),
          principalRepaidUsd: 400, // ignored when flat
        },
        expected: {
          elapsedDays: 7,
          weeksElapsed: 1,
          accrued: 50, // still on full 1000
          totalDue: 1050,
          repaid: 0,
          balance: 1050,
          settled: false,
        },
      },
      {
        name: 'reducing-balance fully repaid principal accrues nothing',
        input: {
          principal: 1000,
          weeklyRate: 0.05,
          startDate: day('2026-01-01'),
          asOfDate: day('2026-01-08'),
          method: InterestMethod.REDUCING_BALANCE,
          principalRepaidUsd: 1200, // over-repaid -> base floored at 0
        },
        expected: {
          elapsedDays: 7,
          weeksElapsed: 1,
          accrued: 0,
          totalDue: 1000,
          repaid: 0,
          balance: 1000,
          settled: false,
        },
      },
    ];

    it.each(cases)('$name', ({ input, expected }) => {
      const result = svc.compute(input);
      expect(result.elapsedDays).toBe(expected.elapsedDays);
      expect(result.weeksElapsed).toBeCloseTo(expected.weeksElapsed, 12);
      expect(result.accrued).toBeCloseTo(expected.accrued, 9);
      expect(result.totalDue).toBeCloseTo(expected.totalDue, 9);
      expect(result.repaid).toBeCloseTo(expected.repaid, 9);
      expect(result.balance).toBeCloseTo(expected.balance, 9);
      expect(result.settled).toBe(expected.settled);
    });
  });

  describe('dailyAccrual() golden values', () => {
    interface Case {
      name: string;
      input: {
        principal: number;
        weeklyRate: number;
        method?: InterestMethod;
        principalRepaidUsd?: number;
      };
      expected: number;
    }

    const cases: Case[] = [
      {
        name: 'flat: principal * weeklyRate / 7',
        input: { principal: 1000, weeklyRate: 0.05 },
        expected: (1000 * 0.05) / 7,
      },
      {
        name: 'reducing-balance: outstanding * weeklyRate / 7',
        input: {
          principal: 1000,
          weeklyRate: 0.05,
          method: InterestMethod.REDUCING_BALANCE,
          principalRepaidUsd: 400,
        },
        expected: (600 * 0.05) / 7,
      },
      {
        name: 'reducing-balance over-repaid floors base at 0',
        input: {
          principal: 1000,
          weeklyRate: 0.05,
          method: InterestMethod.REDUCING_BALANCE,
          principalRepaidUsd: 5000,
        },
        expected: 0,
      },
    ];

    it.each(cases)('$name', ({ input, expected }) => {
      expect(svc.dailyAccrual(input)).toBeCloseTo(expected, 9);
    });

    it('7 daily accruals reconstruct one weeks flat interest', () => {
      const perDay = svc.dailyAccrual({ principal: 1000, weeklyRate: 0.05 });
      const oneWeek = svc.accruedInterest({
        principal: 1000,
        weeklyRate: 0.05,
        startDate: day('2026-01-01'),
        asOfDate: day('2026-01-08'),
      });
      expect(perDay * 7).toBeCloseTo(oneWeek, EPS);
      expect(oneWeek).toBeCloseTo(50, 9);
    });
  });

  describe('repaidUsdEquivalent() edge cases', () => {
    it('ignores ZiG when officialRate is missing (no divide-by-zero)', () => {
      expect(svc.repaidUsdEquivalent({ repaidUsd: 100, repaidZig: 1300 })).toBe(100);
    });

    it('ignores ZiG when officialRate is zero', () => {
      expect(svc.repaidUsdEquivalent({ repaidUsd: 100, repaidZig: 1300, officialRate: 0 })).toBe(
        100,
      );
    });

    it('defaults all repayment inputs to zero', () => {
      expect(svc.repaidUsdEquivalent({})).toBe(0);
    });
  });

  describe('isSettled() tolerance boundary', () => {
    const cases: Array<[number, boolean]> = [
      [-0.5, true],
      [0, true],
      [0.01, true],
      [0.010001, false],
      [0.02, false],
      [100, false],
    ];

    it.each(cases)('balance %p -> settled %p', (balance, expected) => {
      expect(svc.isSettled(balance)).toBe(expected);
    });
  });

  describe('elapsedDays()', () => {
    it('counts whole days and floors partial days', () => {
      const start = day('2026-01-01');
      const asOf = new Date('2026-01-03T12:00:00.000Z'); // 2.5 days
      expect(svc.elapsedDays(start, asOf)).toBe(2);
    });

    it('is zero when asOf precedes start', () => {
      expect(svc.elapsedDays(day('2026-01-10'), day('2026-01-01'))).toBe(0);
    });
  });
});
