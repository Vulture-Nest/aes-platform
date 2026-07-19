import {
  DEFAULT_RECONCILIATION_TOLERANCE,
  ZimraReconciliationService,
  ZimraTaxHead,
} from './zimra-reconciliation.service';

describe('ZimraReconciliationService', () => {
  const service = new ZimraReconciliationService();

  describe('discrepancy (books - assessed, per head)', () => {
    const cases: Array<{
      name: string;
      head: ZimraTaxHead;
      booksAmount: number;
      assessedAmount: number;
      tolerance?: number;
      expectedDiscrepancy: number;
      expectedReconciled: boolean;
    }> = [
      {
        name: 'VAT books exceed assessment (positive discrepancy)',
        head: ZimraTaxHead.VAT,
        booksAmount: 1500,
        assessedAmount: 1200,
        expectedDiscrepancy: 300,
        expectedReconciled: false,
      },
      {
        name: 'PAYE assessment exceeds books (negative discrepancy)',
        head: ZimraTaxHead.PAYE,
        booksAmount: 800,
        assessedAmount: 950,
        expectedDiscrepancy: -150,
        expectedReconciled: false,
      },
      {
        name: 'exact match reconciles',
        head: ZimraTaxHead.VAT,
        booksAmount: 1000,
        assessedAmount: 1000,
        expectedDiscrepancy: 0,
        expectedReconciled: true,
      },
      {
        name: 'boundary: +0.01 within default tolerance reconciles',
        head: ZimraTaxHead.PAYE,
        booksAmount: 1000.01,
        assessedAmount: 1000,
        expectedDiscrepancy: 0.01,
        expectedReconciled: true,
      },
      {
        name: 'boundary: -0.01 within default tolerance reconciles',
        head: ZimraTaxHead.VAT,
        booksAmount: 999.99,
        assessedAmount: 1000,
        expectedDiscrepancy: -0.01,
        expectedReconciled: true,
      },
      {
        name: 'boundary: 0.02 just outside default tolerance does not reconcile',
        head: ZimraTaxHead.PAYE,
        booksAmount: 1000.02,
        assessedAmount: 1000,
        expectedDiscrepancy: 0.02,
        expectedReconciled: false,
      },
      {
        name: 'custom tolerance widens the reconciliation window',
        head: ZimraTaxHead.VAT,
        booksAmount: 1005,
        assessedAmount: 1000,
        tolerance: 5,
        expectedDiscrepancy: 5,
        expectedReconciled: true,
      },
    ];

    it.each(cases)(
      '$name',
      ({
        head,
        booksAmount,
        assessedAmount,
        tolerance,
        expectedDiscrepancy,
        expectedReconciled,
      }) => {
        const result = service.discrepancy({ head, booksAmount, assessedAmount }, tolerance);
        expect(result.head).toBe(head);
        expect(result.booksAmount).toBe(booksAmount);
        expect(result.assessedAmount).toBe(assessedAmount);
        expect(result.discrepancy).toBe(expectedDiscrepancy);
        expect(result.reconciled).toBe(expectedReconciled);
      },
    );

    it('uses the exported default tolerance', () => {
      expect(DEFAULT_RECONCILIATION_TOLERANCE).toBe(0.01);
    });

    it('computes VAT and PAYE discrepancies independently', () => {
      const results = service.discrepancies([
        { head: ZimraTaxHead.VAT, booksAmount: 1500, assessedAmount: 1200 },
        { head: ZimraTaxHead.PAYE, booksAmount: 800, assessedAmount: 950 },
      ]);
      expect(results).toHaveLength(2);
      expect(results[0]).toMatchObject({ head: ZimraTaxHead.VAT, discrepancy: 300 });
      expect(results[1]).toMatchObject({ head: ZimraTaxHead.PAYE, discrepancy: -150 });
    });
  });

  describe('daysOverdue (max(0, today - dueDate))', () => {
    const cases: Array<{
      name: string;
      dueDate: string;
      today: string;
      expected: number;
    }> = [
      {
        name: 'overdue by 30 days',
        dueDate: '2026-01-01T00:00:00.000Z',
        today: '2026-01-31T00:00:00.000Z',
        expected: 30,
      },
      {
        name: 'boundary: exactly on the due date is zero',
        dueDate: '2026-01-01T00:00:00.000Z',
        today: '2026-01-01T00:00:00.000Z',
        expected: 0,
      },
      {
        name: 'boundary: one day before the due date floors at zero',
        dueDate: '2026-01-02T00:00:00.000Z',
        today: '2026-01-01T00:00:00.000Z',
        expected: 0,
      },
      {
        name: 'boundary: one full day overdue',
        dueDate: '2026-01-01T00:00:00.000Z',
        today: '2026-01-02T00:00:00.000Z',
        expected: 1,
      },
      {
        name: 'partial day does not round up',
        dueDate: '2026-01-01T00:00:00.000Z',
        today: '2026-01-01T23:59:59.000Z',
        expected: 0,
      },
    ];

    it.each(cases)('$name', ({ dueDate, today, expected }) => {
      expect(service.daysOverdue(new Date(dueDate), new Date(today))).toBe(expected);
    });
  });

  describe('overdueInterest (max(0, books) * ratePct/100 * days/365)', () => {
    const cases: Array<{
      name: string;
      booksAmount: number;
      dueDate: string;
      today: string;
      ratePct: number;
      expectedDays: number;
      expectedInterest: number;
    }> = [
      {
        name: '10000 at 25% p.a. for 365 days = full year interest',
        booksAmount: 10000,
        dueDate: '2025-01-01T00:00:00.000Z',
        today: '2026-01-01T00:00:00.000Z',
        ratePct: 25,
        expectedDays: 365,
        // 10000 * 0.25 * 365/365 = 2500
        expectedInterest: 2500,
      },
      {
        name: '10000 at 25% p.a. for 30 days',
        booksAmount: 10000,
        dueDate: '2026-01-01T00:00:00.000Z',
        today: '2026-01-31T00:00:00.000Z',
        ratePct: 25,
        expectedDays: 30,
        // 10000 * 0.25 * 30/365 = 205.4794... -> 205.48
        expectedInterest: 205.48,
      },
      {
        name: 'not yet due accrues no interest',
        booksAmount: 10000,
        dueDate: '2026-02-01T00:00:00.000Z',
        today: '2026-01-01T00:00:00.000Z',
        ratePct: 25,
        expectedDays: 0,
        expectedInterest: 0,
      },
      {
        name: 'recoverable (negative) balance accrues no interest',
        booksAmount: -5000,
        dueDate: '2025-01-01T00:00:00.000Z',
        today: '2026-01-01T00:00:00.000Z',
        ratePct: 25,
        expectedDays: 365,
        expectedInterest: 0,
      },
      {
        name: 'zero rate accrues no interest',
        booksAmount: 10000,
        dueDate: '2025-01-01T00:00:00.000Z',
        today: '2026-01-01T00:00:00.000Z',
        ratePct: 0,
        expectedDays: 365,
        expectedInterest: 0,
      },
    ];

    it.each(cases)(
      '$name',
      ({ booksAmount, dueDate, today, ratePct, expectedDays, expectedInterest }) => {
        const result = service.overdueInterest({
          booksAmount,
          dueDate: new Date(dueDate),
          today: new Date(today),
          ratePct,
        });
        expect(result.daysOverdue).toBe(expectedDays);
        expect(result.interest).toBe(expectedInterest);
      },
    );
  });

  describe('totalLiability (recoverables floored at zero)', () => {
    const cases: Array<{
      name: string;
      netVat: number;
      netPaye: number;
      otherDebtBalance: number;
      otherDebtInterest: number;
      expectedNetVatDue: number;
      expectedNetPayeDue: number;
      expectedTotal: number;
    }> = [
      {
        name: 'all heads payable sum straight through',
        netVat: 1000,
        netPaye: 500,
        otherDebtBalance: 200,
        otherDebtInterest: 50,
        expectedNetVatDue: 1000,
        expectedNetPayeDue: 500,
        expectedTotal: 1750,
      },
      {
        name: 'recoverable VAT is floored at zero (does not offset PAYE)',
        netVat: -800,
        netPaye: 500,
        otherDebtBalance: 0,
        otherDebtInterest: 0,
        expectedNetVatDue: 0,
        expectedNetPayeDue: 500,
        expectedTotal: 500,
      },
      {
        name: 'both VAT and PAYE recoverable floor to zero',
        netVat: -800,
        netPaye: -300,
        otherDebtBalance: 150,
        otherDebtInterest: 25,
        expectedNetVatDue: 0,
        expectedNetPayeDue: 0,
        expectedTotal: 175,
      },
      {
        name: 'boundary: zero net positions',
        netVat: 0,
        netPaye: 0,
        otherDebtBalance: 0,
        otherDebtInterest: 0,
        expectedNetVatDue: 0,
        expectedNetPayeDue: 0,
        expectedTotal: 0,
      },
      {
        name: 'fractional amounts round to 2dp',
        netVat: 100.005,
        netPaye: 50.004,
        otherDebtBalance: 10.001,
        otherDebtInterest: 0.99,
        expectedNetVatDue: 100.01,
        expectedNetPayeDue: 50,
        expectedTotal: 161,
      },
    ];

    it.each(cases)(
      '$name',
      ({
        netVat,
        netPaye,
        otherDebtBalance,
        otherDebtInterest,
        expectedNetVatDue,
        expectedNetPayeDue,
        expectedTotal,
      }) => {
        const result = service.totalLiability({
          netVat,
          netPaye,
          otherDebtBalance,
          otherDebtInterest,
        });
        expect(result.netVatDue).toBe(expectedNetVatDue);
        expect(result.netPayeDue).toBe(expectedNetPayeDue);
        expect(result.totalLiability).toBe(expectedTotal);
      },
    );
  });
});
