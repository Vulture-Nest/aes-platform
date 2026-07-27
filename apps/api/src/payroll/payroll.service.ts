import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import {
  ApprovalStatus,
  Employee,
  PayrollLine,
  PayrollRun,
  PayrollRunStatus,
  Prisma,
  TimesheetPeriodStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApprovalService } from '../approvals/approval.service';
import { StatusTransitionRegistry } from '../approvals/status-transition.registry';
import { LedgerService } from '../ledger/ledger.service';
import { StatutoryRatesService } from '../reference/statutory-rates/statutory-rates.service';
import { CryptoService } from '../crypto/crypto.service';
import { GrossBuildupService, SplitMode } from './calculators/gross-buildup.service';
import { NssaService } from './calculators/nssa.service';
import { PayeService, PayeBand } from './calculators/paye.service';
import { CrossCurrencyPayeService } from './calculators/cross-currency-paye.service';
import { EmployerStatutoryService } from './calculators/statutory-employer.service';
import { OpenPayrollRunDto, ListPayrollRunsQueryDto } from './dto/payroll.dto';

/** Approval-engine module name; matrix rows for it place the Finance-Director approver. */
const APPROVAL_MODULE = 'payroll_run';

const SUBJECT_TABLE = 'payroll_runs';

/** Statutory config keys read (never hardcoded) from StatutoryRatesService. */
const KEY_PAYE_BANDS = 'paye_bands';
const KEY_AIDS_LEVY_PCT = 'aids_levy_pct';
const KEY_NSSA_EE_PCT = 'nssa_ee_pct';
const KEY_NSSA_ER_PCT = 'nssa_er_pct';
const KEY_NSSA_CEILING = 'nssa_ceiling';
/** NSSA's own USD->ZWG insurable-earnings conversion (distinct from payroll FX). ZWG only. */
const KEY_NSSA_ZWG_CONV = 'nssa_zwg_conv';
const KEY_ZIMDEF_PCT = 'zimdef_pct';
/** NEC employer + employee contribution rates (both levied on the ZWG basic). */
const KEY_NEC_PCT = 'nec_pct';
const KEY_NEC_EE_PCT = 'nec_ee_pct';
/** MIPF employer + employee contribution rates (both levied on the ZWG basic). */
const KEY_MIPF_PCT = 'mipf_pct';
const KEY_MIPF_EE_PCT = 'mipf_ee_pct';
/** Fallback USD/ZWG FX rate (ZWG per 1 USD) when the run has no snapshotted rate. */
const KEY_FX_RATE = 'fx_rate';

/** A run with its computed lines eagerly loaded. */
export type RunWithLines = PayrollRun & { lines: PayrollLine[] };

/** A pay line whose employee bank account is masked for the read DTO. */
export interface PayrollLineView extends PayrollLine {
  employee: {
    id: string;
    worksNo: string;
    firstName: string;
    lastName: string;
    bankName: string | null;
    accountNo: string | null;
  } | null;
}

/** A run read view: the run plus masked lines (payroll privacy). */
export type RunView = PayrollRun & { lines: PayrollLineView[] };

/**
 * The payroll engine (spec §13 / Prompt 10). Builds a monthly run per site from the
 * SITE_APPROVED/LOCKED timesheet, computes gross + statutory per employee from effective
 * config, and drives the Finance-Director approval chain — posting the employer cost to the
 * ledger when it resolves APPROVED. Runs never mutate once LOCKED; corrections are made by a
 * separate reversing correcting run.
 */
@Injectable()
export class PayrollService implements OnModuleInit {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalService,
    private readonly transitions: StatusTransitionRegistry,
    private readonly ledger: LedgerService,
    private readonly statutoryRates: StatutoryRatesService,
    private readonly grossBuildup: GrossBuildupService,
    private readonly paye: PayeService,
    private readonly crossCurrencyPaye: CrossCurrencyPayeService,
    private readonly nssa: NssaService,
    private readonly employerStatutory: EmployerStatutoryService,
    private readonly crypto: CryptoService,
  ) {}

  /**
   * When the Finance-Director approval chain for a run resolves APPROVED, flip the run to
   * APPROVED and post the employer cost to the ledger. REJECTED/RETURNED leave the run in its
   * CHECKED state so it can be corrected and resubmitted.
   */
  onModuleInit(): void {
    this.transitions.registerTransition(SUBJECT_TABLE, async (subjectId, status) => {
      if (status === ApprovalStatus.APPROVED) {
        await this.onApproved(subjectId);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Open
  // -------------------------------------------------------------------------

  /**
   * Open a DRAFT run for a site + month. Requires a SITE_APPROVED or LOCKED timesheet_period
   * for the same (site, month) — payroll must never be built from in-flight timesheet data.
   * The chosen FX rate (explicit or resolved as-of the period) and the governing client
   * USD/ZWG ratio are snapshotted so the run stays reproducible.
   */
  async openRun(dto: OpenPayrollRunDto, preparerId: string): Promise<PayrollRun> {
    const site = await this.prisma.site.findUnique({ where: { id: dto.siteId } });
    if (!site) {
      throw new BadRequestException('Site not found');
    }

    const period = await this.prisma.timesheetPeriod.findUnique({
      where: { siteId_month: { siteId: dto.siteId, month: dto.month } },
    });
    if (!period) {
      throw new BadRequestException(`No timesheet period exists for ${dto.month} at this site`);
    }
    if (
      period.status !== TimesheetPeriodStatus.SITE_APPROVED &&
      period.status !== TimesheetPeriodStatus.LOCKED
    ) {
      throw new BadRequestException(
        `Payroll requires a SITE_APPROVED or LOCKED timesheet period (current: ${period.status})`,
      );
    }

    const existing = await this.prisma.payrollRun.findUnique({
      where: { siteId_month: { siteId: dto.siteId, month: dto.month } },
    });
    if (existing) {
      throw new ConflictException(`A payroll run already exists for ${dto.month} at this site`);
    }

    if (dto.fxRateId) {
      const fx = await this.prisma.exchangeRate.findUnique({ where: { id: dto.fxRateId } });
      if (!fx) {
        throw new BadRequestException('Exchange rate not found');
      }
    }

    const clientRatioSnapshot = await this.resolveClientRatio(dto.siteId, dto.month);

    const run = await this.prisma.payrollRun.create({
      data: {
        siteId: dto.siteId,
        month: dto.month,
        status: PayrollRunStatus.DRAFT,
        fxRateId: dto.fxRateId ?? null,
        clientRatioSnapshot:
          clientRatioSnapshot === null
            ? Prisma.JsonNull
            : (clientRatioSnapshot as Prisma.InputJsonValue),
        preparedByUserId: preparerId,
        createdBy: preparerId,
        updatedBy: preparerId,
      },
    });

    await this.audit.record({
      actorUserId: preparerId,
      action: 'CREATE',
      tableName: SUBJECT_TABLE,
      recordId: run.id,
      after: { siteId: run.siteId, month: run.month, status: run.status },
    });

    return run;
  }

  // -------------------------------------------------------------------------
  // Compute
  // -------------------------------------------------------------------------

  /**
   * Compute (or recompute) every pay line for a run. Idempotent: existing lines are replaced
   * so a recompute always reflects the latest timesheet + config. For each employee at the
   * site we pull their timesheet hours, build gross via GrossBuildupService using their
   * hourly rate and pay split, then compute statutory per currency from effective config.
   * Sets the run to CHECKED.
   */
  async computeRun(runId: string, actorId: string): Promise<RunWithLines> {
    const run = await this.getOrThrow(runId);
    this.assertMutable(run);

    const period = await this.prisma.timesheetPeriod.findUnique({
      where: { siteId_month: { siteId: run.siteId, month: run.month } },
      include: { entries: true },
    });
    if (
      !period ||
      (period.status !== TimesheetPeriodStatus.SITE_APPROVED &&
        period.status !== TimesheetPeriodStatus.LOCKED)
    ) {
      throw new BadRequestException(
        'Timesheet period is no longer SITE_APPROVED/LOCKED; cannot compute',
      );
    }

    const employees = await this.prisma.employee.findMany({ where: { siteId: run.siteId } });

    // Resolve statutory config once per currency, effective on the period month.
    const effectiveDate = this.periodDate(run.month);
    const config = {
      ['USD']: await this.loadStatutoryConfig('USD', effectiveDate),
      ['ZWG']: await this.loadStatutoryConfig('ZWG', effectiveDate),
    };

    const clientUsdPct = this.clientUsdPct(run.clientRatioSnapshot);
    const fxRate = await this.resolveFxRate(run, effectiveDate);
    const perEmployeeRatios = this.perEmployeeRatios(run.perEmployeeRatios);

    // Approved back-pay / acting extra earnings not yet consumed by a run, for this site's
    // employees and (when tagged) this run's month. Folded into the pay line and marked consumed.
    const extraEarnings = await this.prisma.payrollExtraEarning.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        runId: null,
        OR: [{ periodMonth: run.month }, { periodMonth: null }],
      },
    });
    const extraByEmployee = new Map<string, typeof extraEarnings>();
    for (const earning of extraEarnings) {
      const list = extraByEmployee.get(earning.employeeId) ?? [];
      list.push(earning);
      extraByEmployee.set(earning.employeeId, list);
    }

    // Sum hours per employee across all their timesheet entries in the period.
    const hoursByEmployee = new Map<
      string,
      {
        hoursNormal: number;
        hoursOt15: number;
        hoursOt20: number;
        ugShift: number;
        nightHours: number;
      }
    >();
    for (const entry of period.entries) {
      let acc = hoursByEmployee.get(entry.employeeId);
      if (!acc) {
        acc = { hoursNormal: 0, hoursOt15: 0, hoursOt20: 0, ugShift: 0, nightHours: 0 };
        hoursByEmployee.set(entry.employeeId, acc);
      }
      acc.hoursNormal += entry.hoursNormal.toNumber();
      acc.hoursOt15 += entry.hoursOt15.toNumber();
      acc.hoursOt20 += entry.hoursOt20.toNumber();
      acc.ugShift += entry.ugShift.toNumber();
      acc.nightHours += entry.nightHours.toNumber();
    }

    const lineData: Prisma.PayrollLineCreateManyInput[] = employees.map((employee) => {
      const hours = hoursByEmployee.get(employee.id) ?? {
        hoursNormal: 0,
        hoursOt15: 0,
        hoursOt20: 0,
        ugShift: 0,
        nightHours: 0,
      };
      return this.buildLine(runId, employee, hours, {
        clientUsdPct,
        perEmployeeRatios,
        config,
        fxRate,
        extras: extraByEmployee.get(employee.id) ?? [],
        actorId,
      });
    });

    // Extra-earning rows folded into this run, marked consumed so they never double-count.
    const consumedExtraIds = extraEarnings.map((e) => e.id);

    // Idempotent replace: wipe prior lines then re-create, and set CHECKED, atomically. Extra
    // earnings are stamped with this run so they are not re-applied by a later run.
    const updated = await this.prisma.rlsTx(async (tx) => {
      await tx.payrollLine.deleteMany({ where: { runId } });
      if (lineData.length > 0) {
        await tx.payrollLine.createMany({ data: lineData });
      }
      if (consumedExtraIds.length > 0) {
        await tx.payrollExtraEarning.updateMany({
          where: { id: { in: consumedExtraIds } },
          data: { runId, updatedBy: actorId },
        });
      }
      await tx.payrollRun.update({
        where: { id: runId },
        data: { status: PayrollRunStatus.CHECKED, updatedBy: actorId },
      });
      return tx.payrollRun.findUniqueOrThrow({
        where: { id: runId },
        include: { lines: true },
      });
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: runId,
      before: { status: run.status },
      after: {
        status: PayrollRunStatus.CHECKED,
        lines: lineData.length,
        event: 'payroll_computed',
      },
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Submit
  // -------------------------------------------------------------------------

  /**
   * Submit a CHECKED run to the shared approval engine for Finance-Director sign-off. The
   * engine enforces preparer != approver (self-approval is rejected). When the chain resolves
   * APPROVED the registered transition posts the employer cost to the ledger.
   */
  async submit(runId: string, preparerId: string): Promise<PayrollRun> {
    const run = await this.getOrThrow(runId);
    if (run.status !== PayrollRunStatus.CHECKED) {
      throw new BadRequestException(`Only a CHECKED run can be submitted (current: ${run.status})`);
    }
    const lineCount = await this.prisma.payrollLine.count({ where: { runId } });
    if (lineCount === 0) {
      throw new BadRequestException('Cannot submit a run with no computed lines');
    }

    const employerCost = await this.employerCost(runId);

    await this.approvals.submit({
      module: APPROVAL_MODULE,
      subjectTable: SUBJECT_TABLE,
      subjectId: runId,
      amount: employerCost.total,
      currency: 'USD',
      siteId: run.siteId,
      requesterId: preparerId,
    });

    await this.audit.record({
      actorUserId: preparerId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: runId,
      before: { status: run.status },
      after: { event: 'submitted_for_fd_approval', amount: employerCost.total },
    });

    return run;
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /** List runs, optionally filtered by site and/or month, newest first. */
  list(query: ListPayrollRunsQueryDto): Promise<PayrollRun[]> {
    return this.prisma.payrollRun.findMany({
      where: {
        ...(query.siteId ? { siteId: query.siteId } : {}),
        ...(query.month ? { month: query.month } : {}),
      },
      orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /**
   * Get one run with its lines. Bank account numbers on each line's employee are masked to
   * the last 4 digits (payroll privacy) and the read is audited.
   */
  async findOne(runId: string, actorId: string): Promise<RunView> {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { lines: { orderBy: { employeeId: 'asc' } } },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }

    const employeeIds = run.lines.map((l) => l.employeeId);
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: {
        id: true,
        worksNo: true,
        firstName: true,
        lastName: true,
        bankName: true,
        accountNo: true,
      },
    });
    const byId = new Map(employees.map((e) => [e.id, e]));

    const lines: PayrollLineView[] = run.lines.map((line) => {
      const employee = byId.get(line.employeeId);
      return {
        ...line,
        employee: employee ? { ...employee, accountNo: this.crypto.maskAccountNo(employee.accountNo) } : null,
      };
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: runId,
      after: { event: 'payroll_run_view', lines: lines.length },
    });

    return { ...run, lines };
  }

  // -------------------------------------------------------------------------
  // Outputs (read-only, audited) — bank schedule / payslips / Sage journal /
  // statutory returns. All are restricted to Finance + SysAdmin at the
  // controller; account numbers are masked and every view/export is audited.
  // -------------------------------------------------------------------------

  /**
   * Per-bank, per-currency net-pay disbursement schedule for a run. Groups each pay line by the
   * employee's bank (name) + net currency leg and sums the net pay, so Finance can cut one
   * payment instruction per bank per currency. Account numbers on each employee row are masked
   * to the last 4 digits (payroll privacy) and the read is audited.
   */
  async bankSchedule(runId: string, actorId: string): Promise<BankSchedule> {
    const { run, lines, employeeById } = await this.loadRunLines(runId);

    const groups = new Map<string, BankScheduleGroup>();
    for (const line of lines) {
      const employee = employeeById.get(line.employeeId);
      const bankName = employee?.bankName ?? null;
      for (const currency of ['USD', 'ZWG'] as const) {
        const net = currency === 'USD' ? line.netUsd.toNumber() : line.netZwg.toNumber();
        if (net <= 0) {
          continue;
        }
        const key = `${bankName ?? '(unbanked)'}::${currency}`;
        let group = groups.get(key);
        if (!group) {
          group = { bankName, currency, total: 0, count: 0, items: [] };
          groups.set(key, group);
        }
        group.items.push({
          employeeId: line.employeeId,
          worksNo: employee?.worksNo ?? null,
          firstName: employee?.firstName ?? null,
          lastName: employee?.lastName ?? null,
          bankBranch: employee?.bankBranch ?? null,
          accountNo: this.crypto.maskAccountNo(employee?.accountNo ?? null),
          amount: net,
        });
        group.total = this.round2(group.total + net);
        group.count += 1;
      }
    }

    const banks = [...groups.values()].sort(
      (a, b) =>
        (a.bankName ?? '').localeCompare(b.bankName ?? '') || a.currency.localeCompare(b.currency),
    );

    await this.auditOutput(runId, actorId, 'payroll_bank_schedule_export', {
      groups: banks.length,
    });

    return { runId: run.id, siteId: run.siteId, month: run.month, banks };
  }

  /**
   * Per-employee payslip data for a run: gross build-up, every statutory line and the net split.
   * Returned as JSON (PDF rendering is a later concern). Account numbers are masked and the read
   * is audited.
   */
  async payslips(runId: string, actorId: string): Promise<PayslipsResult> {
    const { run, lines, employeeById } = await this.loadRunLines(runId);

    const payslips: Payslip[] = lines.map((line) => {
      const employee = employeeById.get(line.employeeId);
      const netUsd = line.netUsd.toNumber();
      const netZwg = line.netZwg.toNumber();
      return {
        employeeId: line.employeeId,
        worksNo: employee?.worksNo ?? null,
        firstName: employee?.firstName ?? null,
        lastName: employee?.lastName ?? null,
        bankName: employee?.bankName ?? null,
        accountNo: this.crypto.maskAccountNo(employee?.accountNo ?? null),
        earnings: {
          basicUsd: line.basicUsd.toNumber(),
          basicZwg: line.basicZwg.toNumber(),
          cola: line.cola.toNumber(),
          ugAllowance: line.ugAllowance.toNumber(),
          nightAllowance: line.nightAllowance.toNumber(),
          otherAllowances: line.otherAllowances.toNumber(),
          extraEarnings: line.extraEarnings.toNumber(),
          gross: line.gross.toNumber(),
        },
        deductions: {
          paye: line.paye.toNumber(),
          aidsLevy: line.aidsLevy.toNumber(),
          nssaEe: line.nssaEe.toNumber(),
          necEe: line.necEe.toNumber(),
          mipfEe: line.mipfEe.toNumber(),
          nyaradzo: line.nyaradzo.toNumber(),
          otherDeductions: line.otherDeductions.toNumber(),
        },
        employerContributions: {
          nssaEr: line.nssaEr.toNumber(),
          zimdef: line.zimdef.toNumber(),
          nec: line.nec.toNumber(),
          mipf: line.mipf.toNumber(),
        },
        net: { netUsd, netZwg, total: this.round2(netUsd + netZwg) },
      };
    });

    await this.auditOutput(runId, actorId, 'payroll_payslips_export', {
      payslips: payslips.length,
    });

    return { runId: run.id, siteId: run.siteId, month: run.month, payslips };
  }

  /**
   * Sage-ready journal rows for a run: one debit to salaries expense, credits per statutory
   * liability head (PAYE + AIDS levy, NSSA ee+er, ZIMDEF, NEC, MIPF), and a credit to net pay
   * payable. Employer contributions add both a salaries-expense debit and the matching liability
   * credit so the journal balances (total debits == total credits). Returned as flat rows ready
   * for CSV export. Audited.
   */
  async sageJournal(runId: string, actorId: string): Promise<SageJournalResult> {
    const { run, lines } = await this.loadRunLines(runId);
    const totals = this.aggregate(lines);

    const rows: SageJournalRow[] = [];
    const memo = `Payroll ${run.month}`;
    const push = (account: string, description: string, debit: number, credit: number): void => {
      if (debit <= 0 && credit <= 0) {
        return;
      }
      rows.push({
        account,
        description,
        debit: this.round2(debit),
        credit: this.round2(credit),
        memo,
      });
    };

    // Salaries expense = gross (employee earnings) + employer statutory contributions.
    const employerContrib = totals.nssaEr + totals.zimdef + totals.nec + totals.mipf;
    push('SALARIES_EXPENSE', 'Gross salaries & wages', totals.gross, 0);
    push('STATUTORY_EXPENSE', 'Employer statutory contributions', employerContrib, 0);

    // Statutory liability credits (what the company owes third parties). NEC/MIPF carry both the
    // employer contribution (a company cost) and the employee contribution (a net deduction).
    push('PAYE_PAYABLE', 'PAYE & AIDS levy payable', 0, totals.paye + totals.aidsLevy);
    push('NSSA_PAYABLE', 'NSSA payable (ee + er)', 0, totals.nssaEe + totals.nssaEr);
    push('ZIMDEF_PAYABLE', 'ZIMDEF payable', 0, totals.zimdef);
    push('NEC_PAYABLE', 'NEC payable (ee + er)', 0, totals.nec + totals.necEe);
    push('MIPF_PAYABLE', 'MIPF payable (ee + er)', 0, totals.mipf + totals.mipfEe);
    push(
      'OTHER_DEDUCTIONS_PAYABLE',
      'Other deductions payable',
      0,
      totals.otherDeductions + totals.nyaradzo,
    );

    // Net pay payable to employees.
    push('NET_PAY_PAYABLE', 'Net pay payable', 0, totals.netUsd + totals.netZwg);

    const totalDebit = this.round2(rows.reduce((s, r) => s + r.debit, 0));
    const totalCredit = this.round2(rows.reduce((s, r) => s + r.credit, 0));

    await this.auditOutput(runId, actorId, 'payroll_sage_journal_export', { rows: rows.length });

    return {
      runId: run.id,
      siteId: run.siteId,
      month: run.month,
      rows,
      totalDebit,
      totalCredit,
      balanced: totalDebit === totalCredit,
    };
  }

  /**
   * Statutory-returns summary for a run: one row per statutory head (PAYE, AIDS levy, NSSA ee,
   * NSSA er, ZIMDEF, NEC, MIPF) with its total across all lines, plus the employee count. This
   * feeds the monthly remittances to ZIMRA/NSSA/NEC etc. Audited.
   */
  async statutoryReturns(runId: string, actorId: string): Promise<StatutoryReturnsResult> {
    const { run, lines } = await this.loadRunLines(runId);
    const totals = this.aggregate(lines);

    const heads: StatutoryHead[] = [
      { head: 'PAYE', label: 'Pay As You Earn', amount: totals.paye },
      { head: 'AIDS_LEVY', label: 'AIDS levy', amount: totals.aidsLevy },
      { head: 'NSSA_EE', label: 'NSSA employee contribution', amount: totals.nssaEe },
      { head: 'NSSA_ER', label: 'NSSA employer contribution', amount: totals.nssaEr },
      { head: 'ZIMDEF', label: 'ZIMDEF levy', amount: totals.zimdef },
      { head: 'NEC', label: 'NEC dues (ee + er)', amount: this.round2(totals.nec + totals.necEe) },
      {
        head: 'MIPF',
        label: 'MIPF contribution (ee + er)',
        amount: this.round2(totals.mipf + totals.mipfEe),
      },
    ];

    const grandTotal = this.round2(heads.reduce((s, h) => s + h.amount, 0));

    await this.auditOutput(runId, actorId, 'payroll_statutory_returns_export', {
      heads: heads.length,
    });

    return {
      runId: run.id,
      siteId: run.siteId,
      month: run.month,
      employees: lines.length,
      heads,
      grandTotal,
    };
  }

  /** Load a run plus its lines and the employee lookup, or 404. Shared by the output endpoints. */
  private async loadRunLines(runId: string): Promise<{
    run: PayrollRun;
    lines: PayrollLine[];
    employeeById: Map<string, Pick<Employee, EmployeeReadField>>;
  }> {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: runId },
      include: { lines: { orderBy: { employeeId: 'asc' } } },
    });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    const { lines, ...bare } = run;
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: lines.map((l) => l.employeeId) } },
      select: {
        id: true,
        worksNo: true,
        firstName: true,
        lastName: true,
        bankName: true,
        bankBranch: true,
        accountNo: true,
      },
    });
    return { run: bare, lines, employeeById: new Map(employees.map((e) => [e.id, e])) };
  }

  /** Sum every monetary head across a run's lines (as plain numbers, rounded to 2dp). */
  private aggregate(lines: PayrollLine[]): PayrollTotals {
    const totals: PayrollTotals = {
      gross: 0,
      paye: 0,
      aidsLevy: 0,
      nssaEe: 0,
      nssaEr: 0,
      zimdef: 0,
      nec: 0,
      necEe: 0,
      mipf: 0,
      mipfEe: 0,
      nyaradzo: 0,
      extraEarnings: 0,
      otherDeductions: 0,
      netUsd: 0,
      netZwg: 0,
    };
    for (const line of lines) {
      totals.gross += line.gross.toNumber();
      totals.paye += line.paye.toNumber();
      totals.aidsLevy += line.aidsLevy.toNumber();
      totals.nssaEe += line.nssaEe.toNumber();
      totals.nssaEr += line.nssaEr.toNumber();
      totals.zimdef += line.zimdef.toNumber();
      totals.nec += line.nec.toNumber();
      totals.necEe += line.necEe.toNumber();
      totals.mipf += line.mipf.toNumber();
      totals.mipfEe += line.mipfEe.toNumber();
      totals.nyaradzo += line.nyaradzo.toNumber();
      totals.extraEarnings += line.extraEarnings.toNumber();
      totals.otherDeductions += line.otherDeductions.toNumber();
      totals.netUsd += line.netUsd.toNumber();
      totals.netZwg += line.netZwg.toNumber();
    }
    for (const key of Object.keys(totals) as (keyof PayrollTotals)[]) {
      totals[key] = this.round2(totals[key]);
    }
    return totals;
  }

  /** Record an audited payroll-output view/export against the run. */
  private auditOutput(
    runId: string,
    actorId: string,
    event: string,
    detail: Record<string, unknown>,
  ): Promise<unknown> {
    return this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: runId,
      after: { event, ...detail },
    });
  }

  // -------------------------------------------------------------------------
  // Approval transition
  // -------------------------------------------------------------------------

  /**
   * Fired when the FD approval chain resolves APPROVED: flip DRAFT/CHECKED -> APPROVED, stamp
   * the approver, and post the employer cost to the salaries/overheads accounts. Idempotent —
   * a re-fire on an already-APPROVED (or later) run is a no-op and never double-posts.
   */
  private async onApproved(runId: string): Promise<void> {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) {
      return;
    }
    if (run.status !== PayrollRunStatus.CHECKED && run.status !== PayrollRunStatus.DRAFT) {
      // Already APPROVED/PAID/LOCKED — never re-post.
      return;
    }

    await this.prisma.payrollRun.update({
      where: { id: runId },
      data: { status: PayrollRunStatus.APPROVED },
    });

    await this.postToLedger(run);

    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: runId,
      before: { status: run.status },
      after: { status: PayrollRunStatus.APPROVED, event: 'payroll_approved_and_posted' },
    });
  }

  /**
   * Post the run's total employer cost (gross + employer statutory) to the best-funded
   * account per currency as a DEBIT (salaries/overheads outflow). No account in a currency
   * simply skips that leg with a warning; it never blocks the approval.
   */
  private async postToLedger(run: PayrollRun): Promise<void> {
    const cost = await this.employerCost(run.id);
    const position = await this.ledger.cashPosition();
    const now = new Date();

    for (const currency of ['USD', 'ZWG']) {
      const amount = cost.byCurrency[currency];
      if (amount <= 0) {
        continue;
      }
      const source = position.accounts
        .filter((a) => a.currency === currency)
        .sort((x, y) => y.balance - x.balance)[0];
      if (!source) {
        this.logger.warn(
          `Payroll run ${run.id} approved but no ${currency} account exists to post against`,
        );
        continue;
      }
      await this.ledger.post([
        {
          accountId: source.accountId,
          debit: amount,
          currency,
          sourceTable: SUBJECT_TABLE,
          sourceId: run.id,
          entryDate: now,
          description: `Payroll ${run.month} employer cost (${currency})`,
          createdBy: run.approvedByUserId ?? run.preparedByUserId ?? undefined,
        },
      ]);
    }
  }

  // -------------------------------------------------------------------------
  // Internals — line building
  // -------------------------------------------------------------------------

  /**
   * Build a single pay line's persisted values from hours, split and statutory config,
   * reproducing the AES paysheet computation:
   *
   * 1. Gross is built per leg — the split-native earnings (basic/OT/UG/night/USD allowances/
   *    gratuity + approved back-pay/acting extras) are split USD/ZWG by the employee ratio,
   *    then a ZWG-native COLA is added wholly to the ZWG leg.
   * 2. NSSA (ee/er) is computed on the BASIC of each leg against a per-currency ceiling; MIPF
   *    (7.5% ee + 7.5% er) and NEC (ee + er) are levied on the ZWG basic. All are effective-
   *    dated config.
   * 3. Taxable income per leg = leg gross − leg allowable deductions (NSSA + MIPF-ee + NEC-ee).
   *    PAYE is charged ONCE on the combined USD-equivalent taxable (USD bands), less tax
   *    credits, then split back per leg with a 3% AIDS levy each.
   * 4. Net per leg = leg gross − leg NSSA-ee − leg MIPF-ee/NEC-ee − leg PAYE − leg AIDS levy −
   *    voluntary deductions (Nyaradzo) on that leg.
   */
  private buildLine(
    runId: string,
    employee: Employee,
    hours: {
      hoursNormal: number;
      hoursOt15: number;
      hoursOt20: number;
      ugShift: number;
      nightHours: number;
    },
    ctx: {
      clientUsdPct: number;
      perEmployeeRatios: Record<string, number>;
      config: Record<string, StatutoryConfig>;
      fxRate: number;
      extras: Pick<
        Prisma.PayrollExtraEarningGetPayload<true>,
        'amount' | 'taxable' | 'pensionable' | 'nssaAble' | 'currency'
      >[];
      actorId: string;
    },
  ): Prisma.PayrollLineCreateManyInput {
    const { clientUsdPct, perEmployeeRatios, config, fxRate, extras, actorId } = ctx;
    const usdPct = this.splitUsdPct(employee, clientUsdPct, perEmployeeRatios);
    const hourlyRate = employee.hourlyRate ? employee.hourlyRate.toNumber() : 0;
    const usd = config['USD'];
    const zwg = config['ZWG'];

    const extraTotal = this.round2(extras.reduce((s, e) => s + e.amount.toNumber(), 0));
    // Non-taxable extras still add to gross/net but must NOT increase the PAYE base.
    const nonTaxableExtra = this.round2(
      extras.filter((e) => !e.taxable).reduce((s, e) => s + e.amount.toNumber(), 0),
    );

    const buildup = this.grossBuildup.compute({
      hoursNormal: hours.hoursNormal,
      hoursOt15: hours.hoursOt15,
      hoursOt20: hours.hoursOt20,
      ugShift: hours.ugShift,
      nightHours: hours.nightHours,
      hourlyRate,
      ugAllowanceRate: this.num(employee.ugAllowanceRate),
      nightAllowanceRate: this.num(employee.nightAllowanceRate),
      cola: this.num(employee.colaZwg),
      colaIsZwgNative: true,
      otherAllowances: this.num(employee.otherAllowancesUsd),
      gratuity: this.num(employee.gratuityUsd),
      extraEarnings: extraTotal,
      split: {
        mode: employee.payMode === 'FIXED_SPLIT' ? SplitMode.FIXED_SPLIT : SplitMode.CLIENT_RATIO,
        usdPct,
      },
    });

    // Split-native (USD-denominated) earnings — everything except the ZWG-native COLA.
    const colaZwgNative = this.num(employee.colaZwg);
    const splitNativeUsd = this.round2(buildup.gross - colaZwgNative);
    // The USD leg is paid in USD; the ZWG leg is converted to ZWG at the run FX, then the
    // ZWG-native COLA is added on top of it (matching the paysheet's gross ZWL column).
    const grossUsd = this.round2((splitNativeUsd * usdPct) / 100);
    const splitZwgLegUsd = this.round2(splitNativeUsd - grossUsd);
    const grossZwg = this.round2(splitZwgLegUsd * fxRate + colaZwgNative);
    const gross = this.round2(grossUsd + grossZwg);

    // Basic split across the two legs (basic is split-native, so it follows the ratio). The USD
    // leg carries `basicUsd`; the ZWG leg carries `basicZwgLegUsd` (USD terms) → `basicZwg` (ZWG).
    const basicUsd = this.round2((buildup.basic * usdPct) / 100);
    const basicZwgLegUsd = this.round2(buildup.basic - basicUsd);
    const basicZwg = this.round2(basicZwgLegUsd * fxRate);
    // Full ZWG-denominated basic — the base MIPF/NEC are levied on (basic converted at FX).
    const basicZwgFull = this.round2(buildup.basic * fxRate);

    // NSSA on the BASIC of each leg, each capped by its own currency ceiling. The ZWG leg base
    // uses NSSA's own USD->ZWG conversion (config), distinct from the payroll FX; it defaults to
    // the payroll FX when unset.
    const nssaZwgConv = zwg.nssaZwgConv > 0 ? zwg.nssaZwgConv : fxRate;
    const nssaUsd = this.nssa.compute({
      insurableEarnings: basicUsd,
      ceiling: usd.nssaCeiling,
      eePct: usd.nssaEePct,
      erPct: usd.nssaErPct,
    });
    const nssaZwg = this.nssa.compute({
      insurableEarnings: this.round2(basicZwgLegUsd * nssaZwgConv),
      ceiling: zwg.nssaCeiling,
      eePct: zwg.nssaEePct,
      erPct: zwg.nssaErPct,
    });
    const nssaEe = this.round2(nssaUsd.employee + nssaZwg.employee);
    const nssaEr = this.round2(nssaUsd.employer + nssaZwg.employer);

    // MIPF (mine-scheme members only) + NEC, both levied on the ZWG basic, ee + er.
    const mipf = employee.mipfMember
      ? this.employerStatutory.mipf({ gross: basicZwgFull, pct: zwg.mipfPct })
      : 0;
    const mipfEe = employee.mipfMember
      ? this.round2((basicZwgFull * zwg.mipfEePct) / 100)
      : 0;
    const nec = employee.necMember
      ? this.employerStatutory.nec({ gross: basicZwgFull, pct: zwg.necPct })
      : 0;
    const necEe = employee.necMember ? this.round2((basicZwgFull * zwg.necEePct) / 100) : 0;
    const zimdef = this.employerStatutory.zimdef({ gross, pct: zwg.zimdefPct });

    // Taxable income per leg: leg gross less the leg's allowable deductions. The USD leg carries
    // its NSSA; the ZWG leg carries its NSSA + the (ZWG-based) MIPF-ee + NEC-ee. Any non-taxable
    // extra earning (per its `taxable` flag) is stripped from the taxable base, apportioned to
    // each leg by the pay split, while still counting towards gross and net.
    const nonTaxableExtraUsd = this.round2((nonTaxableExtra * usdPct) / 100);
    const nonTaxableExtraZwg = this.round2((nonTaxableExtra - nonTaxableExtraUsd) * fxRate);
    const taxableUsd = this.round2(grossUsd - nssaUsd.employee - nonTaxableExtraUsd);
    const taxableZwg = this.round2(
      grossZwg - nssaZwg.employee - mipfEe - necEe - nonTaxableExtraZwg,
    );

    const payeSplit = this.crossCurrencyPaye.compute({
      taxableUsd,
      taxableZwg,
      fxRate,
      usdBands: usd.payeBands,
      aidsLevyPct: usd.aidsLevyPct,
    });
    const paye = this.round2(payeSplit.payeUsd + payeSplit.payeZwg);
    const aidsLevy = this.round2(payeSplit.aidsLevyUsd + payeSplit.aidsLevyZwg);

    // Voluntary Nyaradzo deduction (defaults to the ZWG leg).
    const nyaradzoAmount = this.num(employee.nyaradzoAmount);
    const nyaradzoUsd =
      nyaradzoAmount > 0 && (employee.nyaradzoCurrency ?? 'ZWG').toUpperCase() === 'USD'
        ? nyaradzoAmount
        : 0;
    const nyaradzoZwg = nyaradzoAmount - nyaradzoUsd;
    // Flat recurring other deductions per leg (e.g. May Day levy).
    const otherDeductionUsd = this.num(employee.otherDeductionUsd);
    const otherDeductionZwg = this.num(employee.otherDeductionZwg);
    const otherDeductions = this.round2(otherDeductionUsd + otherDeductionZwg);

    // Net per leg (mirrors the paysheet's salary-after-tax then voluntary/other deductions).
    const netUsd = this.round2(
      grossUsd -
        nssaUsd.employee -
        payeSplit.payeUsd -
        payeSplit.aidsLevyUsd -
        nyaradzoUsd -
        otherDeductionUsd,
    );
    const netZwg = this.round2(
      grossZwg -
        nssaZwg.employee -
        mipfEe -
        necEe -
        payeSplit.payeZwg -
        payeSplit.aidsLevyZwg -
        nyaradzoZwg -
        otherDeductionZwg,
    );

    return {
      runId,
      employeeId: employee.id,
      basicUsd,
      basicZwg,
      cola: this.num(employee.colaZwg),
      ugAllowance: buildup.underground,
      nightAllowance: buildup.night,
      otherAllowances: buildup.allowances,
      gross,
      paye,
      aidsLevy,
      nssaEe,
      nssaEr,
      zimdef,
      nec,
      necEe,
      mipf,
      mipfEe,
      nyaradzo: this.round2(nyaradzoAmount),
      extraEarnings: extraTotal,
      otherDeductions,
      netUsd,
      netZwg,
      createdBy: actorId,
      updatedBy: actorId,
    };
  }

  /** Coerce a nullable Decimal to a plain number (0 when unset). */
  private num(value: Prisma.Decimal | null | undefined): number {
    return value == null ? 0 : value.toNumber();
  }

  /**
   * The USD split percentage for an employee. A run-level per-employee ratio wins (it matches
   * the paysheet's per-person ratio); then a FIXED_SPLIT employee's fixed pct; otherwise the
   * client ratio.
   */
  private splitUsdPct(
    employee: Employee,
    clientUsdPct: number,
    perEmployeeRatios: Record<string, number>,
  ): number {
    const override = perEmployeeRatios[employee.id];
    if (typeof override === 'number' && Number.isFinite(override)) {
      return override;
    }
    if (employee.usdSplitPct != null) {
      return employee.usdSplitPct.toNumber();
    }
    if (employee.payMode === 'FIXED_SPLIT' && employee.fixedUsdPct != null) {
      return employee.fixedUsdPct.toNumber();
    }
    return clientUsdPct;
  }

  // -------------------------------------------------------------------------
  // Internals — config + client ratio
  // -------------------------------------------------------------------------

  /** Load every statutory rate needed for a currency, effective on the period date. */
  private async loadStatutoryConfig(currency: string, date: Date): Promise<StatutoryConfig> {
    const payeRow = await this.statutoryRates.valueAsOf(KEY_PAYE_BANDS, date, currency);
    const payeBands = this.parseBands(payeRow.params);

    return {
      payeBands,
      aidsLevyPct: await this.pct(KEY_AIDS_LEVY_PCT, date, currency),
      nssaEePct: await this.pct(KEY_NSSA_EE_PCT, date, currency),
      nssaErPct: await this.pct(KEY_NSSA_ER_PCT, date, currency),
      nssaCeiling: await this.pct(KEY_NSSA_CEILING, date, currency),
      nssaZwgConv: await this.pct(KEY_NSSA_ZWG_CONV, date, currency),
      zimdefPct: await this.pct(KEY_ZIMDEF_PCT, date, currency),
      necPct: await this.pct(KEY_NEC_PCT, date, currency),
      necEePct: await this.pct(KEY_NEC_EE_PCT, date, currency),
      mipfPct: await this.pct(KEY_MIPF_PCT, date, currency),
      mipfEePct: await this.pct(KEY_MIPF_EE_PCT, date, currency),
    };
  }

  /**
   * The USD/ZWG FX rate (ZWG per 1 USD) for a run: the snapshotted `fxRate`, else the linked
   * exchange-rate row's official rate, else the effective `fx_rate` statutory value, else 1
   * (an all-one-currency run needs no conversion).
   */
  private async resolveFxRate(run: PayrollRun, effectiveDate: Date): Promise<number> {
    if (run.fxRate != null) {
      return run.fxRate.toNumber();
    }
    if (run.fxRateId) {
      const fx = await this.prisma.exchangeRate.findUnique({ where: { id: run.fxRateId } });
      if (fx) {
        return fx.officialRate.toNumber();
      }
    }
    try {
      const row = await this.statutoryRates.valueAsOf(KEY_FX_RATE, effectiveDate);
      if (row.value) {
        return row.value.toNumber();
      }
    } catch {
      // No fx_rate configured — fall through to the identity rate.
    }
    return 1;
  }

  /** Parse the run's per-employee USD ratio snapshot: `{ "<employeeId>": <usdPct> }`. */
  private perEmployeeRatios(snapshot: Prisma.JsonValue | null): Record<string, number> {
    const out: Record<string, number> = {};
    if (snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)) {
      for (const [id, val] of Object.entries(snapshot as Record<string, unknown>)) {
        if (typeof val === 'number' && Number.isFinite(val)) {
          out[id] = val;
        }
      }
    }
    return out;
  }

  /** Read a scalar statutory value effective on `date`, as a plain number (0 if unset). */
  private async pct(key: string, date: Date, currency: string): Promise<number> {
    const row = await this.statutoryRates.valueAsOf(key, date, currency);
    return row.value ? row.value.toNumber() : 0;
  }

  /** Parse the JSON `params` of a paye_bands row into a typed PayeBand[]. */
  private parseBands(params: Prisma.JsonValue | null): PayeBand[] {
    if (!Array.isArray(params)) {
      return [];
    }
    const bands: PayeBand[] = [];
    for (const raw of params) {
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        continue;
      }
      const b = raw as Record<string, unknown>;
      bands.push({
        upTo: typeof b.upTo === 'number' ? b.upTo : null,
        ratePct: typeof b.ratePct === 'number' ? b.ratePct : 0,
        ...(typeof b.deduct === 'number' ? { deduct: b.deduct } : {}),
      });
    }
    return bands;
  }

  /**
   * Resolve the governing client USD/ZWG split for a site+month. Follows site -> client ->
   * active contract and uses the contract currency to infer the ratio (USD contract => 100%
   * USD leg; ZWG contract => 0% USD leg). Returns null when the site maps to no client
   * (head office etc.), in which case CLIENT_RATIO employees fall back to an all-USD split.
   */
  private async resolveClientRatio(
    siteId: string,
    month: string,
  ): Promise<{ clientId: string; contractId: string; usdPct: number; currency: string } | null> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site?.clientId) {
      return null;
    }
    const asOf = this.periodDate(month);
    const contract = await this.prisma.contract.findFirst({
      where: {
        clientId: site.clientId,
        startDate: { lte: asOf },
        endDate: { gte: asOf },
      },
      orderBy: { startDate: 'desc' },
    });
    if (!contract) {
      return null;
    }
    return {
      clientId: site.clientId,
      contractId: contract.id,
      usdPct: contract.currency === 'USD' ? 100 : 0,
      currency: contract.currency,
    };
  }

  /** The USD split pct from a snapshotted client ratio (defaults to 100% when absent). */
  private clientUsdPct(snapshot: Prisma.JsonValue | null): number {
    if (
      snapshot &&
      typeof snapshot === 'object' &&
      !Array.isArray(snapshot) &&
      typeof (snapshot as Record<string, unknown>).usdPct === 'number'
    ) {
      return (snapshot as Record<string, unknown>).usdPct as number;
    }
    return 100;
  }

  // -------------------------------------------------------------------------
  // Internals — costing helpers
  // -------------------------------------------------------------------------

  /**
   * The total employer cost of a run and its per-currency split. Employer cost = gross +
   * employer statutory contributions (nssaEr + zimdef + nec + mipf), apportioned to USD/ZWG
   * by each line's net split proportion.
   */
  private async employerCost(runId: string): Promise<{
    total: number;
    byCurrency: Record<string, number>;
  }> {
    const lines = await this.prisma.payrollLine.findMany({ where: { runId } });
    const byCurrency: Record<string, number> = { ['USD']: 0, ['ZWG']: 0 };

    for (const line of lines) {
      const gross = line.gross.toNumber();
      const employerStatutory =
        line.nssaEr.toNumber() +
        line.zimdef.toNumber() +
        line.nec.toNumber() +
        line.mipf.toNumber();
      const cost = gross + employerStatutory;
      const netUsd = line.netUsd.toNumber();
      const netZwg = line.netZwg.toNumber();
      const net = netUsd + netZwg;
      const usdShare = net > 0 ? netUsd / net : 1;
      byCurrency['USD'] += this.round2(cost * usdShare);
      byCurrency['ZWG'] += this.round2(cost * (1 - usdShare));
    }

    byCurrency['USD'] = this.round2(byCurrency['USD']);
    byCurrency['ZWG'] = this.round2(byCurrency['ZWG']);
    const total = this.round2(byCurrency['USD'] + byCurrency['ZWG']);
    return { total, byCurrency };
  }

  private async getOrThrow(runId: string): Promise<PayrollRun> {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId } });
    if (!run) {
      throw new NotFoundException('Payroll run not found');
    }
    return run;
  }

  /** DRAFT/CHECKED runs accept (re)computation; APPROVED/PAID/LOCKED are frozen. */
  private assertMutable(run: PayrollRun): void {
    if (run.status !== PayrollRunStatus.DRAFT && run.status !== PayrollRunStatus.CHECKED) {
      throw new BadRequestException(
        `Run is ${run.status}; a locked/approved run cannot be recomputed — raise a correcting run instead`,
      );
    }
  }

  /** First day of a YYYY-MM month, as the effective-as-of date for config lookups. */
  private periodDate(month: string): Date {
    return new Date(`${month}-01T00:00:00.000Z`);
  }

  /** Round a monetary amount to 2dp, avoiding -0. */
  private round2(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded === 0 ? 0 : rounded;
  }
}

/** Resolved statutory config for one currency, effective on the run month. */
interface StatutoryConfig {
  payeBands: PayeBand[];
  aidsLevyPct: number;
  nssaEePct: number;
  nssaErPct: number;
  nssaCeiling: number;
  nssaZwgConv: number;
  zimdefPct: number;
  necPct: number;
  necEePct: number;
  mipfPct: number;
  mipfEePct: number;
}

/** Employee fields selected for the output endpoints (bank details for the schedule/payslips). */
type EmployeeReadField =
  'id' | 'worksNo' | 'firstName' | 'lastName' | 'bankName' | 'bankBranch' | 'accountNo';

/** Aggregated per-head monetary totals across a run's lines. */
interface PayrollTotals {
  gross: number;
  paye: number;
  aidsLevy: number;
  nssaEe: number;
  nssaEr: number;
  zimdef: number;
  nec: number;
  necEe: number;
  mipf: number;
  mipfEe: number;
  nyaradzo: number;
  extraEarnings: number;
  otherDeductions: number;
  netUsd: number;
  netZwg: number;
}

/** One employee row within a bank-schedule group (account masked). */
export interface BankScheduleItem {
  employeeId: string;
  worksNo: string | null;
  firstName: string | null;
  lastName: string | null;
  bankBranch: string | null;
  accountNo: string | null;
  amount: number;
}

/** A per-bank, per-currency disbursement group. */
export interface BankScheduleGroup {
  bankName: string | null;
  currency: string;
  total: number;
  count: number;
  items: BankScheduleItem[];
}

/** The full bank-schedule output for a run. */
export interface BankSchedule {
  runId: string;
  siteId: string;
  month: string;
  banks: BankScheduleGroup[];
}

/** One employee's payslip data. */
export interface Payslip {
  employeeId: string;
  worksNo: string | null;
  firstName: string | null;
  lastName: string | null;
  bankName: string | null;
  accountNo: string | null;
  earnings: {
    basicUsd: number;
    basicZwg: number;
    cola: number;
    ugAllowance: number;
    nightAllowance: number;
    otherAllowances: number;
    extraEarnings: number;
    gross: number;
  };
  deductions: {
    paye: number;
    aidsLevy: number;
    nssaEe: number;
    necEe: number;
    mipfEe: number;
    nyaradzo: number;
    otherDeductions: number;
  };
  employerContributions: {
    nssaEr: number;
    zimdef: number;
    nec: number;
    mipf: number;
  };
  net: { netUsd: number; netZwg: number; total: number };
}

/** The full payslips output for a run. */
export interface PayslipsResult {
  runId: string;
  siteId: string;
  month: string;
  payslips: Payslip[];
}

/** A single Sage journal row (one leg of the double-entry). */
export interface SageJournalRow {
  account: string;
  description: string;
  debit: number;
  credit: number;
  memo: string;
}

/** The full Sage-journal output for a run (rows + balancing totals). */
export interface SageJournalResult {
  runId: string;
  siteId: string;
  month: string;
  rows: SageJournalRow[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
}

/** One statutory-head line in the returns summary. */
export interface StatutoryHead {
  head: string;
  label: string;
  amount: number;
}

/** The full statutory-returns output for a run. */
export interface StatutoryReturnsResult {
  runId: string;
  siteId: string;
  month: string;
  employees: number;
  heads: StatutoryHead[];
  grandTotal: number;
}
