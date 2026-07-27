import { computeReturnState, daysToDeadline, defaultFilingDeadline } from './returns.logic';

describe('returns.logic', () => {
  const NOW = new Date('2026-07-15T09:00:00.000Z');

  describe('daysToDeadline', () => {
    it('is positive when the deadline is in the future', () => {
      expect(daysToDeadline('2026-07-25T00:00:00.000Z', NOW)).toBe(10);
    });
    it('is negative when the deadline is in the past', () => {
      expect(daysToDeadline('2026-07-10T00:00:00.000Z', NOW)).toBe(-5);
    });
    it('is null when there is no deadline', () => {
      expect(daysToDeadline(null, NOW)).toBeNull();
    });
  });

  describe('computeReturnState', () => {
    it('is DUE when unpaid and before the deadline', () => {
      const s = computeReturnState(
        { amountDue: 100, amountPaid: 0, filingDeadline: '2026-07-25T00:00:00.000Z' },
        NOW,
      );
      expect(s.status).toBe('DUE');
      expect(s.balance).toBe(100);
      expect(s.daysToDeadline).toBe(10);
    });

    it('flips DUE -> OVERDUE once today is past the deadline with a balance', () => {
      const s = computeReturnState(
        { amountDue: 100, amountPaid: 0, filingDeadline: '2026-07-10T00:00:00.000Z' },
        NOW,
      );
      expect(s.status).toBe('OVERDUE');
    });

    it('is PARTIAL when 0 < paid < due (deadline not passed)', () => {
      const s = computeReturnState(
        { amountDue: 100, amountPaid: 40, filingDeadline: '2026-07-25T00:00:00.000Z' },
        NOW,
      );
      expect(s.status).toBe('PARTIAL');
      expect(s.balance).toBe(60);
    });

    it('stays OVERDUE when partially paid but past deadline with a balance', () => {
      const s = computeReturnState(
        { amountDue: 100, amountPaid: 40, filingDeadline: '2026-07-10T00:00:00.000Z' },
        NOW,
      );
      expect(s.status).toBe('OVERDUE');
    });

    it('is PAID when balance <= 0 even if overdue', () => {
      const s = computeReturnState(
        { amountDue: 100, amountPaid: 100, filingDeadline: '2026-07-10T00:00:00.000Z' },
        NOW,
      );
      expect(s.status).toBe('PAID');
      expect(s.balance).toBe(0);
    });

    it('is PAID (not overdue) on overpayment', () => {
      const s = computeReturnState(
        { amountDue: 100, amountPaid: 120, filingDeadline: '2026-07-10T00:00:00.000Z' },
        NOW,
      );
      expect(s.status).toBe('PAID');
      expect(s.balance).toBe(-20);
    });
  });

  describe('defaultFilingDeadline', () => {
    it('defaults to the 10th of the following month', () => {
      const d = defaultFilingDeadline('2026-07', 'PAYE');
      expect(d.toISOString()).toBe('2026-08-10T00:00:00.000Z');
    });
    it('uses the 25th of the following month for VAT', () => {
      const d = defaultFilingDeadline('2026-07', 'VAT');
      expect(d.toISOString()).toBe('2026-08-25T00:00:00.000Z');
    });
    it('rolls the year over for December', () => {
      const d = defaultFilingDeadline('2026-12', 'PAYE');
      expect(d.toISOString()).toBe('2027-01-10T00:00:00.000Z');
    });
  });
});
