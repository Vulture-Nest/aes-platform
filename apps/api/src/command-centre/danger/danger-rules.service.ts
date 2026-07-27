import { Injectable, NotFoundException } from '@nestjs/common';
import { AlertSeverity, DangerRule, Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDangerRuleDto, UpdateDangerRuleDto } from './dto/danger-rule.dto';

/** A default rule definition seeded on bootstrap. */
interface DefaultRule {
  ruleKey: string;
  params: Record<string, unknown>;
  severity: AlertSeverity;
  enabled?: boolean;
}

/**
 * The canonical default danger rules (spec §14.2 / Prompt 7). Seeded idempotently:
 * an existing rule is left untouched (params/severity are operator-tunable afterwards).
 * All ten rules (incl. payroll_coverage, G8) are seeded enabled by default.
 */
export const DEFAULT_DANGER_RULES: DefaultRule[] = [
  {
    ruleKey: 'cash_runway',
    params: { dangerWeeks: 4, watchWeeks: 8 },
    severity: AlertSeverity.DANGER,
  },
  {
    ruleKey: 'coverage_ratio',
    params: { danger: 1.0, watch: 1.2 },
    severity: AlertSeverity.DANGER,
  },
  { ruleKey: 'zimra_overdue', params: {}, severity: AlertSeverity.DANGER },
  {
    ruleKey: 'receivables_90plus_spike',
    params: { watchPct: 0.25 },
    severity: AlertSeverity.WATCH,
  },
  { ruleKey: 'loan_interest_burn', params: { watchWeekly: 500 }, severity: AlertSeverity.WATCH },
  { ruleKey: 'deadline_breach', params: { daysAhead: 3 }, severity: AlertSeverity.DANGER },
  { ruleKey: 'petty_cash_variance', params: {}, severity: AlertSeverity.WATCH },
  { ruleKey: 'concentration_risk', params: { watchPct: 0.4 }, severity: AlertSeverity.WATCH },
  { ruleKey: 'conversion_loss', params: { watchPct: 0.1 }, severity: AlertSeverity.WATCH },
  // payroll_coverage (G8): fire DANGER when the next payroll's company cost exceeds
  // liquid cash. `statuses` = payroll-run statuses treated as "upcoming/unpaid".
  {
    ruleKey: 'payroll_coverage',
    params: { statuses: ['DRAFT', 'CHECKED', 'APPROVED'] },
    severity: AlertSeverity.DANGER,
    enabled: true,
  },
];

@Injectable()
export class DangerRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** All rules, ordered by key. */
  list(): Promise<DangerRule[]> {
    return this.prisma.dangerRule.findMany({ orderBy: { ruleKey: 'asc' } });
  }

  /** Only enabled rules (what the engine dispatches on). */
  listEnabled(): Promise<DangerRule[]> {
    return this.prisma.dangerRule.findMany({
      where: { enabled: true },
      orderBy: { ruleKey: 'asc' },
    });
  }

  findByKey(ruleKey: string): Promise<DangerRule | null> {
    return this.prisma.dangerRule.findUnique({ where: { ruleKey } });
  }

  /** Create a rule (ruleKey unique). */
  async create(dto: CreateDangerRuleDto, actorId: string): Promise<DangerRule> {
    const rule = await this.prisma.dangerRule.create({
      data: {
        ruleKey: dto.ruleKey,
        params: (dto.params as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        severity: dto.severity,
        enabled: dto.enabled ?? true,
        createdBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'danger_rules',
      recordId: rule.id,
      after: { ruleKey: rule.ruleKey, severity: rule.severity, enabled: rule.enabled },
    });
    return rule;
  }

  /** Patch a rule (params/severity/enabled). */
  async update(id: string, dto: UpdateDangerRuleDto, actorId: string): Promise<DangerRule> {
    const existing = await this.prisma.dangerRule.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Danger rule not found');
    }
    const rule = await this.prisma.dangerRule.update({
      where: { id },
      data: {
        ...(dto.params !== undefined ? { params: dto.params as Prisma.InputJsonValue } : {}),
        ...(dto.severity !== undefined ? { severity: dto.severity } : {}),
        ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'danger_rules',
      recordId: id,
      before: { params: existing.params, severity: existing.severity, enabled: existing.enabled },
      after: { params: rule.params, severity: rule.severity, enabled: rule.enabled },
    });
    return rule;
  }

  /**
   * Idempotently create any missing default rules. Existing rules (matched by ruleKey)
   * are left untouched so operator tuning survives a re-seed. Returns the keys created.
   */
  async seedDefaults(): Promise<{ created: string[] }> {
    const existing = await this.prisma.dangerRule.findMany({ select: { ruleKey: true } });
    const have = new Set(existing.map((r) => r.ruleKey));
    const created: string[] = [];
    for (const def of DEFAULT_DANGER_RULES) {
      if (have.has(def.ruleKey)) {
        continue;
      }
      await this.prisma.dangerRule.create({
        data: {
          ruleKey: def.ruleKey,
          params: def.params as Prisma.InputJsonValue,
          severity: def.severity,
          enabled: def.enabled ?? true,
        },
      });
      created.push(def.ruleKey);
    }
    return { created };
  }
}
