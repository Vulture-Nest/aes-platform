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
    payrollRun: { findMany: jest.fn().mockResolvedValue([]) },
    pettyCashFloat: { findMany: jest.fn().mockResolvedValue([]) },
    pettyCashTxn: { findMany: jest.fn().mockResolvedValue([]) },
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
    rules.listEnabled.mockResolvedValue([rule('some_future_rule', {}, AlertSeverity.WATCH)]);

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(summary.rulesEvaluated).toBe(1);
    expect(summary.alertsRaised).toBe(0);
    expect(summary.results[0]).toEqual(
      expect.objectContaining({ ruleKey: 'some_future_rule', outcome: 'skipped' }),
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

  // ---------------------------------------------------------------------------
  // payroll_coverage (G8)
  // ---------------------------------------------------------------------------
  it('raises payroll_coverage DANGER when next payroll cost exceeds liquid cash', async () => {
    const { engine, rules, alerts, ledger, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([
      rule('payroll_coverage', { statuses: ['DRAFT', 'CHECKED', 'APPROVED'] }),
    ]);
    ledger.cashPosition.mockResolvedValue({ accounts: [], totals: { USD: 5000, ZWG: 0 } });
    // company cost = gross + nssaEr + zimdef + nec + mipf = 8000 + 400 + 40 + 100 + 60 = 8600 > 5000.
    prisma.payrollRun.findMany.mockResolvedValue([
      {
        id: 'run1',
        status: 'APPROVED',
        lines: [
          { gross: dec(8000), nssaEr: dec(400), zimdef: dec(40), nec: dec(100), mipf: dec(60) },
        ],
      },
    ]);

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(prisma.payrollRun.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: { in: ['DRAFT', 'CHECKED', 'APPROVED'] } },
      }),
    );
    expect(alerts.raiseOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleKey: 'payroll_coverage',
        severity: AlertSeverity.DANGER,
        payload: expect.objectContaining({
          payrollTotal: 8600,
          liquidCash: 5000,
          shortfall: 3600,
        }),
      }),
    );
    expect(summary.alertsRaised).toBe(1);
  });

  it('clears payroll_coverage when liquid cash covers the next payroll', async () => {
    const { engine, rules, alerts, ledger, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([rule('payroll_coverage', {})]);
    ledger.cashPosition.mockResolvedValue({ accounts: [], totals: { USD: 10000, ZWG: 0 } });
    prisma.payrollRun.findMany.mockResolvedValue([
      {
        id: 'run1',
        status: 'DRAFT',
        lines: [{ gross: dec(5000), nssaEr: dec(0), zimdef: dec(0), nec: dec(0), mipf: dec(0) }],
      },
    ]);

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(alerts.raiseOrRefresh).not.toHaveBeenCalled();
    expect(alerts.resolve).toHaveBeenCalledWith('payroll_coverage');
    expect(summary.results[0].outcome).toBe('clear');
  });

  it('clears payroll_coverage when there is no upcoming payroll', async () => {
    const { engine, rules, alerts, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([rule('payroll_coverage', {})]);
    prisma.payrollRun.findMany.mockResolvedValue([]);

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(alerts.raiseOrRefresh).not.toHaveBeenCalled();
    expect(alerts.resolve).toHaveBeenCalledWith('payroll_coverage');
    expect(summary.results[0].outcome).toBe('clear');
  });

  // ---------------------------------------------------------------------------
  // petty_cash_variance (G8)
  // ---------------------------------------------------------------------------
  it('raises petty_cash_variance WATCH for each locked float (deduped by subjectId)', async () => {
    const { engine, rules, alerts, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([
      rule('petty_cash_variance', {}, AlertSeverity.WATCH),
    ]);
    prisma.pettyCashFloat.findMany.mockResolvedValue([
      {
        id: 'f1',
        floatAmount: dec(300),
        currency: 'USD',
        siteId: 's1',
        custodianUserId: 'u1',
        locked: true,
      },
    ]);

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(prisma.pettyCashFloat.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { locked: true } }),
    );
    expect(alerts.raiseOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleKey: 'petty_cash_variance',
        severity: AlertSeverity.WATCH,
        subjectTable: 'petty_cash_floats',
        subjectId: 'f1',
      }),
    );
    expect(summary.alertsRaised).toBe(1);
  });

  it('clears petty_cash_variance when no floats are locked', async () => {
    const { engine, rules, alerts, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([
      rule('petty_cash_variance', {}, AlertSeverity.WATCH),
    ]);
    prisma.pettyCashFloat.findMany.mockResolvedValue([]);

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(alerts.raiseOrRefresh).not.toHaveBeenCalled();
    expect(alerts.resolve).toHaveBeenCalledWith('petty_cash_variance');
    expect(summary.results[0].outcome).toBe('clear');
  });

  // ---------------------------------------------------------------------------
  // concentration_risk (G8)
  // ---------------------------------------------------------------------------
  it('raises concentration_risk WATCH when a client exceeds the watchPct share', async () => {
    const { engine, rules, alerts, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([
      rule('concentration_risk', { watchPct: 0.4 }, AlertSeverity.WATCH),
    ]);
    // Client A open 900, Client B open 100 => A share 0.9 > 0.4.
    prisma.order.findMany.mockResolvedValue([
      {
        clientId: 'A',
        client: { id: 'A', name: 'Acme' },
        valueExVat: dec(1000),
        receipts: [{ amount: dec(100) }],
      },
      {
        clientId: 'B',
        client: { id: 'B', name: 'Beta' },
        valueExVat: dec(100),
        receipts: [],
      },
    ]);

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(alerts.raiseOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleKey: 'concentration_risk',
        severity: AlertSeverity.WATCH,
        subjectTable: 'clients',
        subjectId: 'A',
        payload: expect.objectContaining({ clientOpen: 900, totalOpen: 1000, pct: 0.9 }),
      }),
    );
    expect(summary.alertsRaised).toBe(1);
  });

  it('clears concentration_risk when the top client is within the watchPct threshold', async () => {
    const { engine, rules, alerts, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([
      rule('concentration_risk', { watchPct: 0.4 }, AlertSeverity.WATCH),
    ]);
    // Even split: each client 0.5? No — pick 300/300/400 so top share 0.4 (not > 0.4).
    prisma.order.findMany.mockResolvedValue([
      { clientId: 'A', client: { id: 'A', name: 'A' }, valueExVat: dec(300), receipts: [] },
      { clientId: 'B', client: { id: 'B', name: 'B' }, valueExVat: dec(300), receipts: [] },
      { clientId: 'C', client: { id: 'C', name: 'C' }, valueExVat: dec(400), receipts: [] },
    ]);

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(alerts.raiseOrRefresh).not.toHaveBeenCalled();
    expect(alerts.resolve).toHaveBeenCalledWith('concentration_risk');
    expect(summary.results[0].outcome).toBe('clear');
  });

  // ---------------------------------------------------------------------------
  // conversion_loss (G8)
  // ---------------------------------------------------------------------------
  it('raises conversion_loss WATCH when period loss share exceeds watchPct', async () => {
    const { engine, rules, alerts, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([
      rule('conversion_loss', { watchPct: 0.1, periodDays: 30 }, AlertSeverity.WATCH),
    ]);
    // Two legs: variance -15 and -10 => cumulative loss 25 on volume 100 => 25% > 10%.
    prisma.pettyCashTxn.findMany.mockResolvedValue([
      { amount: dec(50), varianceVsOfficial: dec(-15) },
      { amount: dec(50), varianceVsOfficial: dec(-10) },
    ]);

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(prisma.pettyCashTxn.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { in: ['CONVERSION_OUT', 'CONVERSION_IN'] },
        }),
      }),
    );
    expect(alerts.raiseOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleKey: 'conversion_loss',
        severity: AlertSeverity.WATCH,
        payload: expect.objectContaining({ cumulativeLoss: 25, convertedVolume: 100, lossPct: 0.25 }),
      }),
    );
    expect(summary.alertsRaised).toBe(1);
  });

  it('clears conversion_loss when the loss share is within watchPct', async () => {
    const { engine, rules, alerts, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([
      rule('conversion_loss', { watchPct: 0.1, periodDays: 30 }, AlertSeverity.WATCH),
    ]);
    // Loss 5 on volume 100 => 5% < 10%.
    prisma.pettyCashTxn.findMany.mockResolvedValue([
      { amount: dec(100), varianceVsOfficial: dec(-5) },
    ]);

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(alerts.raiseOrRefresh).not.toHaveBeenCalled();
    expect(alerts.resolve).toHaveBeenCalledWith('conversion_loss');
    expect(summary.results[0].outcome).toBe('clear');
  });

  it('respects a minLossUsd absolute threshold for conversion_loss', async () => {
    const { engine, rules, alerts, prisma } = makeEngine();
    rules.listEnabled.mockResolvedValue([
      rule('conversion_loss', { minLossUsd: 50, watchPct: 0.1 }, AlertSeverity.WATCH),
    ]);
    // Loss 30 (< 50 absolute) even though share high => no alert.
    prisma.pettyCashTxn.findMany.mockResolvedValue([
      { amount: dec(40), varianceVsOfficial: dec(-30) },
    ]);

    const summary = await engine.evaluate(new Date('2026-07-19'));

    expect(alerts.raiseOrRefresh).not.toHaveBeenCalled();
    expect(summary.results[0].outcome).toBe('clear');
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
