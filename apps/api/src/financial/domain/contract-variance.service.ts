import { Injectable } from '@nestjs/common';

/**
 * Lifecycle status of a contract derived purely from its date window
 * relative to an "as of" evaluation date.
 */
export enum ContractStatus {
  Upcoming = 'Upcoming',
  Active = 'Active',
  Completed = 'Completed',
}

/**
 * Plain inputs for a contract-variance computation. All money values are plain
 * numbers (already normalised to a single currency by the caller); dates are
 * plain Date instances.
 */
export interface ContractVarianceInput {
  /** Contract value excluding VAT, in the contract's currency. */
  valueExVat: number;
  /** Inclusive contract start date. */
  startDate: Date;
  /** Inclusive contract end date (must be on/after startDate). */
  endDate: Date;
  /** Total amount invoiced to the client so far. */
  invoicedToDate: number;
  /** Evaluation ("as of") date used to derive elapsed months and status. */
  asOf: Date;
}

/**
 * Computed variance result. `variance` is positive when the contractor has
 * over-claimed (invoiced more than the straight-line schedule permits) — a
 * "red" condition worth flagging.
 */
export interface ContractVarianceResult {
  /** Whole calendar months from start to end inclusive (never below 1). */
  contractMonths: number;
  /** Straight-line budget per month = valueExVat / contractMonths. */
  monthlyBudget: number;
  /** Months elapsed as of `asOf`, floored at 0 and capped at contractMonths. */
  monthsElapsed: number;
  /** Amount that should have been invoiced by now = monthlyBudget * monthsElapsed. */
  shouldHaveInvoiced: number;
  /** invoicedToDate - shouldHaveInvoiced (positive = over-claimed = red). */
  variance: number;
  /** Whether the contract is over-claimed beyond the tolerance band. */
  isOverClaimed: boolean;
  /** Lifecycle status derived from `asOf` vs the contract window. */
  status: ContractStatus;
}

/** Tolerance band (in currency units) for treating variance as material. */
const VARIANCE_TOLERANCE = 0.01;

@Injectable()
export class ContractVarianceService {
  /**
   * Whole calendar months from `start` to `end` inclusive.
   *
   * A contract that starts and ends within the same calendar month spans one
   * month; each additional calendar month boundary adds one. The result is
   * floored at 1 so a valid window always yields a usable divisor.
   */
  contractMonths(start: Date, end: Date): number {
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
    return Math.max(1, months);
  }

  /**
   * Whole calendar months elapsed from `start` up to `asOf`, floored at 0
   * (before the contract begins) and capped at `contractMonths` (after it ends).
   */
  monthsElapsed(start: Date, asOf: Date, contractMonths: number): number {
    if (asOf < start) {
      return 0;
    }
    const elapsed =
      (asOf.getFullYear() - start.getFullYear()) * 12 + (asOf.getMonth() - start.getMonth()) + 1;
    return Math.min(contractMonths, Math.max(0, elapsed));
  }

  /**
   * Lifecycle status of the contract relative to `asOf`. Dates before `start`
   * are Upcoming, on/after `end` (once the window closes) are Completed, and
   * everything in between is Active.
   */
  status(start: Date, end: Date, asOf: Date): ContractStatus {
    if (asOf < start) {
      return ContractStatus.Upcoming;
    }
    if (asOf > end) {
      return ContractStatus.Completed;
    }
    return ContractStatus.Active;
  }

  /**
   * Compute the full straight-line variance for a contract as of a given date.
   * Pure: no I/O, no rounding beyond the explicit tolerance comparison.
   */
  compute(input: ContractVarianceInput): ContractVarianceResult {
    const { valueExVat, startDate, endDate, invoicedToDate, asOf } = input;
    const contractMonths = this.contractMonths(startDate, endDate);
    const monthlyBudget = valueExVat / contractMonths;
    const monthsElapsed = this.monthsElapsed(startDate, asOf, contractMonths);
    const shouldHaveInvoiced = monthlyBudget * monthsElapsed;
    const variance = invoicedToDate - shouldHaveInvoiced;
    // Round variance to cents before the tolerance comparison so floating-point
    // noise (e.g. 6000.01 - 6000 === 0.0100000000002) doesn't spuriously trip
    // the "over-claimed" flag exactly at the tolerance boundary.
    const varianceCents = Math.round(variance * 100) / 100;
    return {
      contractMonths,
      monthlyBudget,
      monthsElapsed,
      shouldHaveInvoiced,
      variance,
      isOverClaimed: varianceCents > VARIANCE_TOLERANCE,
      status: this.status(startDate, endDate, asOf),
    };
  }
}
