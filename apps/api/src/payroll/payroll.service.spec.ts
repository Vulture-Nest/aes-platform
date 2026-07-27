import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import {
  ApprovalDecision,
  ApprovalStatus,
  PayrollRunStatus,
  Prisma,
  TimesheetPeriodStatus,
} from '@prisma/client';
import { ApprovalService } from '../approvals/approval.service';
import { StatusTransitionRegistry } from '../approvals/status-transition.registry';
import { CryptoService } from '../crypto/crypto.service';
import { GrossBuildupService } from './calculators/gross-buildup.service';
import { NssaService } from './calculators/nssa.service';
import { PayeService } from './calculators/paye.service';
import { CrossCurrencyPayeService } from './calculators/cross-currency-paye.service';
import { EmployerStatutoryService } from './calculators/statutory-employer.service';
import { PayrollService } from './payroll.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

/**
 * All statutory numbers below are clearly-labelled EXAMPLE values chosen for arithmetic
 * clarity — NOT real ZIMRA/NSSA/labour-council figures. They are fed to the pure calculators
 * exactly as config would supply them at run time.
 */
const EXAMPLE_PAYE_BANDS = [
  { upTo: 1000, ratePct: 0 }, // first 1000 tax-free
  { upTo: 2000, ratePct: 20 }, // next 1000 at 20%
  { upTo: null, ratePct: 40 }, // remainder at 40%
];
const EXAMPLE = {
  aids_levy_pct: 3, // 3% of PAYE
  nssa_ee_pct: 4.5,
  nssa_er_pct: 4.5,
  nssa_ceiling: 5000,
  zimdef_pct: 1,
  nec_pct: 0.5,
  nec_ee_pct: 0,
  mipf_pct: 0,
  mipf_ee_pct: 0,
  fx_rate: 1, // 1:1 example rate so the single-currency examples need no conversion
};

/** A statutory-rates stub that returns the EXAMPLE config regardless of currency/date. */
function makeStatutoryRates() {
  return {
    valueAsOf: jest.fn(async (key: string) => {
      if (key === 'paye_bands') {
        return { value: null, params: EXAMPLE_PAYE_BANDS };
      }
      return { value: dec((EXAMPLE as Record<string, number>)[key] ?? 0), params: null };
    }),
  };
}

function makeService() {
  const prisma = {
    site: { findUnique: jest.fn() },
    timesheetPeriod: { findUnique: jest.fn() },
    payrollRun: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    payrollLine: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      deleteMany: jest.fn(),
      createMany: jest.fn(),
    },
    payrollExtraEarning: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn(),
    },
    employee: { findMany: jest.fn().mockResolvedValue([]) },
    exchangeRate: { findUnique: jest.fn() },
    contract: { findFirst: jest.fn() },
    $transaction: jest.fn(),
    rlsTx: jest.fn(),
  };
  // Run the interactive callback form of $transaction / rlsTx against a tx = prisma facade.
  prisma.$transaction.mockImplementation(async (cb: any) => cb(prisma));
  prisma.rlsTx.mockImplementation(async (cb: any) => cb(prisma));

  const audit = { record: jest.fn() };
  const approvals = { submit: jest.fn().mockResolvedValue({ id: 'chain1' }) };
  const transitions = new StatusTransitionRegistry();
  const ledger = {
    post: jest.fn().mockResolvedValue([]),
    cashPosition: jest.fn().mockResolvedValue({
      accounts: [
        { accountId: 'acc-usd', currency: 'USD', balance: 100000 },
        { accountId: 'acc-zwg', currency: 'ZWG', balance: 100000 },
      ],
      totals: { USD: 100000, ZWG: 100000 },
    }),
  };
  const statutoryRates = makeStatutoryRates();

  const service = new PayrollService(
    prisma as any,
    audit as any,
    approvals as any,
    transitions,
    ledger as any,
    statutoryRates as any,
    new GrossBuildupService(),
    new PayeService(),
    new CrossCurrencyPayeService(new PayeService()),
    new NssaService(),
    new EmployerStatutoryService(),
    new CryptoService({ get: () => ({ encryptionKey: null }) } as any),
  );
  service.onModuleInit();
  return { service, prisma, audit, approvals, transitions, ledger, statutoryRates };
}

describe('PayrollService.openRun', () => {
  it('requires a SITE_APPROVED (or LOCKED) timesheet period for the site + month', async () => {
    const { service, prisma } = makeService();
    prisma.site.findUnique.mockResolvedValue({ id: 's1', clientId: null });
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      status: TimesheetPeriodStatus.OPEN,
    });

    await expect(
      service.openRun({ siteId: 's1', month: '2026-07' }, 'preparer'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payrollRun.create).not.toHaveBeenCalled();
  });

  it('rejects when no timesheet period exists at all', async () => {
    const { service, prisma } = makeService();
    prisma.site.findUnique.mockResolvedValue({ id: 's1', clientId: null });
    prisma.timesheetPeriod.findUnique.mockResolvedValue(null);
    await expect(
      service.openRun({ siteId: 's1', month: '2026-07' }, 'preparer'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('opens a DRAFT run and snapshots the client ratio when the timesheet is SITE_APPROVED', async () => {
    const { service, prisma } = makeService();
    prisma.site.findUnique.mockResolvedValue({ id: 's1', clientId: 'client1' });
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      status: TimesheetPeriodStatus.SITE_APPROVED,
    });
    prisma.payrollRun.findUnique.mockResolvedValue(null);
    prisma.contract.findFirst.mockResolvedValue({ id: 'ctr1', currency: 'USD' });
    prisma.payrollRun.create.mockResolvedValue({ id: 'run1', status: 'DRAFT' });

    await service.openRun({ siteId: 's1', month: '2026-07' }, 'preparer');

    const call = prisma.payrollRun.create.mock.calls[0][0];
    expect(call.data).toMatchObject({
      siteId: 's1',
      month: '2026-07',
      status: PayrollRunStatus.DRAFT,
      preparedByUserId: 'preparer',
    });
    expect(call.data.clientRatioSnapshot).toMatchObject({ usdPct: 100, currency: 'USD' });
  });

  it('rejects a duplicate run for the same site + month', async () => {
    const { service, prisma } = makeService();
    prisma.site.findUnique.mockResolvedValue({ id: 's1', clientId: null });
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      status: TimesheetPeriodStatus.LOCKED,
    });
    prisma.payrollRun.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.openRun({ siteId: 's1', month: '2026-07' }, 'preparer'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('PayrollService.computeRun', () => {
  function seedComputable(prisma: any, employeeOverrides: Record<string, unknown> = {}) {
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run1',
      siteId: 's1',
      month: '2026-07',
      status: PayrollRunStatus.DRAFT,
      clientRatioSnapshot: { usdPct: 100, currency: 'USD' },
    });
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      status: TimesheetPeriodStatus.LOCKED,
      entries: [
        {
          employeeId: 'e1',
          hoursNormal: dec(160),
          hoursOt15: dec(0),
          hoursOt20: dec(0),
          ugShift: dec(0),
          nightHours: dec(0),
        },
      ],
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'e1',
        siteId: 's1',
        payMode: 'FIXED_SPLIT',
        fixedUsdPct: dec(100),
        hourlyRate: dec(10), // gross = 160 * 10 = 1600 (all USD)
        necMember: true, // subject to NEC dues in this example
        ...employeeOverrides,
      },
    ]);
    prisma.payrollRun.findUniqueOrThrow.mockResolvedValue({
      id: 'run1',
      status: PayrollRunStatus.CHECKED,
      lines: [],
    });
  }

  it('produces lines with gross + statutory + net from the example config and sets CHECKED', async () => {
    const { service, prisma } = makeService();
    seedComputable(prisma);

    await service.computeRun('run1', 'preparer');

    expect(prisma.payrollLine.deleteMany).toHaveBeenCalledWith({ where: { runId: 'run1' } });
    const created = prisma.payrollLine.createMany.mock.calls[0][0].data;
    expect(created).toHaveLength(1);
    const line = created[0];

    // gross = 1600 (all USD split).
    expect(line.gross).toBe(1600);
    // NSSA ee/er = 4.5% of min(basic 1600, 5000) = 72. (PAYE is now charged on taxable income,
    // i.e. gross less allowable deductions, not on the whole gross.)
    expect(line.nssaEe).toBe(72);
    expect(line.nssaEr).toBe(72);
    // Taxable = 1600 - 72 (NSSA) = 1528. PAYE (example bands): 0 on first 1000, 20% of 528 = 105.6.
    expect(line.paye).toBe(105.6);
    // AIDS levy = 3% of 105.6 = 3.17.
    expect(line.aidsLevy).toBe(3.17);
    // ZIMDEF = 1% of 1600 = 16; NEC(er) = 0.5% of 1600 = 8; MIPF = 0 (not a member).
    expect(line.zimdef).toBe(16);
    expect(line.nec).toBe(8);
    expect(line.mipf).toBe(0);
    // net = gross - paye - aidsLevy - nssaEe = 1600 - 105.6 - 3.17 - 72 = 1419.23.
    const net = line.netUsd + line.netZwg;
    expect(net).toBeCloseTo(1419.23, 2);
    // All-USD split => everything in the USD leg.
    expect(line.netUsd).toBeCloseTo(1419.23, 2);
    expect(line.netZwg).toBe(0);

    // Run flipped to CHECKED.
    expect(prisma.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run1' },
        data: expect.objectContaining({ status: PayrollRunStatus.CHECKED }),
      }),
    );
  });

  it('is idempotent: a recompute wipes prior lines before re-creating', async () => {
    const { service, prisma } = makeService();
    seedComputable(prisma);
    await service.computeRun('run1', 'preparer');
    const deleteOrder = prisma.payrollLine.deleteMany.mock.invocationCallOrder[0];
    const createOrder = prisma.payrollLine.createMany.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(createOrder);
  });

  it('refuses to recompute a LOCKED run (correcting run required instead)', async () => {
    const { service, prisma } = makeService();
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run1',
      siteId: 's1',
      month: '2026-07',
      status: PayrollRunStatus.LOCKED,
    });
    await expect(service.computeRun('run1', 'preparer')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe('PayrollService.submit', () => {
  it('routes a CHECKED run into the approval engine with the run as subject', async () => {
    const { service, prisma, approvals } = makeService();
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run1',
      siteId: 's1',
      month: '2026-07',
      status: PayrollRunStatus.CHECKED,
    });
    prisma.payrollLine.count.mockResolvedValue(3);
    prisma.payrollLine.findMany.mockResolvedValue([
      {
        gross: dec(1600),
        nssaEr: dec(72),
        zimdef: dec(16),
        nec: dec(8),
        mipf: dec(0),
        netUsd: dec(1404.4),
        netZwg: dec(0),
      },
    ]);

    await service.submit('run1', 'preparer');

    expect(approvals.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'payroll_run',
        subjectTable: 'payroll_runs',
        subjectId: 'run1',
        siteId: 's1',
        requesterId: 'preparer',
      }),
    );
  });

  it('refuses to submit a non-CHECKED run', async () => {
    const { service, prisma } = makeService();
    prisma.payrollRun.findUnique.mockResolvedValue({ id: 'run1', status: PayrollRunStatus.DRAFT });
    await expect(service.submit('run1', 'preparer')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to submit a run with no computed lines', async () => {
    const { service, prisma } = makeService();
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run1',
      siteId: 's1',
      status: PayrollRunStatus.CHECKED,
    });
    prisma.payrollLine.count.mockResolvedValue(0);
    await expect(service.submit('run1', 'preparer')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PayrollService — APPROVED transition posts to the ledger', () => {
  it('flips CHECKED -> APPROVED and posts the employer cost as a debit', async () => {
    const { prisma, transitions, ledger } = makeService();
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run1',
      siteId: 's1',
      month: '2026-07',
      status: PayrollRunStatus.CHECKED,
      preparedByUserId: 'preparer',
      approvedByUserId: null,
    });
    prisma.payrollRun.update.mockResolvedValue({ id: 'run1', status: 'APPROVED' });
    prisma.payrollLine.findMany.mockResolvedValue([
      {
        gross: dec(1600),
        nssaEr: dec(72),
        zimdef: dec(16),
        nec: dec(8),
        mipf: dec(0),
        netUsd: dec(1404.4),
        netZwg: dec(0),
      },
    ]);

    await transitions.fire('payroll_runs', 'run1', ApprovalStatus.APPROVED);

    expect(prisma.payrollRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run1' },
        data: expect.objectContaining({ status: PayrollRunStatus.APPROVED }),
      }),
    );
    // Employer cost (USD leg) = gross 1600 + nssaEr 72 + zimdef 16 + nec 8 = 1696.
    expect(ledger.post).toHaveBeenCalledWith([
      expect.objectContaining({ accountId: 'acc-usd', debit: 1696, currency: 'USD' }),
    ]);
  });

  it('never re-posts when the run is already APPROVED (idempotent transition)', async () => {
    const { prisma, transitions, ledger } = makeService();
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run1',
      status: PayrollRunStatus.APPROVED,
    });
    await transitions.fire('payroll_runs', 'run1', ApprovalStatus.APPROVED);
    expect(prisma.payrollRun.update).not.toHaveBeenCalled();
    expect(ledger.post).not.toHaveBeenCalled();
  });
});

describe('Payroll approval — preparer != approver (enforced by the engine)', () => {
  it('rejects the preparer approving their own submitted run (self-approval blocked)', async () => {
    // Drive the REAL approval engine with a payroll_run subject: the preparer is the chain
    // requester, so their own approval decision must be refused.
    const prisma = {
      approval: { findUnique: jest.fn(), update: jest.fn() },
    };
    prisma.approval.findUnique.mockResolvedValue({
      id: 'step1',
      step: 1,
      decision: null,
      chain: {
        id: 'chain1',
        module: 'payroll_run',
        subjectTable: 'payroll_runs',
        subjectId: 'run1',
        status: ApprovalStatus.PENDING,
        currentStep: 1,
        requesterId: 'preparer',
        steps: [],
      },
    });
    const approvals = new ApprovalService(
      prisma as any,
      { record: jest.fn() } as any,
      { send: jest.fn() } as any,
      { activeDelegateFor: jest.fn() } as any,
      new StatusTransitionRegistry(),
    );

    await expect(
      approvals.decide({
        approvalId: 'step1',
        approverUserId: 'preparer', // same as requester/preparer
        approverRoles: [],
        decision: ApprovalDecision.APPROVED,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.approval.update).not.toHaveBeenCalled();
  });
});

describe('PayrollService.findOne — payroll privacy', () => {
  it('masks bank account numbers to the last 4 digits in the run detail', async () => {
    const { service, prisma } = makeService();
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run1',
      lines: [{ id: 'l1', employeeId: 'e1', gross: dec(1600) }],
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'e1',
        worksNo: 'W-1',
        firstName: 'A',
        lastName: 'B',
        bankName: 'Bank',
        accountNo: '1234567890',
      },
    ]);

    const view = await service.findOne('run1', 'viewer');
    expect(view.lines[0].employee?.accountNo).toBe('******7890');
  });
});

describe('PayrollService — outputs (bank schedule / payslips / Sage journal / statutory returns)', () => {
  /** Seed a run whose two lines cover a USD and a ZWG net leg across two banks. */
  function seedRunWithLines(prisma: any) {
    prisma.payrollRun.findUnique.mockResolvedValue({
      id: 'run1',
      siteId: 's1',
      month: '2026-07',
      lines: [
        {
          id: 'l1',
          employeeId: 'e1',
          basicUsd: dec(1600),
          basicZwg: dec(0),
          cola: dec(0),
          ugAllowance: dec(0),
          nightAllowance: dec(0),
          otherAllowances: dec(0),
          extraEarnings: dec(0),
          gross: dec(1600),
          paye: dec(120),
          aidsLevy: dec(3.6),
          nssaEe: dec(72),
          nssaEr: dec(72),
          zimdef: dec(16),
          nec: dec(8),
          necEe: dec(0),
          mipf: dec(0),
          mipfEe: dec(0),
          nyaradzo: dec(0),
          otherDeductions: dec(0),
          netUsd: dec(1404.4),
          netZwg: dec(0),
        },
        {
          id: 'l2',
          employeeId: 'e2',
          basicUsd: dec(0),
          basicZwg: dec(1000),
          cola: dec(0),
          ugAllowance: dec(0),
          nightAllowance: dec(0),
          otherAllowances: dec(0),
          extraEarnings: dec(0),
          gross: dec(1000),
          paye: dec(0),
          aidsLevy: dec(0),
          nssaEe: dec(45),
          nssaEr: dec(45),
          zimdef: dec(10),
          nec: dec(5),
          necEe: dec(0),
          mipf: dec(0),
          mipfEe: dec(0),
          nyaradzo: dec(0),
          otherDeductions: dec(0),
          netUsd: dec(0),
          netZwg: dec(955),
        },
      ],
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: 'e1',
        worksNo: 'W-1',
        firstName: 'Ann',
        lastName: 'Alpha',
        bankName: 'CBZ',
        bankBranch: 'Harare',
        accountNo: '1234567890',
      },
      {
        id: 'e2',
        worksNo: 'W-2',
        firstName: 'Ben',
        lastName: 'Beta',
        bankName: 'Stanbic',
        bankBranch: 'Bulawayo',
        accountNo: '9876543210',
      },
    ]);
  }

  it('bankSchedule groups net pay by bank + currency and masks account numbers', async () => {
    const { service, prisma, audit } = makeService();
    seedRunWithLines(prisma);

    const result = await service.bankSchedule('run1', 'viewer');

    expect(result.banks).toHaveLength(2);
    const cbz = result.banks.find((b) => b.bankName === 'CBZ');
    const stanbic = result.banks.find((b) => b.bankName === 'Stanbic');
    expect(cbz).toMatchObject({ currency: 'USD', total: 1404.4, count: 1 });
    expect(stanbic).toMatchObject({ currency: 'ZWG', total: 955, count: 1 });
    expect(cbz?.items[0].accountNo).toBe('******7890');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        after: expect.objectContaining({ event: 'payroll_bank_schedule_export' }),
      }),
    );
  });

  it('payslips returns gross, each statutory line and the net split per employee', async () => {
    const { service, prisma } = makeService();
    seedRunWithLines(prisma);

    const result = await service.payslips('run1', 'viewer');

    expect(result.payslips).toHaveLength(2);
    const p1 = result.payslips[0];
    expect(p1.earnings.gross).toBe(1600);
    expect(p1.deductions.paye).toBe(120);
    expect(p1.deductions.nssaEe).toBe(72);
    expect(p1.employerContributions.nssaEr).toBe(72);
    expect(p1.net).toMatchObject({ netUsd: 1404.4, netZwg: 0, total: 1404.4 });
    expect(p1.accountNo).toBe('******7890');
  });

  it('sageJournal produces balanced debit/credit rows', async () => {
    const { service, prisma } = makeService();
    seedRunWithLines(prisma);

    const result = await service.sageJournal('run1', 'viewer');

    expect(result.balanced).toBe(true);
    expect(result.totalDebit).toBe(result.totalCredit);
    // Debits = gross (2600) + employer contributions (nssaEr 117 + zimdef 26 + nec 13 = 156) = 2756.
    expect(result.totalDebit).toBe(2756);
    const accounts = result.rows.map((r) => r.account);
    expect(accounts).toEqual(expect.arrayContaining(['SALARIES_EXPENSE', 'NET_PAY_PAYABLE']));
  });

  it('statutoryReturns summarises each head with totals across lines', async () => {
    const { service, prisma } = makeService();
    seedRunWithLines(prisma);

    const result = await service.statutoryReturns('run1', 'viewer');

    expect(result.employees).toBe(2);
    const byHead = Object.fromEntries(result.heads.map((h) => [h.head, h.amount]));
    expect(byHead.PAYE).toBe(120);
    expect(byHead.NSSA_EE).toBe(117); // 72 + 45
    expect(byHead.NSSA_ER).toBe(117);
    expect(byHead.ZIMDEF).toBe(26); // 16 + 10
    expect(byHead.NEC).toBe(13); // 8 + 5
    // grandTotal = 120 + 3.6 + 117 + 117 + 26 + 13 + 0 = 396.6.
    expect(result.grandTotal).toBeCloseTo(396.6, 2);
  });

  it('throws NotFound when the run does not exist', async () => {
    const { service, prisma } = makeService();
    prisma.payrollRun.findUnique.mockResolvedValue(null);
    await expect(service.bankSchedule('missing', 'viewer')).rejects.toThrow(
      'Payroll run not found',
    );
  });
});
