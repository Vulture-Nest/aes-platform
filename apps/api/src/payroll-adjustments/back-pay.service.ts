import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BackPayBatch, Employee, PayrollLine, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBackPayBatchDto, NewRateDto } from './dto/back-pay.dto';

const TABLE = 'back_pay_batches';

/** Standard monthly working hours used to annualise an hourly rate into a monthly basic. */
const STANDARD_MONTHLY_HOURS = 200;

export interface BackPayLineWorking {
  employeeId: string;
  periodMonth: string;
  payMode: string;
  matchedBy: 'grade' | 'necClass' | null;
  oldHourly: number | null;
  newHourly: number | null;
  oldBasic: number | null;
  newBasic: number | null;
  hoursPaid: number | null;
  oldAmount: number;
  newAmount: number;
  difference: number;
}

@Injectable()
export class BackPayService {
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

  /**
   * Resolve the applicable new rate for an employee. Grade match wins over NEC-class match.
   * Pure — exposed for unit testing.
   */
  matchRate(
    employee: Pick<Employee, 'grade' | 'necClass'>,
    newRates: NewRateDto[],
  ): { rate: NewRateDto; matchedBy: 'grade' | 'necClass' } | null {
    const byGrade = employee.grade
      ? newRates.find((r) => r.grade && r.grade === employee.grade)
      : undefined;
    if (byGrade) {
      return { rate: byGrade, matchedBy: 'grade' };
    }
    const byClass = employee.necClass
      ? newRates.find((r) => r.necClass && r.necClass === employee.necClass)
      : undefined;
    if (byClass) {
      return { rate: byClass, matchedBy: 'necClass' };
    }
    return null;
  }

  /**
   * Recompute a single employee×period back-pay line. Historical (locked) runs are NEVER
   * mutated — we read the actually-paid amounts off the existing PayrollLine and compare to
   * what those same inputs (hours for hourly-paid, one month for fixed) yield at the NEW rate.
   * Pure calculation; no I/O. Returns null when no new rate applies to the employee.
   */
  computeLine(
    employee: Pick<Employee, 'id' | 'grade' | 'necClass' | 'payMode' | 'hourlyRate'>,
    periodMonth: string,
    newRates: NewRateDto[],
    paidLine: Pick<PayrollLine, 'basicUsd' | 'basicZwg'> | null,
  ): BackPayLineWorking | null {
    const matched = this.matchRate(employee, newRates);
    if (!matched) {
      return null;
    }
    const { rate, matchedBy } = matched;

    const oldHourly = this.num(employee.hourlyRate);
    const paidBasic =
      (this.num(paidLine?.basicUsd ?? null) ?? 0) + (this.num(paidLine?.basicZwg ?? null) ?? 0);

    let oldAmount: number;
    let newAmount: number;
    let hoursPaid: number | null = null;
    let newHourly: number | null = null;
    let oldBasic: number | null = null;
    let newBasic: number | null = null;

    const isHourly = (employee.payMode ?? '').toUpperCase().includes('HOURLY');

    if (isHourly && rate.hourly != null && oldHourly && oldHourly > 0 && paidBasic > 0) {
      // Reverse the paid basic back into hours actually paid, then re-price at the new hourly.
      hoursPaid = paidBasic / oldHourly;
      newHourly = rate.hourly;
      oldAmount = paidBasic;
      newAmount = hoursPaid * newHourly;
    } else if (rate.basic != null) {
      // Fixed-basic employee (or no usable hours): compare paid basic to the new monthly basic.
      oldBasic = paidBasic > 0 ? paidBasic : this.hourlyToBasic(oldHourly);
      newBasic = rate.basic;
      oldAmount = oldBasic ?? 0;
      newAmount = newBasic;
    } else if (rate.hourly != null && oldHourly && oldHourly > 0) {
      // Hourly rate change but no paid line to derive hours: fall back to standard hours.
      hoursPaid = STANDARD_MONTHLY_HOURS;
      newHourly = rate.hourly;
      oldAmount = paidBasic > 0 ? paidBasic : oldHourly * STANDARD_MONTHLY_HOURS;
      newAmount = rate.hourly * STANDARD_MONTHLY_HOURS;
    } else {
      return null;
    }

    // Basic difference, then the knock-on components the spec requires: a basic uplift also
    // uplifts overtime (paid on the basic rate) and any %-of-basic allowances. These ride on the
    // basic difference so back-pay is never basic-only. Defaults to 0 => pure basic difference.
    const basicDifference = newAmount - oldAmount;
    const otPct = rate.otPremiumPctOfBasic ?? 0;
    const allowancePct = rate.allowancePctOfBasic ?? 0;
    const knockOn = (basicDifference * (otPct + allowancePct)) / 100;
    const difference = this.round2(basicDifference + knockOn);
    return {
      employeeId: employee.id,
      periodMonth,
      payMode: employee.payMode,
      matchedBy,
      oldHourly,
      newHourly,
      oldBasic,
      newBasic,
      hoursPaid: hoursPaid == null ? null : this.round2(hoursPaid),
      oldAmount: this.round2(oldAmount),
      newAmount: this.round2(newAmount + knockOn),
      difference,
    };
  }

  private hourlyToBasic(hourly: number | null): number | null {
    return hourly == null ? null : hourly * STANDARD_MONTHLY_HOURS;
  }

  private round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  /** Create a DRAFT batch and materialise one BackPayLine per affected employee×period. */
  async createBatch(dto: CreateBackPayBatchDto, actorId: string) {
    const taxable = dto.taxable ?? true;
    const pensionable = dto.pensionable ?? false;
    const nssaAble = dto.nssaAble ?? false;

    const employees = await this.prisma.employee.findMany({
      where: dto.entityId ? { entityId: dto.entityId } : {},
    });

    const paidLines = await this.prisma.payrollLine.findMany({
      where: {
        employeeId: { in: employees.map((e) => e.id) },
        run: { month: { in: dto.affectedPeriods } },
      },
      include: { run: { select: { month: true } } },
    });
    // Index paid lines by employeeId|month.
    const paidByKey = new Map<string, PayrollLine>();
    for (const line of paidLines as (PayrollLine & { run: { month: string } })[]) {
      paidByKey.set(`${line.employeeId}|${line.run.month}`, line);
    }

    const lineCreates: Prisma.BackPayLineCreateWithoutBatchInput[] = [];
    for (const employee of employees) {
      for (const period of dto.affectedPeriods) {
        const paid = paidByKey.get(`${employee.id}|${period}`) ?? null;
        const working = this.computeLine(employee, period, dto.newRates, paid);
        if (!working || working.difference === 0) {
          continue;
        }
        lineCreates.push({
          employeeId: employee.id,
          periodMonth: period,
          oldAmount: new Prisma.Decimal(working.oldAmount),
          newAmount: new Prisma.Decimal(working.newAmount),
          difference: new Prisma.Decimal(working.difference),
          taxable,
          pensionable,
          nssaAble,
          workings: working as unknown as Prisma.InputJsonValue,
          createdBy: actorId,
          updatedBy: actorId,
        });
      }
    }

    const batch = await this.prisma.backPayBatch.create({
      data: {
        entityId: dto.entityId ?? null,
        name: dto.name,
        rateEffectiveFrom: dto.rateEffectiveFrom,
        gazettedAt: dto.gazettedAt ?? null,
        currency: dto.currency ?? 'USD',
        status: 'DRAFT',
        createdBy: actorId,
        updatedBy: actorId,
        lines: { create: lineCreates },
      },
      include: { lines: true },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: TABLE,
      recordId: batch.id,
      after: {
        name: batch.name,
        status: batch.status,
        affectedPeriods: dto.affectedPeriods,
        lines: batch.lines.length,
      },
    });

    return batch;
  }

  async findOne(id: string) {
    const batch = await this.prisma.backPayBatch.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!batch) {
      throw new NotFoundException('Back-pay batch not found');
    }
    return batch;
  }

  async submit(id: string, actorId: string) {
    const batch = await this.findOne(id);
    if (batch.status !== 'DRAFT') {
      throw new BadRequestException(`Only a DRAFT batch can be submitted (current: ${batch.status})`);
    }
    return this.transition(batch, 'SUBMITTED', actorId);
  }

  /**
   * Approve a submitted batch (FINANCE_DIRECTOR only — enforced at the controller). On approve
   * we emit ONE PayrollExtraEarning per employee (kind BACK_PAY) summing that employee's line
   * differences, so the next payroll run picks it up. Flags come from the underlying lines.
   */
  async approve(id: string, actorId: string, approvalRef?: string) {
    const batch = await this.findOne(id);
    if (batch.status !== 'SUBMITTED') {
      throw new BadRequestException(`Only a SUBMITTED batch can be approved (current: ${batch.status})`);
    }

    // Group lines by employee.
    const byEmployee = new Map<string, typeof batch.lines>();
    for (const line of batch.lines) {
      const list = byEmployee.get(line.employeeId) ?? [];
      list.push(line);
      byEmployee.set(line.employeeId, list);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const earnings = [];
      for (const [employeeId, lines] of byEmployee) {
        const total = lines.reduce((sum, l) => sum.plus(l.difference), new Prisma.Decimal(0));
        if (total.isZero()) {
          continue;
        }
        const periods = [...new Set(lines.map((l) => l.periodMonth))].sort();
        // Flags: taxable if ANY line taxable; pensionable/nssaAble if ANY line has them.
        const taxable = lines.some((l) => l.taxable);
        const pensionable = lines.some((l) => l.pensionable);
        const nssaAble = lines.some((l) => l.nssaAble);
        const earning = await tx.payrollExtraEarning.create({
          data: {
            entityId: batch.entityId,
            employeeId,
            kind: 'BACK_PAY',
            label: `NEC back-pay ${periods.join(', ')}`,
            amount: total,
            currency: batch.currency,
            taxable,
            pensionable,
            nssaAble,
            sourceTable: TABLE,
            sourceId: batch.id,
            createdBy: actorId,
            updatedBy: actorId,
          },
        });
        earnings.push(earning);
      }
      const updated = await tx.backPayBatch.update({
        where: { id: batch.id },
        data: { status: 'APPROVED', approvalRef: approvalRef ?? null, updatedBy: actorId },
        include: { lines: true },
      });
      return { updated, earnings };
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'APPROVE',
      tableName: TABLE,
      recordId: batch.id,
      before: { status: batch.status },
      after: { status: 'APPROVED', extraEarnings: result.earnings.length },
    });

    return { batch: result.updated, extraEarnings: result.earnings };
  }

  private async transition(batch: BackPayBatch, status: string, actorId: string) {
    const updated = await this.prisma.backPayBatch.update({
      where: { id: batch.id },
      data: { status, updatedBy: actorId },
      include: { lines: true },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: TABLE,
      recordId: batch.id,
      before: { status: batch.status },
      after: { status },
    });
    return updated;
  }

  list(entityId?: string) {
    return this.prisma.backPayBatch.findMany({
      where: entityId ? { entityId } : {},
      orderBy: { createdAt: 'desc' },
    });
  }
}
