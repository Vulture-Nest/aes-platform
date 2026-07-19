import { AlertSeverity, Prisma } from '@prisma/client';
import { LoanInterestService } from '../../financial/domain/loan-interest.service';
import { DangerEngineService } from './danger-engine.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

function makeEngine() {
  const rules = { listEnabled: jest.fn().mockResolvedValue([]) };
  const alerts = {
    raiseOrRefresh: jest.fn().mockResolvedValue({}),
    resolve: jest.fn().mockResolvedValue({ resolved: 0 }),
  };
  const ledger = {
    cashPosition: jest.fn().mockResolvedValue({ accounts: [], totals: { USD: 0, ZWG: 0 } }),
  };
  const prisma = {
    requisition: { aggregate: jest.fn(), findMany: jest.fn() },
    zimraAssessment: { findMany: jest.fn().mockResolvedValue([]) },
    order: { findMany: jest.fn().mockResolvedValue([]) },
    loan: { findMany: jest.fn().mockResolvedValue([]) },
    ledgerEntry: { aggregate: jest.fn() },
  };
  const loanInterest = new LoanInterestService();
  const engine = new DangerEngineService(
    prisma as any,
    rules as any,
    alerts as any,
    ledger as any,
    loanInterest,
  );
  return { engine, rules, alerts, ledger, prisma };
}

function rule(
  ruleKey: string,
  params: Record<string, unknown>,
  severity: AlertSeverity = AlertSeverity.DANGER,
) {
  return { id: `id-${ruleKey}`, ruleKey, params, severity, enabled: true };
}

describe('DangerEngineService.evaluate', () => {
  it('skips unknown/deferred rules gracefully', async () => {
    const { engine, rules, alerts } = makeEngine();
    rules.listEnabled.mockResolvedValue([rule('petty_cash_variance', {}, AlertSeverity.WATCH)]);

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(summary.rulesEvaluated).toBe(1);
    expect(summary.alertsRaised).toBe(0);
    expect(summary.results[0]).toEqual(
      expect.objectContaining({ ruleKey: 'petty_cash_variance', outcome: 'skipped' }),
    );
    expect(alerts.raiseOrRefresh).not.toHaveBeenCalled();
  });

  it('raises coverage_ratio DANGER when cash < committed outflows', async () => {
    const { engine, rules, alerts, ledger, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([rule('coverage_ratio', { danger: 1.0, watch: 1.2 })]);
    ledger.cashPosition.mockResolvedValue({ accounts: [], totals: { USD: 500, ZWG: 0 } });
    prisma.requisition.aggregate.mockResolvedValue({ _sum: { amount: dec(1000) } });

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(alerts.raiseOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleKey: 'coverage_ratio',
        severity: AlertSeverity.DANGER,
        payload: expect.objectContaining({ ratio: 0.5, cashUsd: 500, committed: 1000 }),
      }),
    );
    expect(summary.alertsRaised).toBe(1);
  });

  it('clears coverage_ratio when there are no committed outflows', async () => {
    const { engine, rules, alerts, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([rule('coverage_ratio', { danger: 1.0, watch: 1.2 })]);
    prisma.requisition.aggregate.mockResolvedValue({ _sum: { amount: null } });

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(alerts.raiseOrRefresh).not.toHaveBeenCalled();
    expect(alerts.resolve).toHaveBeenCalledWith('coverage_ratio');
    expect(summary.results[0].outcome).toBe('clear');
  });

  it('raises one zimra_overdue alert per past-due assessment (deduped by subjectId)', async () => {
    const { engine, rules, alerts, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([rule('zimra_overdue', {})]);
    prisma.zimraAssessment.findMany.mockResolvedValue([
      {
        id: 'z1',
        taxType: 'VAT',
        assessedAmount: dec(1200),
        currency: 'USD',
        dueDate: new Date('2026-06-01'),
      },
    ]);

    await engine.evaluate(new Date('2026-07-19'));

    expect(alerts.raiseOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleKey: 'zimra_overdue',
        subjectTable: 'zimra_assessments',
        subjectId: 'z1',
        severity: AlertSeverity.DANGER,
      }),
    );
  });

  it('raises deadline_breach for unfunded requisitions due within the window', async () => {
    const { engine, rules, alerts, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([rule('deadline_breach', { daysAhead: 3 })]);
    prisma.requisition.findMany.mockResolvedValue([
      {
        id: 'r1',
        purpose: 'Fuel',
        amount: dec(800),
        currency: 'USD',
        requiredByDate: new Date('2026-07-20'),
      },
    ]);

    await engine.evaluate(new Date('2026-07-19'));

    expect(prisma.requisition.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: 'APPROVED_PENDING_FUNDS' }),
      }),
    );
    expect(alerts.raiseOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleKey: 'deadline_breach',
        subjectTable: 'requisitions',
        subjectId: 'r1',
      }),
    );
  });

  it('raises loan_interest_burn WATCH when weekly burn exceeds the threshold', async () => {
    const { engine, rules, alerts, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([
      rule('loan_interest_burn', { watchWeekly: 500 }, AlertSeverity.WATCH),
    ]);
    // 100000 principal @ 1% / week = 1000 USD/week burn > 500.
    prisma.loan.findMany.mockResolvedValue([
      { id: 'l1', principal: dec(100000), weeklyRatePct: dec(1), status: 'ACTIVE' },
    ]);

    await engine.evaluate(new Date('2026-07-19'));

    expect(alerts.raiseOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleKey: 'loan_interest_burn',
        severity: AlertSeverity.WATCH,
        payload: expect.objectContaining({ weeklyBurn: 1000 }),
      }),
    );
  });

  it('skips cash_runway when there is no recent burn (not computable)', async () => {
    const { engine, rules, alerts, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([rule('cash_runway', { dangerWeeks: 4, watchWeeks: 8 })]);
    prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { debit: null } });

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(alerts.raiseOrRefresh).not.toHaveBeenCalled();
    expect(summary.results[0].outcome).toBe('skipped');
  });

  it('raises cash_runway DANGER when runway is below dangerWeeks', async () => {
    const { engine, rules, alerts, ledger, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([rule('cash_runway', { dangerWeeks: 4, watchWeeks: 8 })]);
    ledger.cashPosition.mockResolvedValue({ accounts: [], totals: { USD: 2000, ZWG: 0 } });
    // 4000 outflow over 4-week lookback => 1000/week burn; runway = 2000/1000 = 2 weeks.
    prisma.ledgerEntry.aggregate.mockResolvedValue({ _sum: { debit: dec(4000) } });

    await engine.evaluate(new Date('2026-07-19'));

    expect(alerts.raiseOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleKey: 'cash_runway',
        severity: AlertSeverity.DANGER,
        payload: expect.objectContaining({ runwayWeeks: 2, weeklyBurn: 1000 }),
      }),
    );
  });

  it('records an error result when a rule evaluator throws', async () => {
    const { engine, rules, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([rule('zimra_overdue', {})]);
    prisma.zimraAssessment.findMany.mockRejectedValue(new Error('db down'));

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(summary.results[0]).toEqual(
      expect.objectContaining({ ruleKey: 'zimra_overdue', outcome: 'error', detail: 'db down' }),
    );
  });
});
