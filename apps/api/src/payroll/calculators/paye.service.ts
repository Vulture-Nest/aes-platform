import { Injectable } from '@nestjs/common';

/**
 * A single progressive PAYE tax band, sourced from statutory config
 * (StatutoryRatesService key 'paye_bands', per currency). Bands are ordered
 * ascending by threshold and describe a progressive scale.
 *
 * Two equivalent evaluation styles are supported per band:
 *
 * - Marginal (default): `ratePct` is applied only to the portion of taxable
 *   income that falls within this band (between the previous band's `upTo` and
 *   this band's `upTo`).
 * - Quick / ready-reckoner: when `deduct` is supplied, the band's `ratePct` is
 *   applied to the WHOLE taxable income and `deduct` is subtracted, matching the
 *   "multiply by rate, subtract" tax tables published by revenue authorities.
 *   For a correctly constructed table both styles yield the same tax.
 */
export interface PayeBand {
  /**
   * Upper bound (inclusive) of taxable income for this band, in the band's
   * currency. `null` (or omitted) marks the final, open-ended top band.
   */
  upTo: number | null;
  /** Marginal tax rate for this band, as a percentage (e.g. 20 for 20%). */
  ratePct: number;
  /**
   * Optional ready-reckoner deduction: when present, tax = income * ratePct/100
   * - deduct, applied to the whole taxable income for the band the income lands
   * in. When absent, the band is evaluated marginally.
   */
  deduct?: number;
}

/** Inputs for a PAYE computation. All statutory numbers arrive as inputs. */
export interface PayeInput {
  /** Taxable income for the period, in the band table's currency. */
  taxableIncome: number;
  /** Progressive band table for the relevant currency, from config. */
  bands: PayeBand[];
}

/** Inputs for the AIDS levy computation. */
export interface AidsLevyInput {
  /** PAYE tax the levy is charged on. */
  paye: number;
  /** AIDS levy rate as a percentage. Defaults to 3. */
  aidsLevyPct?: number;
}

/** The statutory AIDS levy default rate, as a percentage. */
const DEFAULT_AIDS_LEVY_PCT = 3;

/**
 * Pure PAYE (Pay As You Earn) statutory calculator.
 *
 * Progressive income tax over a configurable band table plus the AIDS levy.
 * No Prisma, no I/O, plain-number math only: every statutory rate and band is
 * supplied by the caller (read from StatutoryRatesService upstream) so nothing
 * jurisdiction-specific is hardcoded here. Money results are rounded to 2dp.
 */
@Injectable()
export class PayeService {
  /**
   * Round a monetary amount to 2 decimal places (half-up on the scaled value),
   * guarding against negative-zero output.
   */
  private round2(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded === 0 ? 0 : rounded;
  }

  /**
   * Compute PAYE tax for a taxable income against a progressive band table.
   *
   * Non-positive income yields zero tax. Bands are evaluated in the order given
   * (expected ascending by `upTo`, with a single open-ended top band whose
   * `upTo` is null/undefined). If any matching band carries a `deduct`, the
   * ready-reckoner form is used (income * ratePct/100 - deduct); otherwise the
   * tax is accumulated marginally across bands.
   *
   * @returns PAYE tax, rounded to 2dp, never negative.
   */
  compute({ taxableIncome, bands }: PayeInput): number {
    if (!Number.isFinite(taxableIncome) || taxableIncome <= 0 || bands.length === 0) {
      return 0;
    }

    // Ready-reckoner path: find the band the income lands in and apply
    // rate-then-deduct against the whole income.
    const quickBand = this.bandFor(taxableIncome, bands);
    if (quickBand && quickBand.deduct !== undefined) {
      const tax = (taxableIncome * quickBand.ratePct) / 100 - quickBand.deduct;
      return this.round2(Math.max(0, tax));
    }

    // Marginal path: tax each slice of income at its band's rate.
    let tax = 0;
    let lowerBound = 0;
    for (const band of bands) {
      if (taxableIncome <= lowerBound) {
        break;
      }
      const upper = band.upTo ?? Number.POSITIVE_INFINITY;
      const sliceTop = Math.min(taxableIncome, upper);
      const sliceWidth = sliceTop - lowerBound;
      if (sliceWidth > 0) {
        tax += (sliceWidth * band.ratePct) / 100;
      }
      lowerBound = upper;
    }
    return this.round2(Math.max(0, tax));
  }

  /**
   * The band a given taxable income falls into: the first band whose `upTo`
   * (inclusive) is at least the income, or the open-ended top band. Returns
   * undefined only for an empty table.
   */
  private bandFor(taxableIncome: number, bands: PayeBand[]): PayeBand | undefined {
    for (const band of bands) {
      if (band.upTo === null || band.upTo === undefined || taxableIncome <= band.upTo) {
        return band;
      }
    }
    return bands[bands.length - 1];
  }

  /**
   * AIDS levy charged on PAYE tax: paye * aidsLevyPct/100. The rate defaults to
   * 3%. Non-positive PAYE yields zero. Result rounded to 2dp.
   */
  aidsLevy({ paye, aidsLevyPct }: AidsLevyInput): number {
    if (!Number.isFinite(paye) || paye <= 0) {
      return 0;
    }
    const pct = aidsLevyPct ?? DEFAULT_AIDS_LEVY_PCT;
    return this.round2((paye * pct) / 100);
  }
}
