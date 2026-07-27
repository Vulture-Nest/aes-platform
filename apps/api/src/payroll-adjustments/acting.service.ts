import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ActingAssignment, ActingBasis, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  ActingRegisterQueryDto,
  ComputeActingForRunDto,
  CreateActingAssignmentDto,
} from './dto/acting.dto';

const TABLE = 'acting_assignments';

export interface ActingProration {
  employeeId: string;
  month: string;
  basis: ActingBasis;
  daysInMonth: number;
  qualifyingDays: number;
  qualifies: boolean;
  fullAllowance: number;
  proratedAllowance: number;
}

@Injectable()
export class ActingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private num(value: Prisma.Decimal | number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }
    return typeof value === 'number' ? value : value.toNumber();
  }

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /** Number of calendar days in the given YYYY-MM month. */
  private daysInMonth(month: string): number {
    const [y, m] = month.split('-').map(Number);
    return new Date(Date.UTC(y, m, 0)).getUTCDate();
  }

  /** [start, end] of the calendar month in UTC. */
  private monthBounds(month: string): { start: Date; end: Date } {
    const [y, m] = month.split('-').map(Number);
    return {
      start: new Date(Date.UTC(y, m - 1, 1)),
      end: new Date(Date.UTC(y, m, 0)),
    };
  }

  /**
   * Pure pro-rata calc for one assignment within one run month. The assignment's active
   * days are the intersection of [dateFrom, dateTo] with the calendar month; the allowance
   * is pro-rated by (active days / days in month). A mid-month end pro-rates down. Falls
   * below `minQualifyingDays` -> nothing earned. FIXED uses fixedAmount; PERCENT uses
   * percent × (actingGradeBasic − ownBasic).
   */
  computeProration(
    assignment: Pick<
      ActingAssignment,
      'employeeId' | 'basis' | 'fixedAmount' | 'percent' | 'minQualifyingDays' | 'dateFrom' | 'dateTo'
    >,
    month: string,
    inputs: { ownBasic?: number; actingGradeBasic?: number } = {},
  ): ActingProration {
    const { start, end } = this.monthBounds(month);
    const daysInMonth = this.daysInMonth(month);

    const from = assignment.dateFrom > start ? assignment.dateFrom : start;
    const to = assignment.dateTo < end ? assignment.dateTo : end;

    let qualifyingDays = 0;
    if (to >= from) {
      // Inclusive day count.
      const ms = to.getTime() - from.getTime();
      qualifyingDays = Math.floor(ms / (24 * 60 * 60 * 1000)) + 1;
    }
    qualifyingDays = Math.max(0, Math.min(qualifyingDays, daysInMonth));

    const minDays = assignment.minQualifyingDays ?? 0;
    const qualifies = qualifyingDays > 0 && qualifyingDays >= minDays;

    let fullAllowance = 0;
    if (assignment.basis === ActingBasis.FIXED) {
      fullAllowance = this.num(assignment.fixedAmount) ?? 0;
    } else {
      const percent = this.num(assignment.percent) ?? 0;
      const own = inputs.ownBasic ?? 0;
      const actingBasic = inputs.actingGradeBasic ?? 0;
      const differential = Math.max(0, actingBasic - own);
      fullAllowance = (percent / 100) * differential;
    }

    const proratedAllowance = qualifies
      ? this.round2(fullAllowance * (qualifyingDays / daysInMonth))
      : 0;

    return {
      employeeId: assignment.employeeId,
      month,
      basis: assignment.basis,
      daysInMonth,
      qualifyingDays,
      qualifies,
      fullAllowance: this.round2(fullAllowance),
      proratedAllowance,
    };
  }

  async findOne(id: string) {
    const assignment = await this.prisma.actingAssignment.findUnique({ where: { id } });
    if (!assignment) {
      throw new NotFoundException('Acting assignment not found');
    }
    return assignment;
  }

  /** Create a DRAFT acting assignment. Rejects overlapping assignments for the same employee. */
  async create(dto: CreateActingAssignmentDto, actorId: string) {
    if (dto.dateTo < dto.dateFrom) {
      throw new BadRequestException('dateTo must be on or after dateFrom');
    }
    if (dto.basis === ActingBasis.FIXED && dto.fixedAmount == null) {
      throw new BadRequestException('fixedAmount is required for FIXED basis');
    }
    if (dto.basis === ActingBasis.PERCENT && dto.percent == null) {
      throw new BadRequestException('percent is required for PERCENT basis');
    }

    await this.assertNoOverlap(dto.employeeId, dto.dateFrom, dto.dateTo);

    const assignment = await this.prisma.actingAssignment.create({
      data: {
        entityId: dto.entityId ?? null,
        employeeId: dto.employeeId,
        actingPosition: dto.actingPosition,
        actingGrade: dto.actingGrade ?? null,
        dateFrom: dto.dateFrom,
        dateTo: dto.dateTo,
        basis: dto.basis,
        fixedAmount: dto.fixedAmount ?? null,
        currency: dto.currency ?? null,
        percent: dto.percent ?? null,
        minQualifyingDays: dto.minQualifyingDays ?? null,
        status: 'DRAFT',
        createdBy: actorId,
        updatedBy: actorId,
      },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: TABLE,
      recordId: assignment.id,
      after: {
        employeeId: assignment.employeeId,
        actingPosition: assignment.actingPosition,
        basis: assignment.basis,
        status: assignment.status,
      },
    });

    return assignment;
  }

  /**
   * Reject a new/updated assignment that overlaps an existing active one for the same
   * employee. Two ranges overlap when existing.dateFrom <= new.dateTo AND
   * existing.dateTo >= new.dateFrom. Cancelled/rejected assignments are ignored.
   */
  private async assertNoOverlap(
    employeeId: string,
    dateFrom: Date,
    dateTo: Date,
    excludeId?: string,
  ) {
    const clash = await this.prisma.actingAssignment.findFirst({
      where: {
        employeeId,
        status: { notIn: ['CANCELLED', 'REJECTED'] },
        dateFrom: { lte: dateTo },
        dateTo: { gte: dateFrom },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
    if (clash) {
      throw new BadRequestException(
        `Overlapping acting assignment exists for this employee (${clash.id})`,
      );
    }
  }

  async submit(id: string, actorId: string) {
    const assignment = await this.findOne(id);
    if (assignment.status !== 'DRAFT') {
      throw new BadRequestException(
        `Only a DRAFT assignment can be submitted (current: ${assignment.status})`,
      );
    }
    return this.transition(assignment, 'SUBMITTED', actorId, 'STATUS_CHANGE');
  }

  async approve(id: string, actorId: string, approvalRef?: string) {
    const assignment = await this.findOne(id);
    if (assignment.status !== 'SUBMITTED') {
      throw new BadRequestException(
        `Only a SUBMITTED assignment can be approved (current: ${assignment.status})`,
      );
    }
    const updated = await this.prisma.actingAssignment.update({
      where: { id },
      data: { status: 'APPROVED', approvalRef: approvalRef ?? null, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'APPROVE',
      tableName: TABLE,
      recordId: id,
      before: { status: assignment.status },
      after: { status: 'APPROVED' },
    });
    return updated;
  }

  private async transition(
    assignment: ActingAssignment,
    status: string,
    actorId: string,
    action: 'STATUS_CHANGE',
  ) {
    const updated = await this.prisma.actingAssignment.update({
      where: { id: assignment.id },
      data: { status, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action,
      tableName: TABLE,
      recordId: assignment.id,
      before: { status: assignment.status },
      after: { status },
    });
    return updated;
  }

  /**
   * Compute the acting allowance for an APPROVED assignment for a specific run month and
   * emit a PayrollExtraEarning (kind ACTING_ALLOWANCE), pro-rated by active days and gated
   * by minQualifyingDays. Returns the proration workings plus the created earning (or null
   * when nothing is earned). Grade basics for PERCENT basis are resolved configurably from
   * the DTO, else from the employee record.
   */
  async computeActingForRun(dto: ComputeActingForRunDto, actorId: string) {
    const { start, end } = this.monthBounds(dto.month);
    const assignment = await this.prisma.actingAssignment.findFirst({
      where: {
        employeeId: dto.employeeId,
        status: 'APPROVED',
        dateFrom: { lte: end },
        dateTo: { gte: start },
      },
      orderBy: { dateFrom: 'asc' },
    });
    if (!assignment) {
      throw new NotFoundException('No approved acting assignment for this employee in that month');
    }

    let ownBasic = dto.ownBasic;
    let actingGradeBasic = dto.actingGradeBasic;
    if (assignment.basis === ActingBasis.PERCENT && (ownBasic == null || actingGradeBasic == null)) {
      // Fall back to the employee record's hourly rate annualised where a basic is absent.
      const employee = await this.prisma.employee.findUnique({ where: { id: dto.employeeId } });
      const hourly = this.num(employee?.hourlyRate ?? null);
      if (ownBasic == null && hourly != null) {
        ownBasic = hourly * 200;
      }
    }

    const proration = this.computeProration(assignment, dto.month, {
      ownBasic,
      actingGradeBasic,
    });

    if (!proration.qualifies || proration.proratedAllowance <= 0) {
      return { proration, extraEarning: null };
    }

    const earning = await this.prisma.payrollExtraEarning.create({
      data: {
        entityId: assignment.entityId,
        runId: dto.runId ?? null,
        employeeId: dto.employeeId,
        kind: 'ACTING_ALLOWANCE',
        label: `Acting allowance ${assignment.actingPosition} ${dto.month}`,
        amount: new Prisma.Decimal(proration.proratedAllowance),
        currency: assignment.currency ?? 'USD',
        periodMonth: dto.month,
        taxable: dto.taxable ?? true,
        pensionable: dto.pensionable ?? false,
        nssaAble: dto.nssaAble ?? false,
        sourceTable: TABLE,
        sourceId: assignment.id,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'payroll_extra_earnings',
      recordId: earning.id,
      after: {
        kind: earning.kind,
        employeeId: earning.employeeId,
        amount: earning.amount.toString(),
        sourceId: assignment.id,
      },
    });

    return { proration, extraEarning: earning };
  }

  /** Acting register: who acted, in what, for how long and the accrued cost, over a window. */
  async register(query: ActingRegisterQueryDto) {
    const where: Prisma.ActingAssignmentWhereInput = {};
    if (query.employeeId) {
      where.employeeId = query.employeeId;
    }
    if (query.from) {
      where.dateTo = { gte: query.from };
    }
    if (query.to) {
      where.dateFrom = { lte: query.to };
    }
    const assignments = await this.prisma.actingAssignment.findMany({
      where,
      orderBy: [{ employeeId: 'asc' }, { dateFrom: 'asc' }],
    });

    return assignments.map((a) => {
      const days =
        Math.floor((a.dateTo.getTime() - a.dateFrom.getTime()) / (24 * 60 * 60 * 1000)) + 1;
      return {
        id: a.id,
        employeeId: a.employeeId,
        actingPosition: a.actingPosition,
        actingGrade: a.actingGrade,
        basis: a.basis,
        dateFrom: a.dateFrom,
        dateTo: a.dateTo,
        days,
        status: a.status,
        fixedAmount: this.num(a.fixedAmount),
        percent: this.num(a.percent),
        currency: a.currency,
      };
    });
  }
}
