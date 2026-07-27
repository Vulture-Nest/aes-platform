import { Injectable } from '@nestjs/common';
import { StatutoryRatesService } from '../../reference/statutory-rates/statutory-rates.service';

/**
 * G19 (spec §16.4) — corporate income-tax PROVISION estimate.
 *
 * A purely INFORMATIONAL figure surfaced next to operating profit so the health
 * view is not flattered by an unrecognised tax cost. It is deliberately NOT folded
 * into the parity'd "total tax liability" nor the A.8 ACT thresholds — the classic
 * verdict and the migration-parity checks are unaffected.
 *
 *   provision = max(0, operatingProfit) × (incomeTaxRate + aidsLevyRate)
 *
 * where the two statutory rates come from effective-dated config:
 *   income_tax_pct  (default 0.25)   — corporate income-tax rate
 *   aids_levy_pct   (reused)         — AIDS levy rate
 *
 * Both keys are normalised to fractions so either a fraction (0.25) or a percentage
 * (25) stored convention resolves correctly. The provision is floored at 0 (no tax
 * on a loss).
 */

/** Statutory keys read by the provision estimate. */
const KEY_INCOME_TAX_PCT = 'income_tax_pct';
const KEY_AIDS_LEVY_PCT = 'aids_levy_pct';

/** Defaults (Zimbabwe) when no configured rate exists (unseeded reference table). */
const DEFAULT_INCOME_TAX_FRACTION = 0.25;
const DEFAULT_AIDS_LEVY_FRACTION = 0.03;

/** The G19 income-tax provision estimate line. */
export interface IncomeTaxProvision {
  /** Always true — an ESTIMATE, never a filed/assessed liability. */
  estimate: true;
  currency: string;
  /** Operating profit the estimate is based on (floored at zero). */
  operatingProfit: number;
  /** Corporate income-tax rate applied (fraction, e.g. 0.25). */
  incomeTaxRate: number;
  /** AIDS levy rate applied (fraction, e.g. 0.03). */
  aidsLevyRate: number;
  /** Combined rate = incomeTaxRate + aidsLevyRate (fraction). */
  combinedRate: number;
  /** provision = max(0, operatingProfit) × combinedRate, floored at 0. */
  provision: number;
  /** Human note reinforcing that this is an estimate excluded from the health verdict. */
  note: string;
}

@Injectable()
export class IncomeTaxProvisionService {
  constructor(private readonly statutoryRates: StatutoryRatesService) {}

  private round2(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded === 0 ? 0 : rounded;
  }

  private num(value: { toNumber?: () => number } | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return typeof value === 'number' ? value : Number(value);
  }

  /**
   * Read a statutory rate as a FRACTION. A stored value > 1 is treated as a percentage
   * and divided by 100; a value in (0, 1] is already a fraction. Falls back to
   * `fallbackFraction` on any absence/zero. Never throws.
   */
  private async rateFraction(key: string, asOf: Date, fallbackFraction: number): Promise<number> {
    try {
      const row = await this.statutoryRates.valueAsOf(key, asOf);
      const value = this.num(row.value);
      if (value <= 0) {
        return fallbackFraction;
      }
      return value > 1 ? value / 100 : value;
    } catch {
      return fallbackFraction;
    }
  }

  /**
   * Compute the income-tax provision estimate for a given operating profit.
   * Statutory rates are resolved effective on `asOf`.
   */
  async estimate(
    operatingProfitInput: number,
    asOf: Date = new Date(),
    currency = 'USD',
  ): Promise<IncomeTaxProvision> {
    const [incomeTaxRate, aidsLevyRate] = await Promise.all([
      this.rateFraction(KEY_INCOME_TAX_PCT, asOf, DEFAULT_INCOME_TAX_FRACTION),
      this.rateFraction(KEY_AIDS_LEVY_PCT, asOf, DEFAULT_AIDS_LEVY_FRACTION),
    ]);

    const operatingProfit = Math.max(0, this.round2(operatingProfitInput));
    const combinedRate = incomeTaxRate + aidsLevyRate;
    const provision = this.round2(Math.max(0, operatingProfit * combinedRate));

    const pctLabel = (f: number) => `${this.round2(f * 100)}%`;

    return {
      estimate: true,
      currency,
      operatingProfit,
      incomeTaxRate,
      aidsLevyRate,
      combinedRate: this.round2(combinedRate),
      provision,
      note:
        `ESTIMATE only: ${pctLabel(incomeTaxRate)} income tax + ${pctLabel(aidsLevyRate)} AIDS levy ` +
        'on operating profit. Informational — excluded from the health verdict and total tax liability.',
    };
  }
}
