import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApprovalStatus,
  Prisma,
  TimesheetEntry,
  TimesheetPeriod,
  TimesheetPeriodStatus,
} from '@prisma/client';
import { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ApprovalService } from '../approvals/approval.service';
import { StatusTransitionRegistry } from '../approvals/status-transition.registry';
import {
  CreateTimesheetPeriodDto,
  ReopenRequestDto,
  TimesheetEntryRowDto,
  UpsertEntriesDto,
} from './dto/timesheet.dto';
import { detectAnomaly, num, validateRows } from './timesheet-validation';

const SUBJECT_TABLE = 'timesheet_periods';

/** A period with its entries eagerly loaded (the grid view). */
export type PeriodWithEntries = TimesheetPeriod & { entries: TimesheetEntry[] };

/** Per-employee, per-category man-hour totals for the export feed. */
export interface ManhoursRow {
  employeeId: string;
  worksNo: string;
  employeeName: string;
  hoursNormal: number;
  hoursOt15: number;
  hoursOt20: number;
  ugShift: number;
  nightHours: number;
  totalHours: number;
}

@Injectable()
export class TimesheetsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly approvals: ApprovalService,
    private readonly transitions: StatusTransitionRegistry,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * When the Site-Manager approval chain for a period resolves APPROVED, flip the period to
   * SITE_APPROVED. REJECTED/RETURNED leave it OPEN so the site can correct and resubmit.
   */
  onModuleInit(): void {
    this.transitions.registerTransition(SUBJECT_TABLE, async (subjectId, status) => {
      if (status === ApprovalStatus.APPROVED) {
        await this.markSiteApproved(subjectId);
      }
    });
  }

  private get maxHoursPerDay(): number {
    return this.config.get('timesheets', { infer: true }).maxHoursPerDay;
  }

  // -------------------------------------------------------------------------
  // Period lifecycle
  // -------------------------------------------------------------------------

  /** List periods, most recent month first, optionally filtered by site and/or month. */
  list(filter: { siteId?: string; month?: string } = {}): Promise<TimesheetPeriod[]> {
    return this.prisma.timesheetPeriod.findMany({
      where: {
        siteId: filter.siteId,
        month: filter.month,
      },
      orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createPeriod(dto: CreateTimesheetPeriodDto, actorId: string): Promise<TimesheetPeriod> {
    const site = await this.prisma.site.findUnique({ where: { id: dto.siteId } });
    if (!site) {
      throw new BadRequestException('Site not found');
    }
    const existing = await this.prisma.timesheetPeriod.findUnique({
      where: { siteId_month: { siteId: dto.siteId, month: dto.month } },
    });
    if (existing) {
      throw new ConflictException(
        `A timesheet period already exists for ${dto.month} at this site`,
      );
    }

    const period = await this.prisma.timesheetPeriod.create({
      data: {
        siteId: dto.siteId,
        month: dto.month,
        status: TimesheetPeriodStatus.OPEN,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: SUBJECT_TABLE,
      recordId: period.id,
      after: { siteId: period.siteId, month: period.month, status: period.status },
    });
    return period;
  }

  /** Get the full grid (period + all entries), ordered by employee then date. */
  async getGrid(id: string): Promise<PeriodWithEntries> {
    const period = await this.prisma.timesheetPeriod.findUnique({
      where: { id },
      include: { entries: { orderBy: [{ employeeId: 'asc' }, { date: 'asc' }] } },
    });
    if (!period) {
      throw new NotFoundException('Timesheet period not found');
    }
    return period;
  }

  // -------------------------------------------------------------------------
  // Bulk grid upsert
  // -------------------------------------------------------------------------

  /**
   * Upsert a batch of employee-day rows into an OPEN period. Locked / site-approved periods
   * reject edits. Each row is validated (max hours/day, category exclusivity) before any
   * write; the whole batch is rejected if any row is invalid.
   */
  async upsertEntries(
    id: string,
    dto: UpsertEntriesDto,
    actorId: string,
  ): Promise<{ upserted: number; anomalies: number }> {
    const period = await this.getOrThrow(id);
    this.assertEditable(period);

    const errors = validateRows(dto.rows, this.maxHoursPerDay);
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Timesheet rows failed validation', errors });
    }

    // Every referenced employee must exist and belong to this period's site.
    const employeeIds = [...new Set(dto.rows.map((r) => r.employeeId))];
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      select: { id: true, siteId: true },
    });
    const byId = new Map(employees.map((e) => [e.id, e]));
    for (const employeeId of employeeIds) {
      const employee = byId.get(employeeId);
      if (!employee) {
        throw new BadRequestException(`Employee ${employeeId} not found`);
      }
      if (employee.siteId !== period.siteId) {
        throw new BadRequestException(`Employee ${employeeId} is not assigned to this site`);
      }
    }

    let anomalies = 0;
    const rows = dto.rows.map((row) => {
      const data = this.rowToData(row);
      if (data.anomalyFlag) {
        anomalies += 1;
      }
      return { row, data };
    });
    await this.prisma.rlsTx(async (tx) => {
      for (const { row, data } of rows) {
        await tx.timesheetEntry.upsert({
          where: {
            periodId_employeeId_date: { periodId: id, employeeId: row.employeeId, date: row.date },
          },
          create: {
            periodId: id,
            employeeId: row.employeeId,
            date: row.date,
            ...data,
            createdBy: actorId,
            updatedBy: actorId,
          },
          update: { ...data, updatedBy: actorId },
        });
      }
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'timesheet_entries',
      recordId: id,
      after: { periodId: id, upserted: dto.rows.length, anomalies },
    });

    return { upserted: dto.rows.length, anomalies };
  }

  // -------------------------------------------------------------------------
  // Submit / lock / reopen
  // -------------------------------------------------------------------------

  /** Hand an OPEN period to the approval engine for Site-Manager sign-off. */
  async submit(id: string, requesterId: string): Promise<TimesheetPeriod> {
    const period = await this.getOrThrow(id);
    if (period.status !== TimesheetPeriodStatus.OPEN) {
      throw new BadRequestException(`Period cannot be submitted from status ${period.status}`);
    }
    const count = await this.prisma.timesheetEntry.count({ where: { periodId: id } });
    if (count === 0) {
      throw new BadRequestException('Cannot submit a period with no entries');
    }

    await this.approvals.submit({
      module: 'timesheet_period',
      subjectTable: SUBJECT_TABLE,
      subjectId: id,
      siteId: period.siteId,
      requesterId,
    });

    await this.audit.record({
      actorUserId: requesterId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: period.status },
      after: { event: 'submitted_for_site_approval' },
    });

    return period;
  }

  /**
   * Lock a SITE_APPROVED period, freezing it for payroll. Once LOCKED, entries are immutable
   * and only a (audited) reopen request can revert it.
   */
  async lock(id: string, actorId: string): Promise<TimesheetPeriod> {
    const period = await this.getOrThrow(id);
    if (period.status !== TimesheetPeriodStatus.SITE_APPROVED) {
      throw new BadRequestException(
        `Only a SITE_APPROVED period can be locked (current: ${period.status})`,
      );
    }
    const updated = await this.prisma.timesheetPeriod.update({
      where: { id },
      data: {
        status: TimesheetPeriodStatus.LOCKED,
        lockedAt: new Date(),
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: period.status },
      after: { status: TimesheetPeriodStatus.LOCKED },
    });
    return updated;
  }

  /**
   * Record a reopen request against a LOCKED (or SITE_APPROVED) period. This does NOT
   * auto-unlock; it captures an audited request for a supervisor to action out-of-band.
   */
  async requestReopen(
    id: string,
    dto: ReopenRequestDto,
    actorId: string,
  ): Promise<{ id: string; status: TimesheetPeriodStatus }> {
    const period = await this.getOrThrow(id);
    if (period.status === TimesheetPeriodStatus.OPEN) {
      throw new BadRequestException('Period is already OPEN');
    }
    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: period.status },
      after: { event: 'reopen_requested', reason: dto.reason },
    });
    return { id: period.id, status: period.status };
  }

  // -------------------------------------------------------------------------
  // Manhours export feed
  // -------------------------------------------------------------------------

  /**
   * Per-employee man-hour totals per category for a period. XLSX rendering is a later
   * concern — this returns the raw data payload only.
   */
  async manhours(id: string): Promise<{
    periodId: string;
    siteId: string;
    month: string;
    status: TimesheetPeriodStatus;
    rows: ManhoursRow[];
  }> {
    const period = await this.getOrThrow(id);
    const entries = await this.prisma.timesheetEntry.findMany({
      where: { periodId: id },
      include: { employee: { select: { worksNo: true, firstName: true, lastName: true } } },
    });

    const byEmployee = new Map<string, ManhoursRow>();
    for (const entry of entries) {
      let row = byEmployee.get(entry.employeeId);
      if (!row) {
        row = {
          employeeId: entry.employeeId,
          worksNo: entry.employee.worksNo,
          employeeName: `${entry.employee.firstName} ${entry.employee.lastName}`,
          hoursNormal: 0,
          hoursOt15: 0,
          hoursOt20: 0,
          ugShift: 0,
          nightHours: 0,
          totalHours: 0,
        };
        byEmployee.set(entry.employeeId, row);
      }
      row.hoursNormal += entry.hoursNormal.toNumber();
      row.hoursOt15 += entry.hoursOt15.toNumber();
      row.hoursOt20 += entry.hoursOt20.toNumber();
      row.ugShift += entry.ugShift.toNumber();
      row.nightHours += entry.nightHours.toNumber();
    }
    for (const row of byEmployee.values()) {
      row.totalHours =
        row.hoursNormal + row.hoursOt15 + row.hoursOt20 + row.ugShift + row.nightHours;
    }

    const rows = [...byEmployee.values()].sort((a, b) => a.worksNo.localeCompare(b.worksNo));

    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      after: { event: 'manhours_export', employees: rows.length },
    });

    return {
      periodId: period.id,
      siteId: period.siteId,
      month: period.month,
      status: period.status,
      rows,
    };
  }

  /**
   * Payroll-facing read guard: a period is only consumable once it is SITE_APPROVED or
   * LOCKED. Returns the period or throws so payroll can't read OPEN (in-flight) data.
   */
  async getForPayroll(id: string): Promise<PeriodWithEntries> {
    const period = await this.getGrid(id);
    if (
      period.status !== TimesheetPeriodStatus.SITE_APPROVED &&
      period.status !== TimesheetPeriodStatus.LOCKED
    ) {
      throw new BadRequestException(
        'Payroll can only read SITE_APPROVED or LOCKED timesheet periods',
      );
    }
    return period;
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async getOrThrow(id: string): Promise<TimesheetPeriod> {
    const period = await this.prisma.timesheetPeriod.findUnique({ where: { id } });
    if (!period) {
      throw new NotFoundException('Timesheet period not found');
    }
    return period;
  }

  /** Only OPEN periods accept entry edits; SITE_APPROVED/LOCKED are frozen. */
  private assertEditable(period: TimesheetPeriod): void {
    if (period.status !== TimesheetPeriodStatus.OPEN) {
      throw new ForbiddenException(
        `Timesheet period is ${period.status}; entries can only be edited while OPEN`,
      );
    }
  }

  /** Fired by the transition registry when the approval chain resolves APPROVED. */
  private async markSiteApproved(id: string): Promise<void> {
    const period = await this.prisma.timesheetPeriod.findUnique({ where: { id } });
    if (!period || period.status !== TimesheetPeriodStatus.OPEN) {
      return;
    }
    await this.prisma.timesheetPeriod.update({
      where: { id },
      data: { status: TimesheetPeriodStatus.SITE_APPROVED },
    });
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: period.status },
      after: { status: TimesheetPeriodStatus.SITE_APPROVED },
    });
  }

  /** Map a validated grid row to the persisted entry fields (+ anomaly flag). */
  private rowToData(row: TimesheetEntryRowDto): {
    hoursNormal: Prisma.Decimal;
    hoursOt15: Prisma.Decimal;
    hoursOt20: Prisma.Decimal;
    ugShift: Prisma.Decimal;
    nightHours: Prisma.Decimal;
    remarks: string | null;
    anomalyFlag: boolean;
  } {
    const dec = (v: number | undefined) => new Prisma.Decimal(num(v));
    return {
      hoursNormal: dec(row.hoursNormal),
      hoursOt15: dec(row.hoursOt15),
      hoursOt20: dec(row.hoursOt20),
      ugShift: dec(row.ugShift),
      nightHours: dec(row.nightHours),
      remarks: row.remarks ?? null,
      anomalyFlag: detectAnomaly(row, this.maxHoursPerDay),
    };
  }
}
