import {
  GrossBuildupInput,
  GrossBuildupResult,
  GrossBuildupService,
  SplitMode,
} from './gross-buildup.service';

/**
 * All rates below are EXAMPLE values chosen for arithmetic clarity — they are
 * NOT real ZIMRA / NSSA / labour-council figures. The calculator is pure: the
 * caller feeds it whatever rates config resolves at run time.
 */
describe('GrossBuildupService', () => {
  const service = new GrossBuildupService();

  interface Case {
    name: string;
    input: GrossBuildupInput;
    expected: GrossBuildupResult;
  }

  const cases: Case[] = [
    {
      name: 'full build-up: basic + OT (1.5x & 2.0x) + underground + night + cola + other, 60/40 split',
      input: {
        hoursNormal: 160,
        hoursOt15: 10,
        hoursOt20: 5,
        ugShift: 4,
        nightHours: 8,
        hourlyRate: 10, // EXAMPLE hourly rate
        ugAllowanceRate: 5, // EXAMPLE per-shift allowance
        nightAllowanceRate: 2, // EXAMPLE per-night-hour allowance
        cola: 50, // EXAMPLE flat COLA
        otherAllowances: 30, // EXAMPLE other flat allowances
        split: { mode: SplitMode.FIXED_SPLIT, usdPct: 60 },
      },
      expected: {
        basic: 1600, // 160 * 10
        overtime: 250, // 10*10*1.5 (150) + 5*10*2.0 (100)
        underground: 20, // 4 * 5
        night: 16, // 8 * 2
        allowances: 80, // 50 + 30
        extraEarnings: 0,
        gross: 1966, // 1600 + 250 + 20 + 16 + 80
        split: { usd: 1179.6, zwg: 786.4 }, // 60% / 40%
      },
    },
    {
      name: 'overtime multipliers isolated: only OT hours, all-USD split',
      input: {
        hoursNormal: 0,
        hoursOt15: 4,
        hoursOt20: 3,
        ugShift: 0,
        nightHours: 0,
        hourlyRate: 20, // EXAMPLE hourly rate
        split: { mode: SplitMode.FIXED_SPLIT, usdPct: 100 },
      },
      expected: {
        basic: 0,
        overtime: 240, // 4*20*1.5 (120) + 3*20*2.0 (120)
        underground: 0,
        night: 0,
        allowances: 0,
        extraEarnings: 0,
        gross: 240,
        split: { usd: 240, zwg: 0 },
      },
    },
    {
      name: 'CLIENT_RATIO split at 25% USD leaves 75% in ZWG',
      input: {
        hoursNormal: 100,
        hoursOt15: 0,
        hoursOt20: 0,
        ugShift: 0,
        nightHours: 0,
        hourlyRate: 4, // EXAMPLE hourly rate -> gross 400
        split: { mode: SplitMode.CLIENT_RATIO, usdPct: 25 },
      },
      expected: {
        basic: 400,
        overtime: 0,
        underground: 0,
        night: 0,
        allowances: 0,
        extraEarnings: 0,
        gross: 400,
        split: { usd: 100, zwg: 300 }, // 25% / 75%
      },
    },
    {
      name: 'optional allowance rates default to 0 when omitted',
      input: {
        hoursNormal: 50,
        hoursOt15: 0,
        hoursOt20: 0,
        ugShift: 3, // no ugAllowanceRate supplied -> contributes 0
        nightHours: 6, // no nightAllowanceRate supplied -> contributes 0
        hourlyRate: 8, // EXAMPLE hourly rate
        split: { mode: SplitMode.FIXED_SPLIT, usdPct: 50 },
      },
      expected: {
        basic: 400, // 50 * 8
        overtime: 0,
        underground: 0, // rate defaulted to 0
        night: 0, // rate defaulted to 0
        allowances: 0,
        extraEarnings: 0,
        gross: 400,
        split: { usd: 200, zwg: 200 },
      },
    },
    {
      name: 'fractional hours & rate: rounding to 2dp and remainder-based ZWG leg',
      input: {
        hoursNormal: 7.5,
        hoursOt15: 1.5,
        hoursOt20: 0,
        ugShift: 0,
        nightHours: 0,
        hourlyRate: 3.33, // EXAMPLE hourly rate
        cola: 0.01,
        split: { mode: SplitMode.FIXED_SPLIT, usdPct: 33 },
      },
      expected: {
        basic: 24.98, // 7.5 * 3.33 = 24.975 -> 24.98
        overtime: 7.49, // 1.5 * 3.33 * 1.5 = 7.4925 -> 7.49
        underground: 0,
        night: 0,
        allowances: 0.01,
        extraEarnings: 0,
        gross: 32.48, // 24.98 + 7.49 + 0.01
        // 32.48 * 33% = 10.7184 -> 10.72; ZWG = 32.48 - 10.72 = 21.76
        split: { usd: 10.72, zwg: 21.76 },
      },
    },
    {
      name: 'usdPct clamps above 100 to all-USD (no money minted)',
      input: {
        hoursNormal: 10,
        hoursOt15: 0,
        hoursOt20: 0,
        ugShift: 0,
        nightHours: 0,
        hourlyRate: 10, // EXAMPLE hourly rate -> gross 100
        split: { mode: SplitMode.FIXED_SPLIT, usdPct: 150 },
      },
      expected: {
        basic: 100,
        overtime: 0,
        underground: 0,
        night: 0,
        allowances: 0,
        extraEarnings: 0,
        gross: 100,
        split: { usd: 100, zwg: 0 },
      },
    },
    {
      name: 'usdPct clamps below 0 to all-ZWG',
      input: {
        hoursNormal: 10,
        hoursOt15: 0,
        hoursOt20: 0,
        ugShift: 0,
        nightHours: 0,
        hourlyRate: 10, // EXAMPLE hourly rate -> gross 100
        split: { mode: SplitMode.CLIENT_RATIO, usdPct: -20 },
      },
      expected: {
        basic: 100,
        overtime: 0,
        underground: 0,
        night: 0,
        allowances: 0,
        extraEarnings: 0,
        gross: 100,
        split: { usd: 0, zwg: 100 },
      },
    },
    {
      name: 'all-zero input produces a zero gross with no -0 artefacts',
      input: {
        hoursNormal: 0,
        hoursOt15: 0,
        hoursOt20: 0,
        ugShift: 0,
        nightHours: 0,
        hourlyRate: 0,
        split: { mode: SplitMode.FIXED_SPLIT, usdPct: 60 },
      },
      expected: {
        basic: 0,
        overtime: 0,
        underground: 0,
        night: 0,
        allowances: 0,
        extraEarnings: 0,
        gross: 0,
        split: { usd: 0, zwg: 0 },
      },
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(service.compute(input)).toEqual(expected);
  });

  it('always splits the gross so usd + zwg === gross exactly', () => {
    const input: GrossBuildupInput = {
      hoursNormal: 173,
      hoursOt15: 7,
      hoursOt20: 3,
      ugShift: 2,
      nightHours: 11,
      hourlyRate: 6.37, // EXAMPLE hourly rate
      ugAllowanceRate: 4.5, // EXAMPLE
      nightAllowanceRate: 1.25, // EXAMPLE
      cola: 12.34, // EXAMPLE
      otherAllowances: 5.66, // EXAMPLE
      split: { mode: SplitMode.CLIENT_RATIO, usdPct: 37 },
    };
    const { gross, split } = service.compute(input);
    expect(Number((split.usd + split.zwg).toFixed(2))).toBe(gross);
  });

  it('applies exactly the 1.5x and 2.0x overtime multipliers', () => {
    const base: GrossBuildupInput = {
      hoursNormal: 0,
      hoursOt15: 0,
      hoursOt20: 0,
      ugShift: 0,
      nightHours: 0,
      hourlyRate: 10, // EXAMPLE hourly rate
      split: { mode: SplitMode.FIXED_SPLIT, usdPct: 100 },
    };
    // One hour at 1.5x on a $10 rate = $15.
    expect(service.compute({ ...base, hoursOt15: 1 }).overtime).toBe(15);
    // One hour at 2.0x on a $10 rate = $20.
    expect(service.compute({ ...base, hoursOt20: 1 }).overtime).toBe(20);
  });
});
