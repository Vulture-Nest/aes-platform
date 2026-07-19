import {
  ClaimIncomeLine,
  ExpenseBreakdown,
  OrderIncomeLine,
  PendingObligationLine,
  PerformanceResult,
  PerformanceService,
} from './performance.service';

describe('PerformanceService', () => {
  const service = new PerformanceService();

  const expenses = (over: Partial<ExpenseBreakdown> = {}): ExpenseBreakdown => ({
    order: 0,
    general: 0,
    overheads: 0,
    loanInterest: 0,
    ...over,
  });

  describe('compute — golden values', () => {
    interface Case {
      name: string;
      orders: OrderIncomeLine[];
      claims: ClaimIncomeLine[];
      expenses: ExpenseBreakdown;
      expected: PerformanceResult;
    }

    const cases: Case[] = [
      {
        name: 'serviced orders + claims, positive margin',
        orders: [
          { valueExVat: 1000, serviced: true },
          { valueExVat: 500, serviced: true },
        ],
        claims: [{ amountExVat: 200 }],
        expenses: expenses({ order: 300, general: 100, overheads: 50, loanInterest: 50 }),
        expected: {
          servicedOrderIncome: 1500,
          claimsIncome: 200,
          income: 1700,
          expenses: 500,
          operatingProfit: 1200,
          margin: 0.7059,
        },
      },
      {
        name: 'unserviced orders are excluded from income',
        orders: [
          { valueExVat: 1000, serviced: true },
          { valueExVat: 900, serviced: false },
        ],
        claims: [],
        expenses: expenses({ order: 400 }),
        expected: {
          servicedOrderIncome: 1000,
          claimsIncome: 0,
          income: 1000,
          expenses: 400,
          operatingProfit: 600,
          margin: 0.6,
        },
      },
      {
        name: 'claims count even when no order is serviced',
        orders: [{ valueExVat: 5000, serviced: false }],
        claims: [{ amountExVat: 250 }, { amountExVat: 250 }],
        expenses: expenses({ general: 100 }),
        expected: {
          servicedOrderIncome: 0,
          claimsIncome: 500,
          income: 500,
          expenses: 100,
          operatingProfit: 400,
          margin: 0.8,
        },
      },
      {
        name: 'expenses exceed income → negative operating profit',
        orders: [{ valueExVat: 100, serviced: true }],
        claims: [],
        expenses: expenses({ order: 50, general: 40, overheads: 30, loanInterest: 20 }),
        expected: {
          servicedOrderIncome: 100,
          claimsIncome: 0,
          income: 100,
          expenses: 140,
          operatingProfit: -40,
          margin: -0.4,
        },
      },
      {
        name: 'zero income → margin is null (division undefined)',
        orders: [{ valueExVat: 800, serviced: false }],
        claims: [],
        expenses: expenses({ order: 100 }),
        expected: {
          servicedOrderIncome: 0,
          claimsIncome: 0,
          income: 0,
          expenses: 100,
          operatingProfit: -100,
          margin: null,
        },
      },
      {
        name: 'empty everything → all zero, margin null',
        orders: [],
        claims: [],
        expenses: expenses(),
        expected: {
          servicedOrderIncome: 0,
          claimsIncome: 0,
          income: 0,
          expenses: 0,
          operatingProfit: 0,
          margin: null,
        },
      },
      {
        name: 'income exactly equals expenses → zero profit, zero margin',
        orders: [{ valueExVat: 750, serviced: true }],
        claims: [{ amountExVat: 250 }],
        expenses: expenses({ order: 600, general: 400 }),
        expected: {
          servicedOrderIncome: 750,
          claimsIncome: 250,
          income: 1000,
          expenses: 1000,
          operatingProfit: 0,
          margin: 0,
        },
      },
      {
        name: 'cent rounding — fractional inputs rounded to 2dp',
        orders: [
          { valueExVat: 100.005, serviced: true },
          { valueExVat: 0.004, serviced: true },
        ],
        claims: [{ amountExVat: 0.011 }],
        expenses: expenses({ order: 0.005 }),
        expected: {
          servicedOrderIncome: 100.01,
          claimsIncome: 0.01,
          income: 100.02,
          expenses: 0.01,
          operatingProfit: 100.01,
          margin: 0.9999,
        },
      },
    ];

    cases.forEach((c) => {
      it(c.name, () => {
        const result = service.compute({
          orders: c.orders,
          claims: c.claims,
          expenses: c.expenses,
        });
        expect(result).toEqual(c.expected);
      });
    });
  });

  describe('income helpers', () => {
    it('servicedOrderIncome sums only serviced orders', () => {
      const orders: OrderIncomeLine[] = [
        { valueExVat: 100, serviced: true },
        { valueExVat: 200, serviced: false },
        { valueExVat: 300, serviced: true },
      ];
      expect(service.servicedOrderIncome(orders)).toBe(400);
    });

    it('claimsIncome sums every claim', () => {
      const claims: ClaimIncomeLine[] = [{ amountExVat: 10 }, { amountExVat: 15 }];
      expect(service.claimsIncome(claims)).toBe(25);
    });

    it('income adds serviced order income and claims income', () => {
      expect(service.income([{ valueExVat: 400, serviced: true }], [{ amountExVat: 100 }])).toBe(
        500,
      );
    });
  });

  describe('expenses / operatingProfit / margin', () => {
    it('expenses sums the four buckets', () => {
      expect(service.expenses({ order: 1, general: 2, overheads: 3, loanInterest: 4 })).toBe(10);
    });

    it('operatingProfit is income minus expenses', () => {
      expect(service.operatingProfit(1000, 250)).toBe(750);
    });

    it('margin is null when income is zero', () => {
      expect(service.margin(0, -100)).toBeNull();
    });

    it('margin is operatingProfit over income, rounded to 4dp', () => {
      // 1 / 3 = 0.3333...
      expect(service.margin(3, 1)).toBe(0.3333);
    });
  });

  describe('pendingObligations', () => {
    interface Case {
      name: string;
      obligations: PendingObligationLine[];
      expected: number;
    }

    const cases: Case[] = [
      { name: 'empty → 0', obligations: [], expected: 0 },
      {
        name: 'sums approved-pending-funds amounts',
        obligations: [{ amount: 100 }, { amount: 250.5 }, { amount: 49.5 }],
        expected: 400,
      },
      {
        name: 'rounds the total to 2dp',
        obligations: [{ amount: 0.005 }, { amount: 0.005 }],
        expected: 0.01,
      },
    ];

    cases.forEach((c) => {
      it(c.name, () => {
        expect(service.pendingObligations(c.obligations)).toBe(c.expected);
      });
    });
  });
});
