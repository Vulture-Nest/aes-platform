import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HealthVerdict, HealthVerdictService } from '../../financial/domain/health-verdict.service';
import { LoanInterestService } from '../../financial/domain/loan-interest.service';
import { TaxLedgerConsolidationService } from '../../financial/domain/tax-ledger-consolidation.service';
import { ExchangeRatesService } from '../../reference/exchange-rates/exchange-rates.service';
import { RateType } from '../../reference/exchange-rates/rate-type.enum';
import { PrismaService } from '../../prisma/prisma.service';

/** Currency pair used to convert ZWG amounts into a USD equivalent. */
const USD_ZWG_PAIR = 'USD/ZWG';

/**
 * VAT rate applied to order value when ageing receivables. Receivables are the
 * VAT-inclusive invoice balance a client still owes (order value + VAT − cash
 * received), matching the operational cashflow workbook's "Outstanding" column.
 */
const VAT_RATE = 0.155;

/** Prisma.Decimal | number | null | undefined -> number (guards nulls). */
function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === 'number' ? value : value.toNumber();
}

/** Parse an exchange-rate string; returns 0 when unparseable. */
function parseRate(rate: string | null | undefined): number {
  if (!rate) {
    return 0;
  }
  const n = Number(rate);
  return Number.isFinite(n) ? n : 0;
}

/** Round a monetary value to 2 decimal places, avoiding negative-zero. */
function round2(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/** Parameters accepted by the health-verdict panel. */
export interface HealthVerdictParams {
  /** "As of" instant for FX rate lookups + loan interest accrual. Defaults to now. */
  asOf?: Date;
}

/** The four A.8 driver figures, each already normalised to a USD equivalent. */
export interface HealthVerdictDrivers {
  /** Outstanding order value owed to the business (valueExVat - receipts, floored at 0). */
  receivables: number;
  /** Net tax owed: tax ledger + other tax debt + open ZIMRA assessments. */
  taxLiability: number;
  /** Outstanding balance across active loans (principal + accrued interest - repayments). */
  loanBalance: number;
  /** Cash actually received against orders (the A.8 cash base). */
  totalCashReceived: number;
}

/** Typed result returned by the health-verdict panel. */
export interface HealthVerdictPanelResult {
  panel: 'health_verdict';
  asOf: string;
  /** The classic A.8 verdict: ACT | WATCH | HEALTHY. */
  verdict: HealthVerdict;
  /** The four driver figures fed into HealthVerdictService.evaluate. */
  drivers: HealthVerdictDrivers;
  /** receivables + taxLiability + loanBalance (the total obligations base). */
  totalObligations: number;
  /** 0.5 * totalCashReceived — the WATCH threshold on receivables. */
  watchThreshold: number;
  /** The USD/ZWG OFFICIAL rate used to normalise ZWG amounts (0 when unavailable). */
  fxRate: number;
}

/**
 * Command Centre — Panel 8: Health verdict.
 *
 * Read-only. Computes the four Appendix A.8 driver figures from current data —
 * receivables, tax liability, loan balance and total cash received — normalises
 * every amount to a USD equivalent at the OFFICIAL rate, and runs them through the
 * pure {@link HealthVerdictService} to obtain the classic ACT/WATCH/HEALTHY verdict.
 *
 * The panel performs no writes. It handles empty data (every driver defaults to 0,
 * which yields HEALTHY) and never divides by zero: a missing/zero FX rate simply
 * contributes 0 for the ZWG portion rather than failing the panel.
 *
 * A time-windowed successor (verdict computed over a rolling window) is intentionally
 * left as a follow-up; this panel is the classic, point-in-time A.8 verdict.
 */
@Injectable()
export class HealthVerdictPanelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly healthVerdict: HealthVerdictService,
    private readonly loanInterest: LoanInterestService,
    private readonly taxConsolidation: TaxLedgerConsolidationService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  async compute(params: HealthVerdictParams = {}): Promise<HealthVerdictPanelResult> {
    const asOf = params.asOf ?? new Date();
    const fxRate = await this.officialRate(asOf);

    const [receivables, totalCashReceived] = await this.receivablesAndCash(fxRate);
    const taxLiability = await this.taxLiability(asOf, fxRate);
    const loanBalance = await this.loanBalance(asOf, fxRate);

    const drivers: HealthVerdictDrivers = {
      receivables,
      taxLiability,
      loanBalance,
      totalCashReceived,
    };

    const result = this.healthVerdict.evaluate(drivers);

    return {
      panel: 'health_verdict',
      asOf: asOf.toISOString(),
      verdict: result.verdict,
      drivers,
      totalObligations: round2(result.totalObligations),
      watchThreshold: round2(result.watchThreshold),
      fxRate,
    };
  }

  /** USD equivalent of an amount in `currency` at the given USD/ZWG rate (guarded /0). */
  private toUsd(amount: number, currency: string, rate: number): number {
    if (currency === 'USD') {
      return amount;
    }
    // ZWG -> USD: divide by the USD/ZWG rate. A missing/zero rate contributes 0.
    return rate > 0 ? amount / rate : 0;
  }

  /** Look up the USD/ZWG OFFICIAL rate for `asOf`; returns 0 when none is configured. */
  private async officialRate(asOf: Date): Promise<number> {
    try {
      const row = await this.exchangeRates.rateAsOf(USD_ZWG_PAIR, asOf, RateType.OFFICIAL);
      return parseRate(row.rate);
    } catch {
      // No rate on/before asOf — treat as unavailable rather than failing the panel.
      return 0;
    }
  }

  /**
   * Receivables (the VAT-inclusive order balance clients still owe) and the total
   * cash received against orders — both normalised to USD. Computed in one pass
   * over orders and their receipts.
   *
   * Receivables = Σ (order value incl VAT − cash received). This mirrors the
   * operational cashflow workbook's "Outstanding" column: the amount owed is the
   * VAT-inclusive invoice total, and per-order over-collections (rare) net against
   * the portfolio rather than being floored, so the total reflects the true net
   * cash still expected in.
   */
  private async receivablesAndCash(fxRate: number): Promise<[number, number]> {
    const orders = await this.prisma.order.findMany({
      select: {
        valueExVat: true,
        currency: true,
        receipts: { select: { amount: true, currency: true } },
      },
    });

    let receivables = 0;
    let totalCashReceived = 0;

    for (const order of orders) {
      const receivedForOrder = order.receipts.reduce(
        (sum, r) => sum + this.toUsd(num(r.amount), r.currency, fxRate),
        0,
      );
      totalCashReceived += receivedForOrder;

      const valueInclVat = this.toUsd(num(order.valueExVat), order.currency, fxRate) * (1 + VAT_RATE);
      receivables += valueInclVat - receivedForOrder;
    }

    return [round2(receivables), round2(totalCashReceived)];
  }

  /**
   * Net tax liability in USD, mirroring the operational cashflow workbook's
   * TOTAL TAX LIABILITY:
   *  - consolidated tax-ledger balances (amountDue − amountPaid) — this is where
   *    the import lands NET VAT PAYABLE and NET PAYE PAYABLE;
   *  - each brought-forward tax debt's outstanding balance (principal + accrued
   *    overdue interest − paid) PLUS its accrued interest again (the workbook
   *    surfaces overdue interest as its own line on top of the balance);
   *  - open ZIMRA assessed amounts.
   *
   * Negative per-line tax-ledger balances (over-paid tax) are floored at 0 so a
   * credit on one head does not offset a genuine obligation elsewhere. Overdue
   * interest accrues at the debt's own rate up to `asOf`.
   */
  private async taxLiability(asOf: Date, fxRate: number): Promise<number> {
    const [ledger, otherDebts, assessments] = await Promise.all([
      this.prisma.taxLedger.findMany({
        select: { amountDue: true, amountPaid: true, currency: true },
      }),
      this.prisma.otherTaxDebt.findMany({
        select: { principal: true, paidToDate: true, ratePct: true, dueDate: true, currency: true },
      }),
      this.prisma.zimraAssessment.findMany({
        select: { assessedAmount: true, currency: true },
      }),
    ]);

    let liability = 0;

    for (const row of ledger) {
      const net = num(row.amountDue) - num(row.amountPaid);
      if (net > 0) {
        liability += this.toUsd(net, row.currency, fxRate);
      }
    }
    for (const debt of otherDebts) {
      const principal = num(debt.principal);
      if (principal <= 0) {
        continue;
      }
      const daysOverdue = this.daysOverdue(debt.dueDate, asOf);
      const { interest } = this.taxConsolidation.interestForDebt({
        id: 'other-tax-debt',
        principal,
        zimraRatePct: num(debt.ratePct),
        daysOverdue,
      });
      // Balance outstanding = principal + interest − paid; the overdue interest is
      // then surfaced again as its own liability line (matching the workbook).
      const balance = principal + interest - num(debt.paidToDate);
      const contribution = Math.max(0, balance) + interest;
      liability += this.toUsd(contribution, debt.currency, fxRate);
    }
    for (const a of assessments) {
      const assessed = num(a.assessedAmount);
      if (assessed > 0) {
        liability += this.toUsd(assessed, a.currency, fxRate);
      }
    }

    return round2(liability);
  }

  /** Whole days a debt is overdue at `asOf` (0 before/on the due date). */
  private daysOverdue(dueDate: Date, asOf: Date): number {
    const ms = asOf.getTime() - dueDate.getTime();
    if (ms <= 0) {
      return 0;
    }
    return Math.floor(ms / (24 * 60 * 60 * 1000));
  }

  /**
   * Outstanding loan balance in USD across ACTIVE loans: principal + accrued interest
   * (via the pure LoanInterestService) less repayments to date, floored at 0 per loan.
   */
  private async loanBalance(asOf: Date, fxRate: number): Promise<number> {
    const loans = await this.prisma.loan.findMany({
      where: { status: 'ACTIVE' },
      select: {
        principal: true,
        currency: true,
        weeklyRatePct: true,
        startDate: true,
        repayments: { select: { amount: true, currency: true } },
      },
    });

    let balance = 0;

    for (const loan of loans) {
      const principal = num(loan.principal);
      const weeklyRate = num(loan.weeklyRatePct) / 100;
      const accrued = this.loanInterest.accruedInterest({
        principal,
        weeklyRate,
        startDate: loan.startDate,
        asOfDate: asOf,
      });

      // Loan amounts are in the loan's own currency; convert to USD.
      const repaid = loan.repayments.reduce(
        (sum, r) => sum + this.toUsd(num(r.amount), r.currency, fxRate),
        0,
      );
      const totalDueUsd = this.toUsd(principal + accrued, loan.currency, fxRate);
      const outstanding = totalDueUsd - repaid;
      if (outstanding > 0) {
        balance += outstanding;
      }
    }

    return round2(balance);
  }
}
