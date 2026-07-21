import { Injectable, NotFoundException } from '@nestjs/common';
import { AlertSeverity } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AlertService } from '../command-centre/danger/alert.service';
import { PayrollService } from '../payroll/payroll.service';
import { PrismaService } from '../prisma/prisma.service';

const DUE_SOON_DAYS = 7;
const OVERDUE_RULE = 'compliance_overdue';
const DUE_SOON_RULE = 'compliance_due_soon';

/** Consolidate the payroll statutory heads into one remittance obligation per authority. */
const GROUPS: { head: string; label: string; parts: string[] }[] = [
  { head: 'PAYE', label: 'PAYE & AIDS levy (ZIMRA)', parts: ['PAYE', 'AIDS_LEVY'] },
  { head: 'NSSA', label: 'NSSA (employee + employer)', parts: ['NSSA_EE', 'NSSA_ER'] },
  { head: 'ZIMDEF', label: 'ZIMDEF levy', parts: ['ZIMDEF'] },
  { head: 'NEC', label: 'NEC dues', parts: ['NEC'] },
  { head: 'MIPF', label: 'MIPF contribution', parts: ['MIPF'] },
];

/**
 * Statutory compliance calendar (spec §13/§16). Obligations are generated from an approved
 * payroll run's statutory returns with a remittance due date; a scheduled sweep raises danger
 * alerts on overdue / due-soon obligations (so they surface in the Command Centre and get the
 * repeat-until-acknowledged treatment), and remittance capture records the reference.
 */
@Injectable()
export class ComplianceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly alerts: AlertService,
    private readonly payroll: PayrollService,
  ) {}

  list(filter: { status?: string } = {}) {
    return this.prisma.complianceObligation.findMany({
      where: { status: filter.status },
      orderBy: [{ dueDate: 'asc' }],
    });
  }

  /** Statutory remittance deadline: the 10th of the month following the payroll period. */
  private dueDateFor(periodMonth: string): Date {
    const [year, month] = periodMonth.split('-').map(Number);
    // month is 1-based; using it as a 0-based index lands on the *next* month.
    return new Date(Date.UTC(year, month, 10));
  }

  /** Create/refresh the remittance obligations for an approved payroll run. Idempotent. */
  async generateFromPayrollRun(runId: string, actorId: string) {
    const returns = await this.payroll.statutoryReturns(runId, actorId);
    const byHead = new Map(returns.heads.map((h) => [h.head, h.amount]));
    const dueDate = this.dueDateFor(returns.month);
    let generated = 0;

    for (const group of GROUPS) {
      const amount = group.parts.reduce((sum, p) => sum + (byHead.get(p) ?? 0), 0);
      if (amount <= 0) {
        continue;
      }
      const existing = await this.prisma.complianceObligation.findFirst({
        where: { head: group.head, periodMonth: returns.month, sourceId: runId },
      });
      if (existing) {
        await this.prisma.complianceObligation.update({
          where: { id: existing.id },
          data: { amount, label: group.label, dueDate, updatedBy: actorId },
        });
      } else {
        await this.prisma.complianceObligation.create({
          data: {
            head: group.head,
            label: group.label,
            periodMonth: returns.month,
            siteId: returns.siteId,
            amount,
            currency: 'USD',
            dueDate,
            status: 'PENDING',
            sourceTable: 'payroll_runs',
            sourceId: runId,
            createdBy: actorId,
            updatedBy: actorId,
          },
        });
        generated += 1;
      }
    }

    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'compliance_obligations',
      recordId: runId,
      after: { generated, month: returns.month, siteId: returns.siteId },
    });
    return { generated, obligations: await this.list() };
  }

  /** Record a remittance: mark REMITTED, capture the reference, clear any active alerts. */
  async remit(id: string, reference: string, actorId: string) {
    const ob = await this.prisma.complianceObligation.findUnique({ where: { id } });
    if (!ob) {
      throw new NotFoundException('Obligation not found');
    }
    const updated = await this.prisma.complianceObligation.update({
      where: { id },
      data: {
        status: 'REMITTED',
        remittanceReference: reference,
        remittedByUserId: actorId,
        remittedAt: new Date(),
        updatedBy: actorId,
      },
    });
    await this.alerts.resolve(OVERDUE_RULE, id);
    await this.alerts.resolve(DUE_SOON_RULE, id);
    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: 'compliance_obligations',
      recordId: id,
      before: { status: ob.status },
      after: { status: 'REMITTED', remittanceReference: reference },
    });
    return updated;
  }

  /**
   * Scheduled sweep: raise a DANGER alert for every overdue obligation and a WATCH alert for
   * anything due within the next week. AlertService de-dupes, so each obligation carries at
   * most one active alert; remit() resolves it.
   */
  async checkDueAndOverdue(now: Date = new Date()) {
    const pending = await this.prisma.complianceObligation.findMany({ where: { status: 'PENDING' } });
    const soonThreshold = new Date(now.getTime() + DUE_SOON_DAYS * 86_400_000);
    let overdue = 0;
    let dueSoon = 0;

    for (const ob of pending) {
      const due = ob.dueDate.toISOString().slice(0, 10);
      if (ob.dueDate < now) {
        overdue += 1;
        await this.alerts.raiseOrRefresh({
          ruleKey: OVERDUE_RULE,
          severity: AlertSeverity.DANGER,
          subjectTable: 'compliance_obligations',
          subjectId: ob.id,
          message: `${ob.label} for ${ob.periodMonth} is OVERDUE (was due ${due}; ${ob.currency} ${ob.amount})`,
          payload: { head: ob.head, amount: ob.amount.toString(), dueDate: ob.dueDate.toISOString() },
        });
      } else if (ob.dueDate <= soonThreshold) {
        dueSoon += 1;
        await this.alerts.raiseOrRefresh({
          ruleKey: DUE_SOON_RULE,
          severity: AlertSeverity.WATCH,
          subjectTable: 'compliance_obligations',
          subjectId: ob.id,
          message: `${ob.label} for ${ob.periodMonth} due soon (${due}; ${ob.currency} ${ob.amount})`,
          payload: { head: ob.head, amount: ob.amount.toString(), dueDate: ob.dueDate.toISOString() },
        });
      }
    }
    return { checked: pending.length, overdue, dueSoon };
  }
}
