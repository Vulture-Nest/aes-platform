import { Injectable } from '@nestjs/common';
import { PayeBand, PayeService } from './paye.service';

/**
 * CrossCurrencyPaye — reproduces the way the AES paysheets tax a two-currency salary.
 *
 * PAYE is NOT computed once on a single dominant-currency gross. Instead:
 *   1. Taxable income is derived per leg (USD leg and ZWG leg), each net of its own
 *      allowable deductions (NSSA + pension/MIPF + NEC on that leg).
 *   2. Both legs are rolled up to a single USD-equivalent total taxable income using the
 *      run FX rate, and PAYE is charged ONCE on that total against the USD ZIMRA bands
 *      (the paysheet's "Total Taxable / PAYE in" columns), less any tax credits.
 *   3. The net PAYE is split back to the USD and ZWG legs in proportion to each leg's
 *      share of the total taxable income, and a 3% AIDS levy is charged on each leg's PAYE.
 *
 * This yields separate USD and ZWG PAYE + AIDS-levy figures (matching the PAYE sheet's
 * independent USD and ZWL columns) while charging a single progressive scale on the whole
 * remuneration. Every band/rate is supplied as input (config), nothing is hardcoded.
 */

/** Inputs for the cross-currency PAYE computation. */
export interface CrossCurrencyPayeInput {
  /** Taxable income on the USD leg (gross USD leg less USD allowable deductions). */
  taxableUsd: number;
  /** Taxable income on the ZWG leg (gross ZWG leg less ZWG allowable deductions). */
  taxableZwg: number;
  /** ZWG per 1 USD, used to roll the ZWG leg up to USD-equivalent and split PAYE back. */
  fxRate: number;
  /** USD ZIMRA progressive bands the combined taxable income is charged against. */
  usdBands: PayeBand[];
  /** Monthly tax credits (USD), subtracted from the combined PAYE before the split. */
  taxCreditsUsd?: number;
  /** AIDS levy rate as a percentage (defaults to 3). */
  aidsLevyPct?: number;
}

/** Result of a cross-currency PAYE computation — separate USD and ZWG legs. */
export interface CrossCurrencyPayeResult {
  /** Combined USD-equivalent taxable income the scale was charged on. */
  totalTaxableUsd: number;
  /** PAYE charged on the USD leg. */
  payeUsd: number;
  /** PAYE charged on the ZWG leg. */
  payeZwg: number;
  /** AIDS levy on the USD-leg PAYE. */
  aidsLevyUsd: number;
  /** AIDS levy on the ZWG-leg PAYE. */
  aidsLevyZwg: number;
}

const DEFAULT_AIDS_LEVY_PCT = 3;

@Injectable()
export class CrossCurrencyPayeService {
  constructor(private readonly paye: PayeService) {}

  compute(input: CrossCurrencyPayeInput): CrossCurrencyPayeResult {
    const {
      taxableUsd,
      taxableZwg,
      fxRate,
      usdBands,
      taxCreditsUsd = 0,
      aidsLevyPct = DEFAULT_AIDS_LEVY_PCT,
    } = input;

    const rate = fxRate > 0 ? fxRate : 1;
    // ZWG leg expressed in USD, so both legs are on one scale.
    const taxableZwgAsUsd = taxableZwg / rate;
    const totalTaxableUsd = this.round2(taxableUsd + taxableZwgAsUsd);

    const empty = {
      totalTaxableUsd,
      payeUsd: 0,
      payeZwg: 0,
      aidsLevyUsd: 0,
      aidsLevyZwg: 0,
    };
    if (totalTaxableUsd <= 0) {
      return empty;
    }

    // Charge the whole (USD-equivalent) taxable income once, then apply credits.
    const grossPaye = this.paye.compute({ taxableIncome: totalTaxableUsd, bands: usdBands });
    const netPaye = Math.max(0, grossPaye - taxCreditsUsd);
    if (netPaye <= 0) {
      return empty;
    }

    // Split net PAYE by each leg's share of the total taxable income.
    const usdShare = taxableUsd / totalTaxableUsd;
    const payeUsd = this.round2(netPaye * usdShare);
    // ZWG leg carries the remainder of the net PAYE, converted back to ZWG.
    const payeZwg = this.round2((netPaye - payeUsd) * rate);

    const levy = aidsLevyPct / 100;
    return {
      totalTaxableUsd,
      payeUsd,
      payeZwg,
      aidsLevyUsd: this.round2(payeUsd * levy),
      aidsLevyZwg: this.round2(payeZwg * levy),
    };
  }

  private round2(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded === 0 ? 0 : rounded;
  }
}
