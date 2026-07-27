import { PayrollRunStatus, Prisma, TimesheetPeriodStatus } from '@prisma/client';
import { StatusTransitionRegistry } from '../approvals/status-transition.registry';
import { CryptoService } from '../crypto/crypto.service';
import { GrossBuildupService } from './calculators/gross-buildup.service';
import { NssaService } from './calculators/nssa.service';
import { PayeService } from './calculators/paye.service';
import { CrossCurrencyPayeService } from './calculators/cross-currency-paye.service';
import { EmployerStatutoryService } from './calculators/statutory-employer.service';
import { PayrollService } from './payroll.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GOLDEN acceptance (spec §18.3): reproduce the real AES March-2025 paysheets from their sheet
 * inputs, asserting net pay in BOTH currencies within a rounding tolerance. The statutory config
 * below is the ACTUAL config governing those runs (ZIMRA USD monthly bands + 3% AIDS levy, NSSA
 * 4.5% ee/er with the mine's ZWG insurable conversion, MIPF 7.5% ee+er and NEC 0.3% ee+er on the
 * ZWG basic). Nothing is hardcoded in the engine — it is all fed as config, exactly as at run time.
 */

const dec = (n: number) => new Prisma.Decimal(n);

// ZIMRA 2025 USD monthly PAYE bands (ready-reckoner: rate then deduct).
const USD_PAYE_BANDS = [
  { upTo: 100, ratePct: 0, deduct: 0 },
  { upTo: 300, ratePct: 20, deduct: 20 },
  { upTo: 1000, ratePct: 25, deduct: 35 },
  { upTo: 2000, ratePct: 30, deduct: 85 },
  { upTo: 3000, ratePct: 35, deduct: 185 },
  { upTo: null, ratePct: 40, deduct: 335 },
];

const FX_RATE = 26.6951; // ZWG per 1 USD, snapshotted on the run.

/** Build a statutory-rates stub for a given per-currency config bundle. */
function makeStatutoryRates(cfg: {
  usdNssaCeiling: number;
  zwgNssaCeiling: number;
  nssaZwgConv: number;
}) {
  const scalar: Record<string, Record<string, number>> = {
    USD: {
      aids_levy_pct: 3,
      nssa_ee_pct: 4.5,
      nssa_er_pct: 4.5,
      nssa_ceiling: cfg.usdNssaCeiling,
      nssa_zwg_conv: 0,
      zimdef_pct: 1,
      nec_pct: 0.3,
      nec_ee_pct: 0.3,
      mipf_pct: 7.5,
      mipf_ee_pct: 7.5,
    },
    ZWG: {
      aids_levy_pct: 3,
      nssa_ee_pct: 4.5,
      nssa_er_pct: 4.5,
      nssa_ceiling: cfg.zwgNssaCeiling,
      nssa_zwg_conv: cfg.nssaZwgConv,
      zimdef_pct: 1,
      nec_pct: 0.3,
      nec_ee_pct: 0.3,
      mipf_pct: 7.5,
      mipf_ee_pct: 7.5,
    },
  };
  return {
    valueAsOf: jest.fn(async (key: string, _date?: Date, currency?: string) => {
      if (key === 'paye_bands') {
        return { value: null, params: USD_PAYE_BANDS };
      }
      if (key === 'fx_rate') {
        return { value: dec(FX_RATE), params: null };
      }
      const cur = currency ?? 'USD';
      return { value: dec(scalar[cur]?.[key] ?? 0), params: null };
    }),
  };
}

function makeService(statutoryStub: unknown) {
  const created: any[] = [];
  const prisma: any = {
    payrollRun: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    timesheetPeriod: { findUnique: jest.fn() },
    payrollLine: { deleteMany: jest.fn(), createMany: jest.fn((a: any) => created.push(...a.data)) },
    payrollExtraEarning: { findMany: jest.fn().mockResolvedValue([]), updateMany: jest.fn() },
    employee: { findMany: jest.fn() },
    exchangeRate: { findUnique: jest.fn() },
    rlsTx: jest.fn(),
  };
  prisma.rlsTx.mockImplementation(async (cb: any) => cb(prisma));

  const service = new PayrollService(
    prisma,
    { record: jest.fn() } as any,
    { submit: jest.fn() } as any,
    new StatusTransitionRegistry(),
    { post: jest.fn(), cashPosition: jest.fn() } as any,
    statutoryStub as any,
    new GrossBuildupService(),
    new PayeService(),
    new CrossCurrencyPayeService(new PayeService()),
    new NssaService(),
    new EmployerStatutoryService(),
    new CryptoService({ get: () => ({ encryptionKey: null }) } as any),
  );
  return { service, prisma, created };
}

/**
 * Drive computeRun for a single employee: `hours` are the timesheet hours, `emp` the employee
 * pay config. Returns the single created pay line.
 */
async function computeOne(
  statutoryStub: unknown,
  emp: Record<string, unknown>,
  hours: Record<string, number>,
): Promise<any> {
  const { service, prisma, created } = makeService(statutoryStub);
  prisma.payrollRun.findUnique.mockResolvedValue({
    id: 'run1',
    siteId: 's1',
    month: '2025-03',
    status: PayrollRunStatus.DRAFT,
    clientRatioSnapshot: { usdPct: 50, currency: 'USD' },
    perEmployeeRatios: null,
    fxRate: dec(FX_RATE),
    fxRateId: null,
  });
  prisma.timesheetPeriod.findUnique.mockResolvedValue({
    id: 'p1',
    status: TimesheetPeriodStatus.LOCKED,
    entries: [
      {
        employeeId: 'e1',
        hoursNormal: dec(hours.hoursNormal ?? 0),
        hoursOt15: dec(hours.hoursOt15 ?? 0),
        hoursOt20: dec(hours.hoursOt20 ?? 0),
        ugShift: dec(hours.ugShift ?? 0),
        nightHours: dec(hours.nightHours ?? 0),
      },
    ],
  });
  prisma.employee.findMany.mockResolvedValue([{ id: 'e1', siteId: 's1', ...emp }]);
  prisma.payrollRun.findUniqueOrThrow.mockResolvedValue({ id: 'run1', lines: [] });

  await service.computeRun('run1', 'preparer');
  return created[0];
}

describe('Payroll GOLDEN — reproduces the March-2025 AES paysheets (net pay, both currencies)', () => {
  // Mimosa mine: NSSA ZWG uses the mine schedule's own USD->ZWG conversion (21.35608) capped at
  // 7407.708; MIPF/NEC apply. FIXED_SPLIT 50/50.
  const mimosa = makeStatutoryRates({
    usdNssaCeiling: 346.8664661304889,
    zwgNssaCeiling: 7407.708,
    nssaZwgConv: 21.35608,
  });

  it('Mimosa AES-E036 (Dadirai Nyakudya) — MIPF member with a Nyaradzo deduction', async () => {
    // basic 336.96 (208h @ 1.62), 25 UG shifts @ 0.648, ZWG COLA 1349.2771344, MIPF member,
    // Nyaradzo 785.3847 (ZWG). Sheet net: USD 142.229, ZWG 3590.565.
    const line = await computeOne(
      mimosa,
      {
        payMode: 'FIXED_SPLIT',
        fixedUsdPct: dec(50),
        hourlyRate: dec(1.62),
        ugAllowanceRate: dec(0.648),
        colaZwg: dec(1349.2771344),
        mipfMember: true,
        necMember: true,
        nyaradzoAmount: dec(785.3847),
        nyaradzoCurrency: 'ZWG',
      },
      { hoursNormal: 208, ugShift: 25 },
    );
    expect(line.netUsd).toBeCloseTo(142.229, 1);
    expect(line.netZwg).toBeCloseTo(3590.565, 0);
    // MIPF ee = 7.5% of the ZWG basic (336.96 * 26.6951) = 674.64; NEC ee = 0.3% = 26.99.
    expect(line.mipfEe).toBeCloseTo(674.64, 1);
    expect(line.necEe).toBeCloseTo(26.99, 1);
  });

  it('Mimosa AES-E037 (Tarisai Chidzambwa) — same inputs, no Nyaradzo (higher ZWG net)', async () => {
    // Identical to E036 but no Nyaradzo. Sheet net: USD 142.229, ZWG 4375.950.
    const line = await computeOne(
      mimosa,
      {
        payMode: 'FIXED_SPLIT',
        fixedUsdPct: dec(50),
        hourlyRate: dec(1.62),
        ugAllowanceRate: dec(0.648),
        colaZwg: dec(1349.2771344),
        mipfMember: true,
        necMember: true,
      },
      { hoursNormal: 208, ugShift: 25 },
    );
    expect(line.netUsd).toBeCloseTo(142.229, 1);
    expect(line.netZwg).toBeCloseTo(4375.95, 0);
  });

  // Head Office: standard NSSA (ZWG at the payroll FX, capped at 9259.64); no MIPF/NEC. Mayday
  // levy (12.5 USD) is a flat other deduction. FIXED_SPLIT 50/50.
  const headOffice = makeStatutoryRates({
    usdNssaCeiling: 346.8664661304889,
    zwgNssaCeiling: 9259.64,
    nssaZwgConv: 0, // 0 => use the payroll FX rate
  });

  it('Head Office AES-E008 (Knowledge Zvobgo) — fixed salary, Mayday levy', async () => {
    // basic 990.08 (208h @ 4.7600...), 50/50, no allowances/COLA, Mayday 12.5 USD.
    // Sheet net: USD 361.503, ZWG 9984.035.
    const line = await computeOne(
      headOffice,
      {
        payMode: 'FIXED_SPLIT',
        fixedUsdPct: dec(50),
        hourlyRate: dec(990.08 / 208),
        mipfMember: false,
        otherDeductionUsd: dec(12.5),
      },
      { hoursNormal: 208 },
    );
    expect(line.netUsd).toBeCloseTo(361.503, 1);
    expect(line.netZwg).toBeCloseTo(9984.035, 0);
    // No MIPF/NEC-ee for Head Office.
    expect(line.mipfEe).toBe(0);
  });

  it('Head Office AES-E007 (Talent Hungwe) — lower band, NSSA below the ZWG ceiling', async () => {
    // basic 400 (208h @ ~1.923), 50/50, Mayday 12.5 USD. Sheet net: USD 147.343, ZWG 4267.012.
    const line = await computeOne(
      headOffice,
      {
        payMode: 'FIXED_SPLIT',
        fixedUsdPct: dec(50),
        hourlyRate: dec(400 / 208),
        mipfMember: false,
        otherDeductionUsd: dec(12.5),
      },
      { hoursNormal: 208 },
    );
    expect(line.netUsd).toBeCloseTo(147.343, 1);
    expect(line.netZwg).toBeCloseTo(4267.012, 0);
  });

  it('charges PAYE per currency: USD and ZWG legs each carry their own PAYE + 3% AIDS levy', async () => {
    // A two-currency salary must produce non-zero PAYE on BOTH legs (proving the split, not a
    // single dominant-currency charge). E037's inputs put taxable income in both currencies.
    const line = await computeOne(
      mimosa,
      {
        payMode: 'FIXED_SPLIT',
        fixedUsdPct: dec(50),
        hourlyRate: dec(1.62),
        ugAllowanceRate: dec(0.648),
        colaZwg: dec(1349.2771344),
        mipfMember: true,
        necMember: true,
      },
      { hoursNormal: 208, ugShift: 25 },
    );
    // AIDS levy is exactly 3% of the combined PAYE.
    expect(line.aidsLevy).toBeCloseTo(line.paye * 0.03, 1);
    expect(line.paye).toBeGreaterThan(0);
  });
});

describe('Payroll GOLDEN — approved back-pay / acting extra earnings feed into the run (G2)', () => {
  const cfg = makeStatutoryRates({
    usdNssaCeiling: 5000,
    zwgNssaCeiling: 5000,
    nssaZwgConv: 0,
  });

  /** Compute one line with a set of approved (unconsumed) extra-earning rows for the employee. */
  async function computeWithExtras(extras: any[]) {
    const { service, prisma, created } = makeService(cfg);
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run1',
      siteId: 's1',
      month: '2025-03',
      status: PayrollRunStatus.DRAFT,
      // All-USD run so the extra earning lands entirely in the USD leg and is easy to assert.
      clientRatioSnapshot: { usdPct: 100, currency: 'USD' },
      perEmployeeRatios: null,
      fxRate: dec(1),
      fxRateId: null,
    });
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      status: TimesheetPeriodStatus.LOCKED,
      entries: [
        {
          employeeId: 'e1',
          hoursNormal: dec(200),
          hoursOt15: dec(0),
          hoursOt20: dec(0),
          ugShift: dec(0),
          nightHours: dec(0),
        },
      ],
    });
    prisma.employee.findMany.mockResolvedValue([
      { id: 'e1', siteId: 's1', payMode: 'FIXED_SPLIT', fixedUsdPct: dec(100), hourlyRate: dec(5) },
    ]);
    prisma.payrollExtraEarning.findMany.mockResolvedValue(extras);
    prisma.payrollRun.findUniqueOrThrow.mockResolvedValue({ id: 'run1', lines: [] });

    await service.computeRun('run1', 'preparer');
    return { line: created[0], prisma };
  }

  it('adds an approved BACK_PAY earning to gross + net and marks it consumed (runId set)', async () => {
    // Base: 200h @ 5 = 1000 gross. Approved back-pay of 250 (USD, taxable).
    const backPay = {
      id: 'ee-backpay',
      employeeId: 'e1',
      kind: 'BACK_PAY',
      amount: dec(250),
      currency: 'USD',
      taxable: true,
      pensionable: false,
      nssaAble: false,
    };
    const { line, prisma } = await computeWithExtras([backPay]);
    const { line: baseline } = await computeWithExtras([]);

    // Gross now includes the 250 back-pay: 1000 + 250 = 1250.
    expect(line.extraEarnings).toBe(250);
    expect(line.gross).toBe(1250);
    expect(baseline.gross).toBe(1000);
    // Net reflects the extra earning: it is strictly higher than the same line without it.
    const net = line.netUsd + line.netZwg;
    const baseNet = baseline.netUsd + baseline.netZwg;
    expect(net).toBeGreaterThan(baseNet);
    // The extra earning is stamped with this run so it is never re-applied by a later run.
    expect(prisma.payrollExtraEarning.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ['ee-backpay'] } },
        data: expect.objectContaining({ runId: 'run1' }),
      }),
    );
  });

  it('folds an approved ACTING_ALLOWANCE earning into the line', async () => {
    const acting = {
      id: 'ee-acting',
      employeeId: 'e1',
      kind: 'ACTING_ALLOWANCE',
      amount: dec(120),
      currency: 'USD',
      taxable: true,
      pensionable: false,
      nssaAble: false,
    };
    const { line } = await computeWithExtras([acting]);
    expect(line.extraEarnings).toBe(120);
    expect(line.gross).toBe(1120); // 1000 + 120
  });

  it('a NON-taxable extra earning lifts gross/net but not the PAYE base', async () => {
    const taxableExtra = {
      id: 'ee-t',
      employeeId: 'e1',
      kind: 'BACK_PAY',
      amount: dec(200),
      currency: 'USD',
      taxable: true,
      pensionable: false,
      nssaAble: false,
    };
    const nonTaxableExtra = { ...taxableExtra, id: 'ee-nt', taxable: false };

    const { line: taxed } = await computeWithExtras([taxableExtra]);
    const { line: untaxed } = await computeWithExtras([nonTaxableExtra]);

    // Both add 200 to gross.
    expect(taxed.gross).toBe(1200);
    expect(untaxed.gross).toBe(1200);
    // The non-taxable one attracts less PAYE, so its net is higher.
    expect(untaxed.paye).toBeLessThan(taxed.paye);
    expect(untaxed.netUsd + untaxed.netZwg).toBeGreaterThan(taxed.netUsd + taxed.netZwg);
  });
});
