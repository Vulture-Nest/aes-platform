import {
  DebtRow,
  PayeConsolidationInput,
  PayeLineResult,
  TaxLedgerConsolidationService,
  VatConsolidationInput,
  VatLineResult,
} from './tax-ledger-consolidation.service';

describe('TaxLedgerConsolidationService', () => {
  const svc = new TaxLedgerConsolidationService();

  describe('consolidateVat (golden values)', () => {
    interface VatCase {
      name: string;
      input: VatConsolidationInput;
      expected: VatLineResult;
    }

    const cases: VatCase[] = [
      {
        name: 'output = serviced orders + contract claims; input = flagged + expenses + overheads',
        input: {
          servicedOrders: [{ taxableAmount: 1000, vatRatePct: 15 }],
          contractClaims: [{ taxableAmount: 2000, vatRatePct: 15 }],
          flaggedOrders: [{ taxableAmount: 400, vatRatePct: 15, claimable: true }],
          generalExpenses: [{ taxableAmount: 100, vatRatePct: 15, claimable: true }],
          overheads: [{ taxableAmount: 500, vatRatePct: 15, claimable: true }],
          broughtForwardVatPrincipal: 0,
          vatPaid: 0,
        },
        // output = (1000+2000)*0.15 = 450; input = (400+100+500)*0.15 = 150; net = 300
        expected: { outputVat: 450, inputVat: 150, netVat: 300, recoverable: false },
      },
      {
        name: 'non-claimable input lines are excluded from inputVat',
        input: {
          servicedOrders: [{ taxableAmount: 1000, vatRatePct: 15 }],
          contractClaims: [],
          flaggedOrders: [
            { taxableAmount: 400, vatRatePct: 15, claimable: true },
            { taxableAmount: 1000, vatRatePct: 15, claimable: false },
          ],
          generalExpenses: [{ taxableAmount: 200, vatRatePct: 15, claimable: false }],
          overheads: [],
          broughtForwardVatPrincipal: 0,
          vatPaid: 0,
        },
        // output = 150; input = 400*0.15 = 60 (only the claimable line); net = 90
        expected: { outputVat: 150, inputVat: 60, netVat: 90, recoverable: false },
      },
      {
        name: 'brought-forward principal increases the net owed',
        input: {
          servicedOrders: [{ taxableAmount: 1000, vatRatePct: 15 }],
          contractClaims: [],
          flaggedOrders: [],
          generalExpenses: [],
          overheads: [],
          broughtForwardVatPrincipal: 200,
          vatPaid: 0,
        },
        // output = 150; input = 0; net = 150 + 200 = 350
        expected: { outputVat: 150, inputVat: 0, netVat: 350, recoverable: false },
      },
      {
        name: 'vatPaid reduces the net owed',
        input: {
          servicedOrders: [{ taxableAmount: 1000, vatRatePct: 15 }],
          contractClaims: [],
          flaggedOrders: [],
          generalExpenses: [],
          overheads: [],
          broughtForwardVatPrincipal: 0,
          vatPaid: 100,
        },
        // output = 150; net = 150 - 100 = 50
        expected: { outputVat: 150, inputVat: 0, netVat: 50, recoverable: false },
      },
      {
        name: 'input exceeding output yields a negative (recoverable) net VAT',
        input: {
          servicedOrders: [{ taxableAmount: 1000, vatRatePct: 15 }],
          contractClaims: [],
          flaggedOrders: [{ taxableAmount: 2000, vatRatePct: 15, claimable: true }],
          generalExpenses: [],
          overheads: [],
          broughtForwardVatPrincipal: 0,
          vatPaid: 0,
        },
        // output = 150; input = 300; net = -150 -> recoverable
        expected: { outputVat: 150, inputVat: 300, netVat: -150, recoverable: true },
      },
      {
        name: 'boundary: net of -0.01 is recoverable (just below zero)',
        input: {
          servicedOrders: [{ taxableAmount: 100, vatRatePct: 15 }],
          contractClaims: [],
          flaggedOrders: [],
          generalExpenses: [],
          overheads: [],
          broughtForwardVatPrincipal: 0,
          // output = 15.00; pay 15.01 -> net = -0.01
          vatPaid: 15.01,
        },
        expected: { outputVat: 15, inputVat: 0, netVat: -0.01, recoverable: true },
      },
      {
        name: 'boundary: net of exactly 0.00 is NOT recoverable',
        input: {
          servicedOrders: [{ taxableAmount: 100, vatRatePct: 15 }],
          contractClaims: [],
          flaggedOrders: [],
          generalExpenses: [],
          overheads: [],
          broughtForwardVatPrincipal: 0,
          vatPaid: 15,
        },
        expected: { outputVat: 15, inputVat: 0, netVat: 0, recoverable: false },
      },
      {
        name: 'rounding: fractional-cent lines round to 2 decimals',
        input: {
          // 33.33 * 0.15 = 4.9995 -> 5.00
          servicedOrders: [{ taxableAmount: 33.33, vatRatePct: 15 }],
          contractClaims: [],
          flaggedOrders: [],
          generalExpenses: [],
          overheads: [],
          broughtForwardVatPrincipal: 0,
          vatPaid: 0,
        },
        expected: { outputVat: 5, inputVat: 0, netVat: 5, recoverable: false },
      },
      {
        name: 'empty ledger yields all zeros and is not recoverable',
        input: {
          servicedOrders: [],
          contractClaims: [],
          flaggedOrders: [],
          generalExpenses: [],
          overheads: [],
          broughtForwardVatPrincipal: 0,
          vatPaid: 0,
        },
        expected: { outputVat: 0, inputVat: 0, netVat: 0, recoverable: false },
      },
    ];

    it.each(cases)('$name', ({ input, expected }) => {
      expect(svc.consolidateVat(input)).toEqual(expected);
    });
  });

  describe('consolidatePaye (golden values)', () => {
    interface PayeCase {
      name: string;
      input: PayeConsolidationInput;
      expected: PayeLineResult;
    }

    const cases: PayeCase[] = [
      {
        name: 'net = due + broughtForward - paid',
        input: { due: 1000, broughtForward: 250, paid: 400 },
        expected: { due: 1000, broughtForward: 250, paid: 400, netPaye: 850 },
      },
      {
        name: 'over-payment produces a negative (credit) net PAYE',
        input: { due: 500, broughtForward: 0, paid: 700 },
        expected: { due: 500, broughtForward: 0, paid: 700, netPaye: -200 },
      },
      {
        name: 'boundary: exact settlement nets to zero',
        input: { due: 500, broughtForward: 100, paid: 600 },
        expected: { due: 500, broughtForward: 100, paid: 600, netPaye: 0 },
      },
      {
        name: 'rounding to 2 decimals',
        input: { due: 100.005, broughtForward: 0, paid: 0 },
        expected: { due: 100.01, broughtForward: 0, paid: 0, netPaye: 100.01 },
      },
    ];

    it.each(cases)('$name', ({ input, expected }) => {
      expect(svc.consolidatePaye(input)).toEqual(expected);
    });
  });

  describe('interestForDebt (golden values)', () => {
    interface DebtCase {
      name: string;
      row: DebtRow;
      expectedInterest: number;
    }

    const cases: DebtCase[] = [
      {
        name: 'full-year interest: 10000 * 10% * 365/365 = 1000',
        row: { id: 'd1', principal: 10000, zimraRatePct: 10, daysOverdue: 365 },
        expectedInterest: 1000,
      },
      {
        name: 'partial-period interest: 10000 * 10% * 30/365 = 82.19',
        row: { id: 'd2', principal: 10000, zimraRatePct: 10, daysOverdue: 30 },
        expectedInterest: 82.19,
      },
      {
        name: 'boundary: zero days overdue accrues no interest',
        row: { id: 'd3', principal: 10000, zimraRatePct: 10, daysOverdue: 0 },
        expectedInterest: 0,
      },
      {
        name: 'boundary: negative days overdue accrues no interest',
        row: { id: 'd4', principal: 10000, zimraRatePct: 10, daysOverdue: -5 },
        expectedInterest: 0,
      },
      {
        name: 'boundary: one day overdue at 10% on 10000 = 2.74',
        row: { id: 'd5', principal: 10000, zimraRatePct: 10, daysOverdue: 1 },
        expectedInterest: 2.74,
      },
    ];

    it.each(cases)('$name', ({ row, expectedInterest }) => {
      const result = svc.interestForDebt(row);
      expect(result).toEqual({
        id: row.id,
        principal: row.principal,
        interest: expectedInterest,
      });
    });
  });

  describe('consolidateDebtInterest', () => {
    it('sums per-row interest into a total', () => {
      const rows: DebtRow[] = [
        { id: 'a', principal: 10000, zimraRatePct: 10, daysOverdue: 365 },
        { id: 'b', principal: 10000, zimraRatePct: 10, daysOverdue: 30 },
        { id: 'c', principal: 10000, zimraRatePct: 10, daysOverdue: 0 },
      ];
      const result = svc.consolidateDebtInterest(rows);
      expect(result.debtInterest).toEqual([
        { id: 'a', principal: 10000, interest: 1000 },
        { id: 'b', principal: 10000, interest: 82.19 },
        { id: 'c', principal: 10000, interest: 0 },
      ]);
      expect(result.totalInterest).toBe(1082.19);
    });

    it('returns empty result for no debts', () => {
      expect(svc.consolidateDebtInterest([])).toEqual({
        debtInterest: [],
        totalInterest: 0,
      });
    });
  });

  describe('consolidate (VAT and PAYE kept as SEPARATE line results)', () => {
    it('assembles vat, paye and debt interest independently', () => {
      const result = svc.consolidate({
        vat: {
          servicedOrders: [{ taxableAmount: 1000, vatRatePct: 15 }],
          contractClaims: [{ taxableAmount: 2000, vatRatePct: 15 }],
          flaggedOrders: [{ taxableAmount: 400, vatRatePct: 15, claimable: true }],
          generalExpenses: [{ taxableAmount: 100, vatRatePct: 15, claimable: true }],
          overheads: [{ taxableAmount: 500, vatRatePct: 15, claimable: true }],
          broughtForwardVatPrincipal: 100,
          vatPaid: 50,
        },
        paye: { due: 1000, broughtForward: 250, paid: 400 },
        debts: [{ id: 'a', principal: 10000, zimraRatePct: 10, daysOverdue: 365 }],
      });

      // VAT: output 450, input 150, net = 450 - 150 + 100 - 50 = 350
      expect(result.vat).toEqual({
        outputVat: 450,
        inputVat: 150,
        netVat: 350,
        recoverable: false,
      });
      // PAYE untouched by VAT line
      expect(result.paye).toEqual({
        due: 1000,
        broughtForward: 250,
        paid: 400,
        netPaye: 850,
      });
      expect(result.debtInterest).toEqual([{ id: 'a', principal: 10000, interest: 1000 }]);
      expect(result.totalInterest).toBe(1000);
    });
  });
});
