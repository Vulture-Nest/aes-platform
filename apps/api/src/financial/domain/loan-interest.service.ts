import { Injectable } from '@nestjs/common';

/**
 * Interest accrual method for a loan.
 *
 * - FLAT_ON_PRINCIPAL: interest always accrues on the original principal,
 *   regardless of repayments made (the default).
 * - REDUCING_BALANCE: interest accrues on the outstanding principal, i.e. the
 *   principal net of principal amounts already repaid, so repayments reduce the
 *   base on which future interest is charged.
 */
export enum InterestMethod {
  FLAT_ON_PRINCIPAL = 'FLAT_ON_PRINCIPAL',
  REDUCING_BALANCE = 'REDUCING_BALANCE',
}

/** Number of days in the weekly interest period. */
const DAYS_PER_WEEK = 7;

/** Balances at or below this (absolute) USD amount are treated as settled. */
const SETTLEMENT_TOLERANCE = 0.01;

/** Inputs describing a loan for an accrual/settlement computation. */
export interface LoanInterestInput {
  /** Original loan principal, in USD. */
  principal: number;
  /** Interest rate charged per week, as a fraction (e.g. 0.05 for 5% / week). */
  weeklyRate: number;
  /** Loan start date (interest begins accruing from this date). */
  startDate: Date;
  /** The "as of" date to compute accrual up to (typically today). */
  asOfDate: Date;
  /** Total repaid in USD. Defaults to 0. */
  repaidUsd?: number;
  /** Total repaid in ZiG. Converted to USD via officialRate. Defaults to 0. */
  repaidZig?: number;
  /** Official ZiG -> USD rate (USD per 1 ZiG). Required when repaidZig > 0. */
  officialRate?: number;
  /** Accrual method. Defaults to FLAT_ON_PRINCIPAL. */
  method?: InterestMethod;
  /**
   * Principal already repaid, in USD, used only by REDUCING_BALANCE to shrink
   * the accrual base. Defaults to 0.
   */
  principalRepaidUsd?: number;
}

/** Result of a full loan interest / settlement computation. */
export interface LoanInterestResult {
  /** Number of days between startDate and asOfDate (0 if asOfDate < startDate). */
  elapsedDays: number;
  /** Fractional number of weeks elapsed (elapsedDays / 7). */
  weeksElapsed: number;
  /** Accrued interest (fractional, not rounded), in USD. */
  accrued: number;
  /** principal + accrued, in USD. */
  totalDue: number;
  /** repaidUsd + repaidZig / officialRate, in USD. */
  repaid: number;
  /** totalDue - repaid, in USD (may be negative when over-repaid). */
  balance: number;
  /** True when balance <= SETTLEMENT_TOLERANCE. */
  settled: boolean;
}

/**
 * Pure loan interest domain service (Appendix A: LoanInterest).
 *
 * Simple weekly interest:
 *   accrued  = base * weeklyRate * ((asOf - start) / 7 days)   [fractional]
 *   totalDue = principal + accrued
 *   repaid   = usd + zig / officialRate
 *   balance  = totalDue - repaid
 *   settled  = balance <= 0.01
 *
 * Flat-on-principal is the default; a reducing-balance flag accrues on the
 * outstanding principal instead. No I/O, no Prisma, plain numbers throughout.
 */
@Injectable()
export class LoanInterestService {
  /**
   * Whole days elapsed between two dates. Never negative: a start date in the
   * future relative to `asOf` yields 0 (no interest accrues before start).
   */
  elapsedDays(startDate: Date, asOfDate: Date): number {
    const ms = asOfDate.getTime() - startDate.getTime();
    if (ms <= 0) {
      return 0;
    }
    return Math.floor(ms / (24 * 60 * 60 * 1000));
  }

  /**
   * The accrual base for a given method: the full principal for
   * FLAT_ON_PRINCIPAL, or the principal net of principal already repaid
   * (floored at 0) for REDUCING_BALANCE.
   */
  private accrualBase(input: LoanInterestInput): number {
    const method = input.method ?? InterestMethod.FLAT_ON_PRINCIPAL;
    if (method === InterestMethod.REDUCING_BALANCE) {
      const outstanding = input.principal - (input.principalRepaidUsd ?? 0);
      return Math.max(0, outstanding);
    }
    return input.principal;
  }

  /**
   * Fractional accrued interest, in USD, for the period start..asOf.
   * accrued = base * weeklyRate * (elapsedDays / 7). Not rounded.
   */
  accruedInterest(input: LoanInterestInput): number {
    const days = this.elapsedDays(input.startDate, input.asOfDate);
    const base = this.accrualBase(input);
    return base * input.weeklyRate * (days / DAYS_PER_WEEK);
  }

  /**
   * Per-day accrual amount, in USD, used by the idempotent nightly job so that
   * summing one day's accrual over the loan life reconstructs the total.
   *
   * amount/day = base * weeklyRate / 7. Not rounded.
   */
  dailyAccrual(
    input: Pick<LoanInterestInput, 'principal' | 'weeklyRate' | 'method' | 'principalRepaidUsd'>,
  ): number {
    const base = this.accrualBase({
      principal: input.principal,
      weeklyRate: input.weeklyRate,
      method: input.method,
      principalRepaidUsd: input.principalRepaidUsd,
      // Dates are irrelevant to a per-day rate; supply epoch placeholders.
      startDate: new Date(0),
      asOfDate: new Date(0),
    });
    return (base * input.weeklyRate) / DAYS_PER_WEEK;
  }

  /**
   * Total repaid in USD terms: repaidUsd + repaidZig / officialRate.
   * When there is a ZiG repayment the officialRate must be a positive number;
   * otherwise the ZiG portion is ignored (nothing to convert / avoid /0).
   */
  repaidUsdEquivalent(
    input: Pick<LoanInterestInput, 'repaidUsd' | 'repaidZig' | 'officialRate'>,
  ): number {
    const usd = input.repaidUsd ?? 0;
    const zig = input.repaidZig ?? 0;
    const rate = input.officialRate ?? 0;
    if (zig <= 0 || rate <= 0) {
      return usd;
    }
    return usd + zig / rate;
  }

  /** True when the outstanding balance is within the settlement tolerance. */
  isSettled(balance: number): boolean {
    return balance <= SETTLEMENT_TOLERANCE;
  }

  /**
   * Full computation: elapsed days/weeks, accrued interest, total due, repaid
   * USD-equivalent, balance and settled flag.
   */
  compute(input: LoanInterestInput): LoanInterestResult {
    const elapsedDays = this.elapsedDays(input.startDate, input.asOfDate);
    const weeksElapsed = elapsedDays / DAYS_PER_WEEK;
    const accrued = this.accruedInterest(input);
    const totalDue = input.principal + accrued;
    const repaid = this.repaidUsdEquivalent(input);
    const balance = totalDue - repaid;
    return {
      elapsedDays,
      weeksElapsed,
      accrued,
      totalDue,
      repaid,
      balance,
      settled: this.isSettled(balance),
    };
  }
}
