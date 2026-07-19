import {
  OrderFinancialsInput,
  OrderFinancialsResult,
  OrderFinancialsService,
  RateStrategy,
} from './order-financials.service';

describe('OrderFinancialsService', () => {
  const service = new OrderFinancialsService();

  interface Case {
    name: string;
    input: OrderFinancialsInput;
    expected: OrderFinancialsResult;
  }

  const cases: Case[] = [
    {
      name: 'baseline order with USD + ZWG receipts, expenses and loan interest',
      input: {
        order: { valueExVat: 1000, vatRatePct: 15 },
        receipts: [{ amountUsd: 500, amountZig: 1000 }],
        expenses: [{ amountExVat: 200 }, { amountExVat: 100 }],
        rates: { officialRate: 10, streetRate: 20 },
        loanInterestTotal: 100,
      },
      expected: {
        vat: 150,
        totalInclVat: 1150,
        spentToDate: 300,
        receivedOfficial: 600, // 500 + 1000/10
        receivedStreet: 550, // 500 + 1000/20
        outstanding: 550, // 1150 - 600
        profitExVat: 700, // 1000 - 300
        netProfit: 600, // 700 - 100
        margin: 0.6, // 600 / 1000
      },
    },
    {
      name: 'no receipts, no expenses, no loan interest => everything outstanding',
      input: {
        order: { valueExVat: 500, vatRatePct: 15 },
        receipts: [],
        expenses: [],
        rates: { officialRate: 10, streetRate: 20 },
        loanInterestTotal: 0,
      },
      expected: {
        vat: 75,
        totalInclVat: 575,
        spentToDate: 0,
        receivedOfficial: 0,
        receivedStreet: 0,
        outstanding: 575,
        profitExVat: 500,
        netProfit: 500,
        margin: 1, // 500 / 500
      },
    },
    {
      name: 'zero order value yields null margin (division guard)',
      input: {
        order: { valueExVat: 0, vatRatePct: 15 },
        receipts: [],
        expenses: [],
        rates: { officialRate: 10, streetRate: 20 },
        loanInterestTotal: 0,
      },
      expected: {
        vat: 0,
        totalInclVat: 0,
        spentToDate: 0,
        receivedOfficial: 0,
        receivedStreet: 0,
        outstanding: 0,
        profitExVat: 0,
        netProfit: 0,
        margin: null,
      },
    },
    {
      name: 'multiple receipts aggregate across both currencies',
      input: {
        order: { valueExVat: 2000, vatRatePct: 15 },
        receipts: [
          { amountUsd: 300, amountZig: 500 },
          { amountUsd: 200, amountZig: 1500 },
        ],
        expenses: [{ amountExVat: 800 }],
        rates: { officialRate: 25, streetRate: 40 },
        loanInterestTotal: 50,
      },
      expected: {
        vat: 300,
        totalInclVat: 2300,
        spentToDate: 800,
        receivedOfficial: 580, // 500 + 2000/25
        receivedStreet: 550, // 500 + 2000/40
        outstanding: 1720, // 2300 - 580
        profitExVat: 1200, // 2000 - 800
        netProfit: 1150, // 1200 - 50
        margin: 0.58, // 1150 / 2000 -> 0.575 rounds to 0.58
      },
    },
    {
      name: 'overpayment produces a negative (in-our-favour) outstanding',
      input: {
        order: { valueExVat: 100, vatRatePct: 15 },
        receipts: [{ amountUsd: 200, amountZig: 0 }],
        expenses: [],
        rates: { officialRate: 10, streetRate: 20 },
        loanInterestTotal: 0,
      },
      expected: {
        vat: 15,
        totalInclVat: 115,
        spentToDate: 0,
        receivedOfficial: 200,
        receivedStreet: 200,
        outstanding: -85, // 115 - 200
        profitExVat: 100,
        netProfit: 100,
        margin: 1,
      },
    },
    {
      name: 'loan interest exceeding profit yields a negative net profit and margin',
      input: {
        order: { valueExVat: 1000, vatRatePct: 15 },
        receipts: [{ amountUsd: 1150, amountZig: 0 }],
        expenses: [{ amountExVat: 900 }],
        rates: { officialRate: 10, streetRate: 20 },
        loanInterestTotal: 200,
      },
      expected: {
        vat: 150,
        totalInclVat: 1150,
        spentToDate: 900,
        receivedOfficial: 1150,
        receivedStreet: 1150,
        outstanding: 0,
        profitExVat: 100, // 1000 - 900
        netProfit: -100, // 100 - 200
        margin: -0.1, // -100 / 1000
      },
    },
    {
      name: 'boundary: 0.01 rounding tolerance on VAT and outstanding',
      input: {
        order: { valueExVat: 100.05, vatRatePct: 15 },
        receipts: [{ amountUsd: 100, amountZig: 33 }],
        expenses: [{ amountExVat: 33.335 }],
        rates: { officialRate: 3, streetRate: 6 },
        loanInterestTotal: 0,
      },
      expected: {
        // 100.05 * 15 / 100 = 15.0075 -> 15.01
        vat: 15.01,
        // 100.05 + 15.01 = 115.06
        totalInclVat: 115.06,
        // 33.335 -> 33.34 (half-up)
        spentToDate: 33.34,
        // 100 + 33/3 = 111
        receivedOfficial: 111,
        // 100 + 33/6 = 105.5
        receivedStreet: 105.5,
        // 115.06 - 111 = 4.06
        outstanding: 4.06,
        // 100.05 - 33.34 = 66.71
        profitExVat: 66.71,
        netProfit: 66.71,
        // 66.71 / 100.05 = 0.66676... -> 0.67
        margin: 0.67,
      },
    },
    {
      name: 'zero official rate: ZWG leg contributes nothing (no Infinity)',
      input: {
        order: { valueExVat: 100, vatRatePct: 0 },
        receipts: [{ amountUsd: 50, amountZig: 500 }],
        expenses: [],
        rates: { officialRate: 0, streetRate: 10 },
        loanInterestTotal: 0,
      },
      expected: {
        vat: 0,
        totalInclVat: 100,
        spentToDate: 0,
        receivedOfficial: 50, // ZWG leg dropped (rate 0)
        receivedStreet: 100, // 50 + 500/10
        outstanding: 50, // 100 - 50
        profitExVat: 100,
        netProfit: 100,
        margin: 1,
      },
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(service.compute(input)).toEqual(expected);
  });

  it('defaults to the CLASSIC strategy when none is supplied', () => {
    const input: OrderFinancialsInput = {
      order: { valueExVat: 100, vatRatePct: 15 },
      receipts: [],
      expenses: [],
      rates: { officialRate: 10, streetRate: 20 },
      loanInterestTotal: 0,
    };
    expect(() => service.compute(input)).not.toThrow();
    expect(service.compute({ ...input, strategy: RateStrategy.CLASSIC })).toEqual(
      service.compute(input),
    );
  });

  it('throws for the unimplemented IMPROVE strategy', () => {
    const input: OrderFinancialsInput = {
      order: { valueExVat: 100, vatRatePct: 15 },
      receipts: [],
      expenses: [],
      rates: { officialRate: 10, streetRate: 20 },
      loanInterestTotal: 0,
      strategy: RateStrategy.IMPROVE,
    };
    expect(() => service.compute(input)).toThrow(/not implemented/);
  });
});
