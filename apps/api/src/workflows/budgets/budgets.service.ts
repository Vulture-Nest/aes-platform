import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { ApprovalStatus, Budget, BudgetLine, NotificationSeverity, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notifications/notification.service';
import { ApprovalService } from '../../approvals/approval.service';
import { StatusTransitionRegistry } from '../../approvals/status-transition.registry';
import { ThresholdsService } from '../../reference/thresholds/thresholds.service';
import { CreateBudgetDto, ReviseBudgetDto } from './dto/budget.dto';

/** Lifecycle statuses for a budget subject (spec §10). Query-only, so a local TS enum. */
export enum BudgetStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  APPROVED = 'APPROVED',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
  RETURNED = 'RETURNED',
  SUPERSEDED = 'SUPERSEDED',
}

/** Threshold keys for the two utilisation trip-wires (defaults applied when unconfigured). */
const WARN_THRESHOLD_KEY = 'budget_warn_fraction';
const ALERT_THRESHOLD_KEY = 'budget_alert_fraction';
const DEFAULT_WARN_FRACTION = 0.85;
const DEFAULT_ALERT_FRACTION = 1.0;

const APPROVAL_MODULE = 'budget';
const SUBJECT_TABLE = 'budgets';

/** Per-category actual-vs-budget breakdown returned by {@link BudgetsService.computeActuals}. */
export interface BudgetLineActual {
  category: string;
  budgeted: number;
  actual: number;
  utilisation: number; // actual / budgeted (0 when budgeted is 0)
  state: 'OK' | 'WARN' | 'ALERT';
}

export interface BudgetActuals {
  budgetId: string;
  currency: string;
  warnFraction: number;
  alertFraction: number;
  lines: BudgetLineActual[];
  totals: { budgeted: number; actual: number; utilisation: number };
}

export type BudgetWithLines = Budget & { lines: BudgetLine[] };

@Injectable()
export class BudgetsService implements OnModuleInit {
  private readonly logger = new Logger(BudgetsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationService,
    private readonly approvals: ApprovalService,
    private readonly transitions: StatusTransitionRegistry,
    private readonly thresholds: ThresholdsService,
  ) {}

  /**
   * Register the terminal-status callback. A budget chain is a PARALLEL co-approval by OD + FD;
   * the engine only fires APPROVED once BOTH have approved, at which point the budget becomes
   * ACTIVE. A Return/Reject sends it back so it can be corrected and re-submitted.
   */
  onModuleInit(): void {
    this.transitions.registerTransition(SUBJECT_TABLE, async (subjectId, status) => {
      if (status === ApprovalStatus.APPROVED) {
        await this.activate(subjectId);
      } else if (status === ApprovalStatus.REJECTED) {
        await this.setStatus(subjectId, BudgetStatus.REJECTED);
      } else if (status === ApprovalStatus.RETURNED) {
        await this.setStatus(subjectId, BudgetStatus.RETURNED);
      }
    });
  }

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  list(status?: string): Promise<Budget[]> {
    return this.prisma.budget.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  /** A single budget with its lines and, for ACTIVE budgets, the current actuals vs lines. */
  async findOne(id: string): Promise<BudgetWithLines & { actuals: BudgetActuals }> {
    const budget = await this.prisma.budget.findUnique({
      where: { id },
      include: { lines: true },
    });
    if (!budget) {
      throw new NotFoundException('Budget not found');
    }
    const actuals = await this.computeActuals(id);
    return { ...budget, actuals };
  }

  // -------------------------------------------------------------------------
  // Create (DRAFT)
  // -------------------------------------------------------------------------

  async create(dto: CreateBudgetDto, actorId: string): Promise<BudgetWithLines> {
    const budget = await this.prisma.budget.create({
      data: {
        name: dto.name,
        periodMonth: dto.periodMonth ?? null,
        siteId: dto.siteId ?? null,
        currency: dto.currency,
        status: BudgetStatus.DRAFT,
        version: 1,
        createdBy: actorId,
        updatedBy: actorId,
        lines: {
          create: dto.lines.map((line) => ({
            category: line.category,
            description: line.description ?? null,
            amount: new Prisma.Decimal(line.amount),
            currency: dto.currency,
            createdBy: actorId,
            updatedBy: actorId,
          })),
        },
      },
      include: { lines: true },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: SUBJECT_TABLE,
      recordId: budget.id,
      after: {
        name: budget.name,
        currency: budget.currency,
        version: budget.version,
        lines: budget.lines.length,
        status: budget.status,
      },
    });
    return budget;
  }

  // -------------------------------------------------------------------------
  // Submit -> approval engine (PARALLEL OD + FD)
  // -------------------------------------------------------------------------

  /**
   * Move a DRAFT/RETURNED budget to SUBMITTED and hand it to the approval engine. The
   * approval_matrix for module='budget' must place OPS_DIRECTOR and FINANCE_DIRECTOR at the
   * same step_order with mode=PARALLEL so BOTH are required before the chain resolves APPROVED.
   */
  async submit(id: string, requesterId: string): Promise<Budget> {
    const budget = await this.getBudget(id);
    if (budget.status !== BudgetStatus.DRAFT && budget.status !== BudgetStatus.RETURNED) {
      throw new BadRequestException(`Budget cannot be submitted from status ${budget.status}`);
    }

    const updated = await this.prisma.budget.update({
      where: { id },
      data: { status: BudgetStatus.SUBMITTED, updatedBy: requesterId },
    });
    await this.audit.record({
      actorUserId: requesterId,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: budget.status },
      after: { status: BudgetStatus.SUBMITTED },
    });

    // Total budgeted amount drives the amount band selection in the matrix.
    const total = await this.budgetedTotal(id);
    await this.approvals.submit({
      module: APPROVAL_MODULE,
      subjectTable: SUBJECT_TABLE,
      subjectId: id,
      amount: total,
      currency: budget.currency,
      siteId: budget.siteId,
      requesterId,
    });

    return updated;
  }

  // -------------------------------------------------------------------------
  // Activate (fired by the transition registry once BOTH OD + FD approve)
  // -------------------------------------------------------------------------

  /** Both directors approved: store APPROVED then ACTIVE and notify the creator. */
  private async activate(id: string): Promise<void> {
    const budget = await this.prisma.budget.findUnique({ where: { id } });
    if (!budget) {
      this.logger.warn(`Activate skipped: budget ${id} no longer exists`);
      return;
    }
    if (budget.status === BudgetStatus.ACTIVE) {
      return; // idempotent
    }

    // Record the APPROVED milestone, then flip to ACTIVE (both stored per spec).
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: budget.status },
      after: { status: BudgetStatus.APPROVED },
    });

    await this.prisma.budget.update({ where: { id }, data: { status: BudgetStatus.ACTIVE } });
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: BudgetStatus.APPROVED },
      after: { status: BudgetStatus.ACTIVE },
    });

    // When a revision goes ACTIVE its predecessor is superseded.
    if (budget.parentBudgetId) {
      await this.prisma.budget
        .updateMany({
          where: { id: budget.parentBudgetId, status: BudgetStatus.ACTIVE },
          data: { status: BudgetStatus.SUPERSEDED },
        })
        .catch(() => undefined);
    }

    await this.notifications.send({
      userIds: [...new Set([budget.createdBy, ...(await this.directorUserIds())].filter(isString))],
      template: 'budget.activated',
      payload: { budgetId: id, name: budget.name, version: budget.version },
      severity: NotificationSeverity.INFO,
      subjectTable: SUBJECT_TABLE,
      subjectId: id,
    });
  }

  // -------------------------------------------------------------------------
  // Revisions / Budget Change Requests (clone to a new version; re-approvable)
  // -------------------------------------------------------------------------

  /**
   * Clone an ACTIVE/APPROVED budget into a new DRAFT version pointing back at its predecessor.
   * The new version carries the source lines forward unless `dto.lines` overrides them (a Budget
   * Change Request). It re-enters the same dual OD+FD approval path via {@link submit}.
   */
  async revise(id: string, dto: ReviseBudgetDto, actorId: string): Promise<BudgetWithLines> {
    const source = await this.getBudget(id);
    if (source.status !== BudgetStatus.ACTIVE && source.status !== BudgetStatus.APPROVED) {
      throw new BadRequestException(
        `Only an active/approved budget can be revised (status ${source.status})`,
      );
    }

    const lines =
      dto.lines?.map((line) => ({
        category: line.category,
        description: line.description ?? null,
        amount: new Prisma.Decimal(line.amount),
        currency: source.currency,
        createdBy: actorId,
        updatedBy: actorId,
      })) ??
      source.lines.map((line) => ({
        category: line.category,
        description: line.description,
        amount: line.amount,
        currency: line.currency,
        createdBy: actorId,
        updatedBy: actorId,
      }));

    const revision = await this.prisma.budget.create({
      data: {
        name: dto.name ?? source.name,
        periodMonth: source.periodMonth,
        siteId: source.siteId,
        currency: source.currency,
        status: BudgetStatus.DRAFT,
        version: source.version + 1,
        parentBudgetId: source.id,
        createdBy: actorId,
        updatedBy: actorId,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: SUBJECT_TABLE,
      recordId: revision.id,
      after: {
        revisionOf: source.id,
        version: revision.version,
        lines: revision.lines.length,
        status: revision.status,
      },
    });
    return revision;
  }

  // -------------------------------------------------------------------------
  // Actuals tracking (order_expenses + general_expenses + overheads + requisitions)
  // -------------------------------------------------------------------------

  /**
   * Sum actual spend per budget line/category from every spend source, compare against the
   * budgeted amount and flag WARN at the warn fraction (default 85%) and ALERT at the alert
   * fraction (default 100%). Sources are scoped to the budget's currency (and site where the
   * source carries one). Categories are matched case-insensitively; sources without a category
   * field (order_expenses.description, requisitions.purpose) match on that text field.
   */
  async computeActuals(budgetId: string): Promise<BudgetActuals> {
    const budget = await this.prisma.budget.findUnique({
      where: { id: budgetId },
      include: { lines: true },
    });
    if (!budget) {
      throw new NotFoundException('Budget not found');
    }

    const warnFraction = await this.fraction(WARN_THRESHOLD_KEY, DEFAULT_WARN_FRACTION);
    const alertFraction = await this.fraction(ALERT_THRESHOLD_KEY, DEFAULT_ALERT_FRACTION);

    // Actual spend keyed by lower-cased category.
    const actualsByCategory = await this.spendByCategory(budget);

    const lines: BudgetLineActual[] = budget.lines.map((line) => {
      const budgeted = line.amount.toNumber();
      const actual = actualsByCategory.get(line.category.toLowerCase()) ?? 0;
      const utilisation = budgeted > 0 ? actual / budgeted : 0;
      return {
        category: line.category,
        budgeted,
        actual,
        utilisation,
        state: this.utilisationState(utilisation, warnFraction, alertFraction),
      };
    });

    const budgetedTotal = lines.reduce((sum, l) => sum + l.budgeted, 0);
    const actualTotal = lines.reduce((sum, l) => sum + l.actual, 0);

    return {
      budgetId,
      currency: budget.currency,
      warnFraction,
      alertFraction,
      lines,
      totals: {
        budgeted: budgetedTotal,
        actual: actualTotal,
        utilisation: budgetedTotal > 0 ? actualTotal / budgetedTotal : 0,
      },
    };
  }

  /**
   * Re-evaluate an ACTIVE budget's actuals and notify Finance on any line that has crossed the
   * warn (WATCH) or alert (DANGER) trip-wire. Callable from a scheduler or on-demand; returns the
   * lines that fired so callers/tests can assert. Non-active budgets are a no-op.
   */
  async evaluateThresholds(
    budgetId: string,
  ): Promise<{ warned: string[]; alerted: string[]; actuals: BudgetActuals }> {
    const budget = await this.getBudget(budgetId);
    const actuals = await this.computeActuals(budgetId);
    if (budget.status !== BudgetStatus.ACTIVE) {
      return { warned: [], alerted: [], actuals };
    }

    const alerted = actuals.lines.filter((l) => l.state === 'ALERT').map((l) => l.category);
    const warned = actuals.lines.filter((l) => l.state === 'WARN').map((l) => l.category);

    if (alerted.length > 0) {
      await this.notifications.send({
        userIds: await this.financeUserIds(budget.siteId),
        template: 'budget.threshold.alert',
        payload: {
          budgetId,
          name: budget.name,
          categories: alerted,
          fraction: actuals.alertFraction,
        },
        severity: NotificationSeverity.DANGER,
        subjectTable: SUBJECT_TABLE,
        subjectId: budgetId,
      });
    }
    if (warned.length > 0) {
      await this.notifications.send({
        userIds: await this.financeUserIds(budget.siteId),
        template: 'budget.threshold.warn',
        payload: {
          budgetId,
          name: budget.name,
          categories: warned,
          fraction: actuals.warnFraction,
        },
        severity: NotificationSeverity.WATCH,
        subjectTable: SUBJECT_TABLE,
        subjectId: budgetId,
      });
    }

    return { warned, alerted, actuals };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  /** Aggregate actual spend across all sources, keyed by lower-cased category. */
  private async spendByCategory(budget: Budget): Promise<Map<string, number>> {
    const currency = budget.currency;
    const totals = new Map<string, number>();
    const add = (category: string | null | undefined, amount: Prisma.Decimal): void => {
      if (!category) {
        return;
      }
      const key = category.toLowerCase();
      totals.set(key, (totals.get(key) ?? 0) + amount.toNumber());
    };

    // general_expenses + overheads carry an explicit category.
    const [generals, overheads] = await Promise.all([
      this.prisma.generalExpense.findMany({
        where: { currency },
        select: { category: true, amount: true },
      }),
      this.prisma.overhead.findMany({
        where: { currency },
        select: { category: true, amount: true },
      }),
    ]);
    for (const g of generals) {
      add(g.category, g.amount);
    }
    for (const o of overheads) {
      add(o.category, o.amount);
    }

    // order_expenses have no category column: fold their description in as the category key.
    const orderExpenses = await this.prisma.orderExpense.findMany({
      where: { currency },
      select: { description: true, amount: true },
    });
    for (const e of orderExpenses) {
      add(e.description, e.amount);
    }

    // requisitions: money committed against a category via `purpose`, scoped to the budget site
    // when set. Only committed (submitted-or-beyond) requisitions count toward actuals.
    const requisitions = await this.prisma.requisition.findMany({
      where: {
        currency,
        status: { notIn: [BudgetStatus.DRAFT, BudgetStatus.REJECTED, BudgetStatus.RETURNED] },
        ...(budget.siteId ? { siteId: budget.siteId } : {}),
      },
      select: { purpose: true, amount: true },
    });
    for (const r of requisitions) {
      add(r.purpose, r.amount);
    }

    return totals;
  }

  private utilisationState(
    utilisation: number,
    warnFraction: number,
    alertFraction: number,
  ): 'OK' | 'WARN' | 'ALERT' {
    if (utilisation >= alertFraction) {
      return 'ALERT';
    }
    if (utilisation >= warnFraction) {
      return 'WARN';
    }
    return 'OK';
  }

  /** A configurable fraction threshold; falls back to `fallback` when none is configured. */
  private async fraction(key: string, fallback: number): Promise<number> {
    try {
      const threshold = await this.thresholds.current(key);
      return threshold.value != null ? threshold.value.toNumber() : fallback;
    } catch {
      return fallback;
    }
  }

  private async budgetedTotal(id: string): Promise<number> {
    const agg = await this.prisma.budgetLine.aggregate({
      where: { budgetId: id },
      _sum: { amount: true },
    });
    return agg._sum.amount?.toNumber() ?? 0;
  }

  private async getBudget(id: string): Promise<BudgetWithLines> {
    const budget = await this.prisma.budget.findUnique({ where: { id }, include: { lines: true } });
    if (!budget) {
      throw new NotFoundException('Budget not found');
    }
    return budget;
  }

  /** Mirror a terminal approval status (REJECTED/RETURNED) onto the budget. */
  private async setStatus(id: string, status: BudgetStatus): Promise<void> {
    const budget = await this.prisma.budget.findUnique({ where: { id } });
    if (!budget) {
      return;
    }
    await this.prisma.budget.update({ where: { id }, data: { status } });
    await this.audit.record({
      actorUserId: null,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { status: budget.status },
      after: { status },
    });
  }

  /** Users holding a Finance role (optionally site-scoped or global). */
  private async financeUserIds(siteId?: string | null): Promise<string[]> {
    const assignments = await this.prisma.userSiteRole.findMany({
      where: {
        role: { in: ['FINANCE_OFFICER', 'FINANCE_DIRECTOR'] },
        ...(siteId ? { OR: [{ siteId }, { siteId: null }] } : {}),
      },
      select: { userId: true },
    });
    return [...new Set(assignments.map((a) => a.userId))];
  }

  /** Users holding a director role that co-approves budgets (OD + FD). */
  private async directorUserIds(): Promise<string[]> {
    const assignments = await this.prisma.userSiteRole.findMany({
      where: { role: { in: ['OPS_DIRECTOR', 'FINANCE_DIRECTOR'] } },
      select: { userId: true },
    });
    return [...new Set(assignments.map((a) => a.userId))];
  }
}

function isString(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.length > 0;
}
