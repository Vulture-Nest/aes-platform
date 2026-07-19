import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { HealthVerdict, HealthVerdictService } from '../../financial/domain/health-verdict.service';
import { LoanInterestService } from '../../financial/domain/loan-interest.service';
import { ExchangeRatesService } from '../../reference/exchange-rates/exchange-rates.service';
import { RateType } from '../../reference/exchange-rates/rate-type.enum';
import { PrismaService } from '../../prisma/prisma.service';

/** Currency pair used to convert ZWG amounts into a USD equivalent. */
const USD_ZWG_PAIR = 'USD/ZWG';

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
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  async compute(params: HealthVerdictParams = {}): Promise<HealthVerdictPanelResult> {
    const asOf = params.asOf ?? new Date();
    const fxRate = await this.officialRate(asOf);

    const [receivables, totalCashReceived] = await this.receivablesAndCash(fxRate);
    const taxLiability = await this.taxLiability(fxRate);
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
   * Receivables (outstanding order value owed to us, floored at 0 per order) and the
   * total cash received against orders — both normalised to USD. Computed in one pass
   * over orders and their receipts.
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

      const value = this.toUsd(num(order.valueExVat), order.currency, fxRate);
      const outstanding = value - receivedForOrder;
      if (outstanding > 0) {
        receivables += outstanding;
      }
    }

    return [round2(receivables), round2(totalCashReceived)];
  }

  /**
   * Net tax liability in USD: unpaid tax-ledger balances (amountDue - amountPaid),
   * other outstanding tax debt principal, and open ZIMRA assessed amounts. Negative
   * per-line balances (over-paid tax) are floored at 0 so a credit on one line does
   * not offset a genuine obligation elsewhere.
   */
  private async taxLiability(fxRate: number): Promise<number> {
    const [ledger, otherDebts, assessments] = await Promise.all([
      this.prisma.taxLedger.findMany({
        select: { amountDue: true, amountPaid: true, currency: true },
      }),
      this.prisma.otherTaxDebt.findMany({ select: { principal: true, currency: true } }),
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
      if (principal > 0) {
        liability += this.toUsd(principal, debt.currency, fxRate);
      }
    }
    for (const a of assessments) {
      const assessed = num(a.assessedAmount);
      if (assessed > 0) {
        liability += this.toUsd(assessed, a.currency, fxRate);
      }
    }

    return round2(liability);
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
