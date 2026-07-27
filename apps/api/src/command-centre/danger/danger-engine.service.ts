import { Injectable, Logger } from '@nestjs/common';
import { AlertSeverity, DangerRule, PayrollRunStatus, Prisma } from '@prisma/client';
import { LoanInterestService } from '../../financial/domain/loan-interest.service';
import { LedgerService } from '../../ledger/ledger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { AlertService } from './alert.service';
import { DangerRulesService } from './danger-rules.service';

/** Per-rule outcome recorded in the evaluation summary. */
export interface RuleEvaluation {
  ruleKey: string;
  /** 'raised' | 'refreshed' collapse to 'alerted'; 'clear' | 'skipped' | 'error'. */
  outcome: 'alerted' | 'clear' | 'skipped' | 'error';
  detail?: string;
}

/** Summary returned from a full evaluate() pass. */
export interface EvaluateSummary {
  evaluatedAt: string;
  rulesEvaluated: number;
  alertsRaised: number;
  results: RuleEvaluation[];
}

/** ms in one day / week — used for ageing + runway math. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const DAYS_PER_WEEK = 7;

/** Read a numeric param with a fallback (params is loose JSON). */
function numParam(params: Prisma.JsonValue, key: string, fallback: number): number {
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    const v = (params as Record<string, unknown>)[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      return v;
    }
  }
  return fallback;
}

/** Read a string[] param with a fallback (params is loose JSON). */
function strArrayParam(params: Prisma.JsonValue, key: string, fallback: string[]): string[] {
  if (params && typeof params === 'object' && !Array.isArray(params)) {
    const v = (params as Record<string, unknown>)[key];
    if (Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length > 0) {
      return v as string[];
    }
  }
  return fallback;
}

/** Prisma.Decimal | number | null -> number. */
function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === 'number' ? value : value.toNumber();
}

/**
 * DangerEngineService — evaluates enabled danger rules against current data and
 * raises/refreshes alerts (spec §14.2 / Prompt 7).
 *
 * evaluate() is the single entry point. It is intentionally NOT wired to a real
 * cron here — @nestjs/schedule may not be installed. Wire a nightly/interval trigger
 * (or a BullMQ repeatable job) to call evaluate() when scheduling lands. It is also
 * exposed via POST /v1/danger-engine/evaluate for manual/testing runs.
 */
@Injectable()
export class DangerEngineService {
  private readonly logger = new Logger(DangerEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rules: DangerRulesService,
    private readonly alerts: AlertService,
    private readonly ledger: LedgerService,
    private readonly loanInterest: LoanInterestService,
  ) {}

  /**
   * Load enabled rules and evaluate each one we know how to compute from current data.
   * Unknown/deferred rules are skipped gracefully. Returns a summary.
   */
  async evaluate(now: Date = new Date()): Promise<EvaluateSummary> {
    const enabled = await this.rules.listEnabled();
    const results: RuleEvaluation[] = [];

    for (const rule of enabled) {
      try {
        results.push(await this.evaluateRule(rule, now));
      } catch (err) {
        const detail = err instanceof Error ? err.message : 'unknown error';
        this.logger.error(`Danger rule ${rule.ruleKey} failed: ${detail}`);
        results.push({ ruleKey: rule.ruleKey, outcome: 'error', detail });
      }
    }

    const alertsRaised = results.filter((r) => r.outcome === 'alerted').length;
    return {
      evaluatedAt: now.toISOString(),
      rulesEvaluated: enabled.length,
      alertsRaised,
      results,
    };
  }

  /** Dispatch one rule to its evaluator. */
  private evaluateRule(rule: DangerRule, now: Date): Promise<RuleEvaluation> {
    switch (rule.ruleKey) {
      case 'coverage_ratio':
        return this.evalCoverageRatio(rule, now);
      case 'zimra_overdue':
        return this.evalZimraOverdue(rule, now);
      case 'deadline_breach':
        return this.evalDeadlineBreach(rule, now);
      case 'receivables_90plus_spike':
        return this.evalReceivables90Spike(rule, now);
      case 'loan_interest_burn':
        return this.evalLoanInterestBurn(rule, now);
      case 'cash_runway':
        return this.evalCashRunway(rule, now);
      case 'payroll_coverage':
        return this.evalPayrollCoverage(rule, now);
      case 'petty_cash_variance':
        return this.evalPettyCashVariance(rule, now);
      case 'concentration_risk':
        return this.evalConcentrationRisk(rule, now);
      case 'conversion_loss':
        return this.evalConversionLoss(rule, now);
      default:
        // Unknown rule key — skip gracefully rather than raising a false alert.
        return Promise.resolve({
          ruleKey: rule.ruleKey,
          outcome: 'skipped',
          detail: 'no evaluator wired for this rule yet',
        });
    }
  }

  // ---------------------------------------------------------------------------
  // coverage_ratio: available cash vs committed outflows (pending obligations).
  //   ratio = cash / committedOutflows. DANGER when <= danger, WATCH when <= watch.
  // ---------------------------------------------------------------------------
  private async evalCoverageRatio(rule: DangerRule, _now: Date): Promise<RuleEvaluation> {
    const dangerLevel = numParam(rule.params, 'danger', 1.0);
    const watchLevel = numParam(rule.params, 'watch', 1.2);

    const cash = await this.ledger.cashPosition();
    const cashUsd = cash.totals.USD ?? 0;

    // Committed outflows = approved-pending-funds requisitions (USD, unfunded obligations).
    const pending = await this.prisma.requisition.aggregate({
      where: { status: 'APPROVED_PENDING_FUNDS', currency: 'USD' },
      _sum: { amount: true },
    });
    const committed = num(pending._sum.amount);

    if (committed <= 0) {
      // Nothing committed -> fully covered; clear any standing alert.
      await this.alerts.resolve(rule.ruleKey);
      return { ruleKey: rule.ruleKey, outcome: 'clear', detail: 'no committed outflows' };
    }

    const ratio = cashUsd / committed;
    if (ratio > watchLevel) {
      await this.alerts.resolve(rule.ruleKey);
      return { ruleKey: rule.ruleKey, outcome: 'clear', detail: `ratio=${ratio.toFixed(2)}` };
    }

    const severity = ratio <= dangerLevel ? AlertSeverity.DANGER : AlertSeverity.WATCH;
    await this.alerts.raiseOrRefresh({
      ruleKey: rule.ruleKey,
      severity,
      message: `Cash coverage ratio ${ratio.toFixed(2)} (cash ${cashUsd.toFixed(2)} USD vs committed ${committed.toFixed(2)} USD).`,
      payload: { ratio, cashUsd, committed, danger: dangerLevel, watch: watchLevel },
    });
    return { ruleKey: rule.ruleKey, outcome: 'alerted', detail: `ratio=${ratio.toFixed(2)}` };
  }

  // ---------------------------------------------------------------------------
  // zimra_overdue: any ZIMRA assessment past its due date -> DANGER (one alert per assessment).
  // ---------------------------------------------------------------------------
  private async evalZimraOverdue(rule: DangerRule, now: Date): Promise<RuleEvaluation> {
    const overdue = await this.prisma.zimraAssessment.findMany({
      where: { dueDate: { lt: now } },
    });
    if (overdue.length === 0) {
      return { ruleKey: rule.ruleKey, outcome: 'clear', detail: 'no overdue assessments' };
    }
    for (const a of overdue) {
      const daysOverdue = Math.floor((now.getTime() - a.dueDate.getTime()) / MS_PER_DAY);
      await this.alerts.raiseOrRefresh({
        ruleKey: rule.ruleKey,
        severity: rule.severity,
        subjectTable: 'zimra_assessments',
        subjectId: a.id,
        message: `ZIMRA ${a.taxType} assessment of ${num(a.assessedAmount).toFixed(2)} ${a.currency} is ${daysOverdue} day(s) overdue.`,
        payload: {
          taxType: a.taxType,
          assessedAmount: num(a.assessedAmount),
          currency: a.currency,
          dueDate: a.dueDate.toISOString(),
          daysOverdue,
        },
      });
    }
    return {
      ruleKey: rule.ruleKey,
      outcome: 'alerted',
      detail: `${overdue.length} overdue assessment(s)`,
    };
  }

  // ---------------------------------------------------------------------------
  // deadline_breach: APPROVED_PENDING_FUNDS requisitions whose requiredByDate is within
  //   `daysAhead` (or already past) and still unfunded -> DANGER (one alert per requisition).
  // ---------------------------------------------------------------------------
  private async evalDeadlineBreach(rule: DangerRule, now: Date): Promise<RuleEvaluation> {
    const daysAhead = numParam(rule.params, 'daysAhead', 3);
    const cutoff = new Date(now.getTime() + daysAhead * MS_PER_DAY);

    const atRisk = await this.prisma.requisition.findMany({
      where: {
        status: 'APPROVED_PENDING_FUNDS',
        requiredByDate: { lte: cutoff },
      },
    });
    if (atRisk.length === 0) {
      return { ruleKey: rule.ruleKey, outcome: 'clear', detail: 'no imminent unfunded deadlines' };
    }
    for (const r of atRisk) {
      const daysUntil = Math.ceil((r.requiredByDate.getTime() - now.getTime()) / MS_PER_DAY);
      await this.alerts.raiseOrRefresh({
        ruleKey: rule.ruleKey,
        severity: rule.severity,
        subjectTable: 'requisitions',
        subjectId: r.id,
        message: `Requisition "${r.purpose}" (${num(r.amount).toFixed(2)} ${r.currency}) is unfunded and due in ${daysUntil} day(s).`,
        payload: {
          amount: num(r.amount),
          currency: r.currency,
          requiredByDate: r.requiredByDate.toISOString(),
          daysUntil,
          daysAhead,
        },
      });
    }
    return {
      ruleKey: rule.ruleKey,
      outcome: 'alerted',
      detail: `${atRisk.length} requisition(s) at deadline risk`,
    };
  }

  // ---------------------------------------------------------------------------
  // receivables_90plus_spike: share of outstanding order value aged 90+ days.
  //   outstanding per order = valueExVat - receipts. aged90 = orders with no receipt
  //   activity for 90+ days (proxy: order created 90+ days ago and still outstanding).
  //   WATCH when aged90 / totalOutstanding >= watchPct.
  // ---------------------------------------------------------------------------
  private async evalReceivables90Spike(rule: DangerRule, now: Date): Promise<RuleEvaluation> {
    const watchPct = numParam(rule.params, 'watchPct', 0.25);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * MS_PER_DAY);

    const orders = await this.prisma.order.findMany({
      include: { receipts: { select: { amount: true, receivedDate: true } } },
    });

    let totalOutstanding = 0;
    let aged90Outstanding = 0;
    for (const o of orders) {
      const received = o.receipts.reduce((s, r) => s + num(r.amount), 0);
      const outstanding = num(o.valueExVat) - received;
      if (outstanding <= 0) {
        continue;
      }
      totalOutstanding += outstanding;
      // Age from the latest receipt if any, else the order creation date.
      const lastActivity = o.receipts.reduce<Date>(
        (latest, r) => (r.receivedDate > latest ? r.receivedDate : latest),
        o.createdAt,
      );
      if (lastActivity < ninetyDaysAgo) {
        aged90Outstanding += outstanding;
      }
    }

    if (totalOutstanding <= 0) {
      await this.alerts.resolve(rule.ruleKey);
      return { ruleKey: rule.ruleKey, outcome: 'clear', detail: 'no outstanding receivables' };
    }

    const pct = aged90Outstanding / totalOutstanding;
    if (pct < watchPct) {
      await this.alerts.resolve(rule.ruleKey);
      return { ruleKey: rule.ruleKey, outcome: 'clear', detail: `aged90 share=${pct.toFixed(2)}` };
    }

    await this.alerts.raiseOrRefresh({
      ruleKey: rule.ruleKey,
      severity: rule.severity,
      message: `Receivables aged 90+ days are ${(pct * 100).toFixed(0)}% of outstanding (${aged90Outstanding.toFixed(2)} of ${totalOutstanding.toFixed(2)}).`,
      payload: { pct, aged90Outstanding, totalOutstanding, watchPct },
    });
    return { ruleKey: rule.ruleKey, outcome: 'alerted', detail: `aged90 share=${pct.toFixed(2)}` };
  }

  // ---------------------------------------------------------------------------
  // loan_interest_burn: total weekly interest accrual across active loans.
  //   WATCH when weekly burn >= watchWeekly.
  // ---------------------------------------------------------------------------
  private async evalLoanInterestBurn(rule: DangerRule, _now: Date): Promise<RuleEvaluation> {
    const watchWeekly = numParam(rule.params, 'watchWeekly', 500);
    const loans = await this.prisma.loan.findMany({ where: { status: 'ACTIVE' } });

    let weeklyBurn = 0;
    for (const loan of loans) {
      const weeklyRate = num(loan.weeklyRatePct) / 100;
      // dailyAccrual * 7 = weekly burn on the (flat) principal.
      const daily = this.loanInterest.dailyAccrual({
        principal: num(loan.principal),
        weeklyRate,
      });
      weeklyBurn += daily * DAYS_PER_WEEK;
    }

    if (weeklyBurn < watchWeekly) {
      await this.alerts.resolve(rule.ruleKey);
      return {
        ruleKey: rule.ruleKey,
        outcome: 'clear',
        detail: `weekly burn=${weeklyBurn.toFixed(2)}`,
      };
    }

    await this.alerts.raiseOrRefresh({
      ruleKey: rule.ruleKey,
      severity: rule.severity,
      message: `Loan interest burn is ${weeklyBurn.toFixed(2)} USD/week across ${loans.length} active loan(s) (watch ${watchWeekly}).`,
      payload: { weeklyBurn, watchWeekly, activeLoans: loans.length },
    });
    return {
      ruleKey: rule.ruleKey,
      outcome: 'alerted',
      detail: `weekly burn=${weeklyBurn.toFixed(2)}`,
    };
  }

  // ---------------------------------------------------------------------------
  // cash_runway: runway in weeks = cash / weeklyBurn. weeklyBurn approximated from
  //   the last 4 weeks of ledger outflows (debits). Skips gracefully when no burn.
  //   DANGER when runway <= dangerWeeks, WATCH when <= watchWeeks.
  // ---------------------------------------------------------------------------
  private async evalCashRunway(rule: DangerRule, now: Date): Promise<RuleEvaluation> {
    const dangerWeeks = numParam(rule.params, 'dangerWeeks', 4);
    const watchWeeks = numParam(rule.params, 'watchWeeks', 8);
    const lookbackWeeks = 4;
    const since = new Date(now.getTime() - lookbackWeeks * DAYS_PER_WEEK * MS_PER_DAY);

    const cash = await this.ledger.cashPosition();
    const cashUsd = cash.totals.USD ?? 0;

    // Approximate burn from recent outflows (debits) on USD accounts.
    const outflow = await this.prisma.ledgerEntry.aggregate({
      where: { currency: 'USD', entryDate: { gte: since } },
      _sum: { debit: true },
    });
    const recentOutflow = num(outflow._sum.debit);
    const weeklyBurn = recentOutflow / lookbackWeeks;

    if (weeklyBurn <= 0) {
      // Not computable (no recent burn) — skip gracefully, don't raise a false alert.
      return {
        ruleKey: rule.ruleKey,
        outcome: 'skipped',
        detail: 'no recent outflows to estimate burn',
      };
    }

    const runwayWeeks = cashUsd / weeklyBurn;
    if (runwayWeeks > watchWeeks) {
      await this.alerts.resolve(rule.ruleKey);
      return {
        ruleKey: rule.ruleKey,
        outcome: 'clear',
        detail: `runway=${runwayWeeks.toFixed(1)}w`,
      };
    }

    const severity = runwayWeeks <= dangerWeeks ? AlertSeverity.DANGER : AlertSeverity.WATCH;
    await this.alerts.raiseOrRefresh({
      ruleKey: rule.ruleKey,
      severity,
      message: `Cash runway is ${runwayWeeks.toFixed(1)} week(s) (cash ${cashUsd.toFixed(2)} USD, burn ~${weeklyBurn.toFixed(2)} USD/week).`,
      payload: { runwayWeeks, cashUsd, weeklyBurn, dangerWeeks, watchWeeks },
    });
    return {
      ruleKey: rule.ruleKey,
      outcome: 'alerted',
      detail: `runway=${runwayWeeks.toFixed(1)}w`,
    };
  }

  // ---------------------------------------------------------------------------
  // payroll_coverage: the next payroll's total company cost vs liquid cash.
  //   Company cost per line = gross + employer statutory contributions
  //   (nssaEr + zimdef + nec + mipf) — the same "salaries + employer" basis the
  //   payroll ledger posting uses. "Next payroll" = runs not yet paid/locked
  //   (DRAFT/CHECKED/APPROVED). Liquid cash = command-centre cash position (USD).
  //   DANGER when payrollTotal > liquidCash. Params: `statuses` (string[] of run
  //   statuses to include, default the unpaid set).
  // ---------------------------------------------------------------------------
  private async evalPayrollCoverage(rule: DangerRule, _now: Date): Promise<RuleEvaluation> {
    const statuses = strArrayParam(rule.params, 'statuses', ['DRAFT', 'CHECKED', 'APPROVED']);

    const runs = await this.prisma.payrollRun.findMany({
      where: { status: { in: statuses as PayrollRunStatus[] } },
      include: {
        lines: {
          select: {
            gross: true,
            nssaEr: true,
            zimdef: true,
            nec: true,
            mipf: true,
          },
        },
      },
    });

    let payrollTotal = 0;
    for (const run of runs) {
      for (const line of run.lines) {
        payrollTotal +=
          num(line.gross) + num(line.nssaEr) + num(line.zimdef) + num(line.nec) + num(line.mipf);
      }
    }

    if (payrollTotal <= 0) {
      await this.alerts.resolve(rule.ruleKey);
      return { ruleKey: rule.ruleKey, outcome: 'clear', detail: 'no upcoming payroll cost' };
    }

    const cash = await this.ledger.cashPosition();
    const liquidCash = cash.totals.USD ?? 0;

    if (payrollTotal <= liquidCash) {
      await this.alerts.resolve(rule.ruleKey);
      return {
        ruleKey: rule.ruleKey,
        outcome: 'clear',
        detail: `payroll ${payrollTotal.toFixed(2)} <= cash ${liquidCash.toFixed(2)}`,
      };
    }

    await this.alerts.raiseOrRefresh({
      ruleKey: rule.ruleKey,
      severity: rule.severity,
      message: `Next payroll of ${payrollTotal.toFixed(2)} USD exceeds liquid cash of ${liquidCash.toFixed(2)} USD (shortfall ${(payrollTotal - liquidCash).toFixed(2)} USD).`,
      payload: {
        payrollTotal,
        liquidCash,
        shortfall: payrollTotal - liquidCash,
        runs: runs.length,
        statuses,
      },
    });
    return {
      ruleKey: rule.ruleKey,
      outcome: 'alerted',
      detail: `payroll ${payrollTotal.toFixed(2)} > cash ${liquidCash.toFixed(2)}`,
    };
  }

  // ---------------------------------------------------------------------------
  // petty_cash_variance: any petty-cash float with an unresolved reconciliation
  //   variance beyond tolerance. Reconciliation locks a float when a counted
  //   variance exceeds tolerance (schema: PettyCashFloat.locked), so a locked
  //   float is an unresolved out-of-tolerance variance. WATCH, one alert per
  //   locked float (deduped by subjectId).
  // ---------------------------------------------------------------------------
  private async evalPettyCashVariance(rule: DangerRule, _now: Date): Promise<RuleEvaluation> {
    const locked = await this.prisma.pettyCashFloat.findMany({ where: { locked: true } });
    if (locked.length === 0) {
      await this.alerts.resolve(rule.ruleKey);
      return { ruleKey: rule.ruleKey, outcome: 'clear', detail: 'no locked floats' };
    }
    for (const float of locked) {
      await this.alerts.raiseOrRefresh({
        ruleKey: rule.ruleKey,
        severity: rule.severity,
        subjectTable: 'petty_cash_floats',
        subjectId: float.id,
        message: `Petty-cash float (${num(float.floatAmount).toFixed(2)} ${float.currency}) is locked by an unresolved reconciliation variance beyond tolerance.`,
        payload: {
          floatAmount: num(float.floatAmount),
          currency: float.currency,
          siteId: float.siteId,
          custodianUserId: float.custodianUserId,
        },
      });
    }
    return {
      ruleKey: rule.ruleKey,
      outcome: 'alerted',
      detail: `${locked.length} locked float(s)`,
    };
  }

  // ---------------------------------------------------------------------------
  // concentration_risk: one client's open order value as a share of total open
  //   order value. Open value per order = valueExVat - receipts (outstanding).
  //   WATCH when the top client's share > watchPct (params, default 0.4).
  //   Drill-down subject = the concentrated client.
  // ---------------------------------------------------------------------------
  private async evalConcentrationRisk(rule: DangerRule, _now: Date): Promise<RuleEvaluation> {
    const watchPct = numParam(rule.params, 'watchPct', 0.4);

    const orders = await this.prisma.order.findMany({
      include: {
        receipts: { select: { amount: true } },
        client: { select: { id: true, name: true } },
      },
    });

    const byClient = new Map<string, { name: string; open: number }>();
    let totalOpen = 0;
    for (const o of orders) {
      const received = o.receipts.reduce((s, r) => s + num(r.amount), 0);
      const open = num(o.valueExVat) - received;
      if (open <= 0) {
        continue;
      }
      totalOpen += open;
      const prev = byClient.get(o.clientId) ?? { name: o.client.name, open: 0 };
      prev.open += open;
      byClient.set(o.clientId, prev);
    }

    if (totalOpen <= 0) {
      await this.alerts.resolve(rule.ruleKey);
      return { ruleKey: rule.ruleKey, outcome: 'clear', detail: 'no open order value' };
    }

    let topClientId: string | null = null;
    let top = { name: '', open: 0 };
    for (const [clientId, agg] of byClient) {
      if (agg.open > top.open) {
        top = agg;
        topClientId = clientId;
      }
    }

    const pct = top.open / totalOpen;
    if (pct <= watchPct) {
      await this.alerts.resolve(rule.ruleKey);
      return { ruleKey: rule.ruleKey, outcome: 'clear', detail: `top share=${pct.toFixed(2)}` };
    }

    await this.alerts.raiseOrRefresh({
      ruleKey: rule.ruleKey,
      severity: rule.severity,
      subjectTable: 'clients',
      subjectId: topClientId ?? undefined,
      message: `Client "${top.name}" holds ${(pct * 100).toFixed(0)}% of open order value (${top.open.toFixed(2)} of ${totalOpen.toFixed(2)}), above the ${(watchPct * 100).toFixed(0)}% concentration limit.`,
      payload: {
        clientId: topClientId,
        clientName: top.name,
        clientOpen: top.open,
        totalOpen,
        pct,
        watchPct,
      },
    });
    return { ruleKey: rule.ruleKey, outcome: 'alerted', detail: `top share=${pct.toFixed(2)}` };
  }

  // ---------------------------------------------------------------------------
  // conversion_loss: cumulative petty-cash conversion loss vs the official rate
  //   within the period. Sums PettyCashTxn.varianceVsOfficial for CONVERSION legs
  //   (achievedRate - officialRate; a negative variance is a loss). WATCH when the
  //   cumulative loss magnitude exceeds `minLossUsd` (absolute, params) OR — when a
  //   converted volume is available — the loss share exceeds `watchPct` of the
  //   converted amount. Params: `periodDays` (lookback, default 30),
  //   `watchPct` (default 0.1), `minLossUsd` (default 0 = share-only).
  // ---------------------------------------------------------------------------
  private async evalConversionLoss(rule: DangerRule, now: Date): Promise<RuleEvaluation> {
    const periodDays = numParam(rule.params, 'periodDays', 30);
    const watchPct = numParam(rule.params, 'watchPct', 0.1);
    const minLossUsd = numParam(rule.params, 'minLossUsd', 0);
    const since = new Date(now.getTime() - periodDays * MS_PER_DAY);

    const legs = await this.prisma.pettyCashTxn.findMany({
      where: {
        type: { in: ['CONVERSION_OUT', 'CONVERSION_IN'] },
        createdAt: { gte: since },
      },
      select: { amount: true, varianceVsOfficial: true },
    });

    let cumulativeVariance = 0;
    let convertedVolume = 0;
    for (const leg of legs) {
      cumulativeVariance += num(leg.varianceVsOfficial);
      convertedVolume += num(leg.amount);
    }
    // A negative variance vs official = a loss on the swap.
    const cumulativeLoss = Math.max(0, -cumulativeVariance);

    if (cumulativeLoss <= 0) {
      await this.alerts.resolve(rule.ruleKey);
      return { ruleKey: rule.ruleKey, outcome: 'clear', detail: 'no conversion loss in period' };
    }

    const lossPct = convertedVolume > 0 ? cumulativeLoss / convertedVolume : 0;
    const breaches = cumulativeLoss > minLossUsd && (minLossUsd > 0 || lossPct > watchPct);
    if (!breaches) {
      await this.alerts.resolve(rule.ruleKey);
      return {
        ruleKey: rule.ruleKey,
        outcome: 'clear',
        detail: `loss ${cumulativeLoss.toFixed(2)} (${(lossPct * 100).toFixed(1)}%)`,
      };
    }

    await this.alerts.raiseOrRefresh({
      ruleKey: rule.ruleKey,
      severity: rule.severity,
      message: `Petty-cash conversion loss vs official rate is ${cumulativeLoss.toFixed(2)} over the last ${periodDays} day(s) (${(lossPct * 100).toFixed(1)}% of ${convertedVolume.toFixed(2)} converted).`,
      payload: {
        cumulativeLoss,
        convertedVolume,
        lossPct,
        periodDays,
        watchPct,
        minLossUsd,
      },
    });
    return {
      ruleKey: rule.ruleKey,
      outcome: 'alerted',
      detail: `loss ${cumulativeLoss.toFixed(2)} (${(lossPct * 100).toFixed(1)}%)`,
    };
  }
}
