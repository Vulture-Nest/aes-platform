import { Injectable } from '@nestjs/common';

/**
 * Inputs for a single NSSA (National Social Security Authority) contribution
 * calculation. All statutory figures are passed in as INPUTS — nothing is
 * hardcoded here. Percentages are expressed as whole-number percents
 * (e.g. `4.5` means 4.5%).
 */
export interface NssaInput {
  /** Employee's insurable earnings for the period. */
  insurableEarnings: number;
  /** Statutory insurable-earnings ceiling for the period. */
  ceiling: number;
  /** Employee contribution rate, as a percentage (e.g. 4.5 => 4.5%). */
  eePct: number;
  /** Employer contribution rate, as a percentage (e.g. 4.5 => 4.5%). */
  erPct: number;
}

/**
 * Result of an NSSA contribution calculation. Both values are rounded to
 * 2 decimal places (money).
 */
export interface NssaResult {
  /** Employee contribution. */
  employee: number;
  /** Employer contribution. */
  employer: number;
}

/**
 * Pure NSSA contribution calculator.
 *
 * Contributions are computed on the *capped* insurable earnings, i.e.
 * `min(insurableEarnings, ceiling)`, multiplied by the respective rate.
 *
 * This service performs NO I/O and has NO dependencies — all statutory
 * rates and the ceiling are supplied by the caller so the maths stays
 * deterministic and table-testable.
 */
@Injectable()
export class NssaService {
  compute({ insurableEarnings, ceiling, eePct, erPct }: NssaInput): NssaResult {
    const cappedEarnings = Math.min(insurableEarnings, ceiling);

    return {
      employee: this.round2((cappedEarnings * eePct) / 100),
      employer: this.round2((cappedEarnings * erPct) / 100),
    };
  }

  /** Round a monetary amount to 2 decimal places. */
  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
