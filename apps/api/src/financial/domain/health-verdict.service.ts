import { Injectable } from '@nestjs/common';

/**
 * Appendix A — HealthVerdict (classic).
 *
 * A pure, self-contained financial-health classifier. Given the core balance
 * figures for an entity it returns one of three verdicts:
 *
 *  - ACT     : receivables + taxLiability + loanBalance exceed the cash actually
 *              received, i.e. outstanding obligations/claims outstrip the cash
 *              base — act now.
 *  - WATCH   : not in ACT territory, but receivables alone already exceed half
 *              of the cash received — keep watching.
 *  - HEALTHY : neither of the above.
 *
 * The service performs no I/O and has no dependencies; all math is on plain
 * numbers so it can be unit-tested as a golden-value regression net.
 */
export enum HealthVerdict {
  HEALTHY = 'HEALTHY',
  WATCH = 'WATCH',
  ACT = 'ACT',
}

/** Plain typed inputs for {@link HealthVerdictService.evaluate}. */
export interface HealthVerdictInput {
  receivables: number;
  taxLiability: number;
  loanBalance: number;
  totalCashReceived: number;
}

/** Result carrying the verdict plus the driver figures behind it. */
export interface HealthVerdictResult {
  verdict: HealthVerdict;
  /** receivables + taxLiability + loanBalance. */
  totalObligations: number;
  totalCashReceived: number;
  /** 0.5 * totalCashReceived — the WATCH threshold on receivables. */
  watchThreshold: number;
  receivables: number;
}

@Injectable()
export class HealthVerdictService {
  /**
   * Classify financial health from the core balance figures.
   *
   * Ordering matters: ACT is strictly stronger than WATCH, so it is checked
   * first. Both comparisons are strict `>` per the spec, so exact equality on
   * a boundary falls through to the weaker/safer verdict.
   */
  evaluate(input: HealthVerdictInput): HealthVerdictResult {
    const { receivables, taxLiability, loanBalance, totalCashReceived } = input;

    const totalObligations = receivables + taxLiability + loanBalance;
    const watchThreshold = 0.5 * totalCashReceived;

    let verdict: HealthVerdict;
    if (totalObligations > totalCashReceived) {
      verdict = HealthVerdict.ACT;
    } else if (receivables > watchThreshold) {
      verdict = HealthVerdict.WATCH;
    } else {
      verdict = HealthVerdict.HEALTHY;
    }

    return {
      verdict,
      totalObligations,
      totalCashReceived,
      watchThreshold,
      receivables,
    };
  }
}
