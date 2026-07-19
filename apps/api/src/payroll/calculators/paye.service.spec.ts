import { PayeBand, PayeService } from './paye.service';

/**
 * Golden-value regression net for the pure PAYE domain math.
 *
 * IMPORTANT: every band table below is a SYNTHETIC EXAMPLE, invented purely to
 * exercise the arithmetic. These are NOT real ZIMRA / statutory numbers. In
 * production the band tables are read from StatutoryRatesService (key
 * 'paye_bands', per currency) and passed in as inputs; the calculator itself
 * hardcodes nothing jurisdiction-specific.
 */
describe('PayeService', () => {
  const svc = new PayeService();

  /**
   * EXAMPLE marginal band table (synthetic — not real statutory rates).
   * Progressive slices:
   *   0     .. 100  -> 0%
   *   100   .. 300  -> 20%
   *   300   .. 1000 -> 30%
   *   1000+        -> 40%
   */
  const EXAMPLE_MARGINAL_BANDS: PayeBand[] = [
    { upTo: 100, ratePct: 0 },
    { upTo: 300, ratePct: 20 },
    { upTo: 1000, ratePct: 30 },
    { upTo: null, ratePct: 40 },
  ];

  /**
   * The SAME EXAMPLE table expressed in ready-reckoner ("multiply, then deduct")
   * form. For each band, tax = income * ratePct/100 - deduct is algebraically
   * equal to the marginal accumulation above, so both tables must agree.
   *   0    .. 100  -> 0%   deduct 0
   *   100  .. 300  -> 20%  deduct 20    (0.20*100)
   *   300  .. 1000 -> 30%  deduct 50    (20 + 0.30*300 - accumulated)
   *   1000+       -> 40%   deduct 150
   */
  const EXAMPLE_QUICK_BANDS: PayeBand[] = [
    { upTo: 100, ratePct: 0, deduct: 0 },
    { upTo: 300, ratePct: 20, deduct: 20 },
    { upTo: 1000, ratePct: 30, deduct: 50 },
    { upTo: null, ratePct: 40, deduct: 150 },
  ];

  describe('compute() marginal band table (EXAMPLE synthetic rates)', () => {
    interface Case {
      name: string;
      taxableIncome: number;
      expected: number;
    }

    const cases: Case[] = [
      { name: 'zero income -> no tax', taxableIncome: 0, expected: 0 },
      { name: 'negative income -> no tax (clamped)', taxableIncome: -500, expected: 0 },
      {
        name: 'inside first (0%) band -> no tax',
        taxableIncome: 50,
        expected: 0,
      },
      {
        name: 'boundary: exactly top of 0% band -> still no tax',
        taxableIncome: 100,
        expected: 0,
      },
      {
        name: 'second band: 250 -> 0*100 + 0.20*150',
        taxableIncome: 250,
        expected: 30, // 0 + (250-100)*0.20
      },
      {
        name: 'boundary: exactly top of second band (300)',
        taxableIncome: 300,
        expected: 40, // (300-100)*0.20
      },
      {
        name: 'just over second boundary (300.01) taxes one cent at 30%',
        taxableIncome: 300.01,
        expected: 40, // 40 + 0.01*0.30 = 40.003 -> 40.00
      },
      {
        name: 'third band: 700 -> 0.20*200 + 0.30*400',
        taxableIncome: 700,
        expected: 160, // 40 + (700-300)*0.30
      },
      {
        name: 'boundary: exactly top of third band (1000)',
        taxableIncome: 1000,
        expected: 250, // 40 + (1000-300)*0.30
      },
      {
        name: 'top open-ended band: 1500 -> ... + 0.40*500',
        taxableIncome: 1500,
        expected: 450, // 250 + (1500-1000)*0.40
      },
      {
        name: 'fractional income rounds tax to 2dp',
        taxableIncome: 355.555,
        expected: 56.67, // 40 + (355.555-300)*0.30 = 56.6665 -> 56.67
      },
    ];

    it.each(cases)('$name', ({ taxableIncome, expected }) => {
      expect(svc.compute({ taxableIncome, bands: EXAMPLE_MARGINAL_BANDS })).toBe(expected);
    });
  });

  describe('compute() ready-reckoner (deduct) table (EXAMPLE synthetic rates)', () => {
    interface Case {
      name: string;
      taxableIncome: number;
      expected: number;
    }

    const cases: Case[] = [
      { name: 'zero income -> no tax', taxableIncome: 0, expected: 0 },
      { name: 'first band 0% -> no tax', taxableIncome: 80, expected: 0 },
      {
        name: 'top of 0% band (100) -> no tax',
        taxableIncome: 100,
        expected: 0,
      },
      {
        name: 'second band: 250 -> 0.20*250 - 20',
        taxableIncome: 250,
        expected: 30,
      },
      {
        name: 'boundary top of second band (300): 0.20*300 - 20',
        taxableIncome: 300,
        expected: 40,
      },
      {
        name: 'third band: 700 -> 0.30*700 - 50',
        taxableIncome: 700,
        expected: 160,
      },
      {
        name: 'boundary top of third band (1000): 0.30*1000 - 50',
        taxableIncome: 1000,
        expected: 250,
      },
      {
        name: 'top band: 1500 -> 0.40*1500 - 150',
        taxableIncome: 1500,
        expected: 450,
      },
    ];

    it.each(cases)('$name', ({ taxableIncome, expected }) => {
      expect(svc.compute({ taxableIncome, bands: EXAMPLE_QUICK_BANDS })).toBe(expected);
    });
  });

  describe('marginal and ready-reckoner tables agree (EXAMPLE synthetic rates)', () => {
    const incomes = [0, 50, 100, 150, 300, 300.5, 700, 1000, 1000.01, 2500];

    it.each(incomes)('income %p yields identical tax under both forms', (income) => {
      const marginal = svc.compute({ taxableIncome: income, bands: EXAMPLE_MARGINAL_BANDS });
      const quick = svc.compute({ taxableIncome: income, bands: EXAMPLE_QUICK_BANDS });
      expect(quick).toBe(marginal);
    });
  });

  describe('compute() edge cases', () => {
    it('empty band table -> zero tax', () => {
      expect(svc.compute({ taxableIncome: 5000, bands: [] })).toBe(0);
    });

    it('single open-ended flat band taxes whole income', () => {
      const flat: PayeBand[] = [{ upTo: null, ratePct: 25 }];
      expect(svc.compute({ taxableIncome: 400, bands: flat })).toBe(100);
    });

    it('non-finite income -> zero tax', () => {
      expect(svc.compute({ taxableIncome: Number.NaN, bands: EXAMPLE_MARGINAL_BANDS })).toBe(0);
    });

    it('deduct larger than gross is clamped at zero (never negative tax)', () => {
      const oddBands: PayeBand[] = [{ upTo: null, ratePct: 10, deduct: 1000 }];
      expect(svc.compute({ taxableIncome: 100, bands: oddBands })).toBe(0);
    });
  });

  describe('aidsLevy() (EXAMPLE synthetic rate; default 3%)', () => {
    interface Case {
      name: string;
      paye: number;
      aidsLevyPct?: number;
      expected: number;
    }

    const cases: Case[] = [
      {
        name: 'default 3% applied when pct omitted',
        paye: 250,
        expected: 7.5, // 250 * 0.03
      },
      {
        name: 'explicit rate overrides default',
        paye: 250,
        aidsLevyPct: 5,
        expected: 12.5,
      },
      {
        name: 'rounds to 2dp',
        paye: 33.33,
        expected: 1, // 33.33 * 0.03 = 0.9999 -> 1.00
      },
      { name: 'zero PAYE -> zero levy', paye: 0, expected: 0 },
      { name: 'negative PAYE -> zero levy (clamped)', paye: -100, expected: 0 },
      {
        name: 'zero rate -> zero levy',
        paye: 250,
        aidsLevyPct: 0,
        expected: 0,
      },
    ];

    it.each(cases)('$name', ({ paye, aidsLevyPct, expected }) => {
      expect(svc.aidsLevy({ paye, aidsLevyPct })).toBe(expected);
    });
  });
});
