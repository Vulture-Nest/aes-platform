import { Injectable } from '@nestjs/common';

/**
 * GrossBuildup — PURE domain math for building an employee's gross pay for a
 * single payroll period, then splitting that gross into USD/ZWG legs.
 *
 * This service is intentionally self-contained: no Prisma, no I/O, no injected
 * dependencies. It takes plain typed inputs and returns computed results using
 * plain `number` math (never Prisma.Decimal). Every statutory / commercial rate
 * (hourly rate, allowance rates, overtime multipliers via the inputs, split
 * percentage) is supplied by the caller as an INPUT — nothing is hardcoded.
 * Monetary figures are rounded to 2 decimal places.
 *
 * Overtime multipliers are fixed at the labour-law convention encoded by the
 * input field names: `hoursOt15` is paid at 1.5x and `hoursOt20` at 2.0x. These
 * are structural multipliers (which bucket of hours you worked), not statutory
 * tax/levy rates, so they live in code rather than in config.
 */

/** How the gross is split between the USD and ZWG payment legs. */
export enum SplitMode {
  /** Percentage taken from the governing client contract ratio. */
  CLIENT_RATIO = 'CLIENT_RATIO',
  /** Percentage fixed for this employee/period regardless of client. */
  FIXED_SPLIT = 'FIXED_SPLIT',
}

/** Overtime multipliers applied to the two overtime buckets. */
export const OT_MULTIPLIER_15 = 1.5;
export const OT_MULTIPLIER_20 = 2.0;

/** The currency split instruction for a period. */
export interface SplitInput {
  /** Which policy produced `usdPct` (informational; both split identically). */
  mode: SplitMode;
  /**
   * Percentage of gross paid in USD, 0..100. The remainder (100 - usdPct) is
   * paid in ZWG. Values outside 0..100 are clamped so a bad config can never
   * mint or destroy money in the split.
   */
  usdPct: number;
}

/** Full input bundle for {@link GrossBuildupService.compute}. */
export interface GrossBuildupInput {
  /** Normal (non-overtime) hours worked. */
  hoursNormal: number;
  /** Overtime hours paid at 1.5x. */
  hoursOt15: number;
  /** Overtime hours paid at 2.0x. */
  hoursOt20: number;
  /** Number of underground shifts attracting the underground allowance. */
  ugShift: number;
  /** Night hours attracting the night-shift allowance. */
  nightHours: number;
  /** Base hourly rate for normal and overtime hours. */
  hourlyRate: number;
  /** Allowance paid per underground shift. Defaults to 0. */
  ugAllowanceRate?: number;
  /** Allowance paid per night hour. Defaults to 0. */
  nightAllowanceRate?: number;
  /**
   * Cost-of-living allowance (flat). Defaults to 0. When {@link colaIsZwgNative} is true this
   * is a ZWG-native amount added entirely to the ZWG leg (the paysheet convention); otherwise
   * it is part of the split-native gross like every other allowance.
   */
  cola?: number;
  /** When true, `cola` is ZWG-native and bypasses the split (goes wholly to the ZWG leg). */
  colaIsZwgNative?: boolean;
  /** Any other flat allowances lumped together (split-native, USD). Defaults to 0. */
  otherAllowances?: number;
  /** Flat gratuity (split-native, USD). Defaults to 0. */
  gratuity?: number;
  /** Extra earnings (back-pay / acting) folded into the split-native gross. Defaults to 0. */
  extraEarnings?: number;
  /** How to split the resulting gross across currencies. */
  split: SplitInput;
}

/** The gross split into its currency legs. Both rounded to 2 dp. */
export interface GrossSplit {
  /** Portion of gross paid in USD. */
  usd: number;
  /** Portion of gross paid in ZWG. */
  zwg: number;
}

/** Computed gross build-up for a period. All money rounded to 2 dp. */
export interface GrossBuildupResult {
  /** hoursNormal * hourlyRate. */
  basic: number;
  /** hoursOt15 * rate * 1.5 + hoursOt20 * rate * 2.0. */
  overtime: number;
  /** ugShift * ugAllowanceRate. */
  underground: number;
  /** nightHours * nightAllowanceRate. */
  night: number;
  /** cola + otherAllowances + gratuity. */
  allowances: number;
  /** Extra earnings (back-pay / acting) folded into the split-native gross. */
  extraEarnings: number;
  /** basic + overtime + underground + night + cola + otherAllowances + gratuity + extraEarnings. */
  gross: number;
  /** Gross split into USD/ZWG legs (ZWG-native COLA, if any, is added wholly to the ZWG leg). */
  split: GrossSplit;
}

@Injectable()
export class GrossBuildupService {
  /** Round a monetary value to 2 decimal places, avoiding -0. */
  private round2(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded === 0 ? 0 : rounded;
  }

  /** Clamp a percentage into the inclusive 0..100 range. */
  private clampPct(pct: number): number {
    if (pct < 0) {
      return 0;
    }
    if (pct > 100) {
      return 100;
    }
    return pct;
  }

  /**
   * Build an employee's gross pay for the period and split it into USD/ZWG.
   *
   * The USD leg is computed from the (rounded) gross and the ZWG leg is the
   * remainder, so `usd + zwg === gross` exactly even after rounding.
   */
  compute(input: GrossBuildupInput): GrossBuildupResult {
    const {
      hoursNormal,
      hoursOt15,
      hoursOt20,
      ugShift,
      nightHours,
      hourlyRate,
      ugAllowanceRate = 0,
      nightAllowanceRate = 0,
      cola = 0,
      colaIsZwgNative = false,
      otherAllowances = 0,
      gratuity = 0,
      extraEarnings = 0,
      split,
    } = input;

    const basic = this.round2(hoursNormal * hourlyRate);
    const overtime = this.round2(
      hoursOt15 * hourlyRate * OT_MULTIPLIER_15 + hoursOt20 * hourlyRate * OT_MULTIPLIER_20,
    );
    const underground = this.round2(ugShift * ugAllowanceRate);
    const night = this.round2(nightHours * nightAllowanceRate);
    // A ZWG-native COLA is reported in `allowances` but excluded from the split-native gross.
    const splitCola = colaIsZwgNative ? 0 : cola;
    const allowances = this.round2(cola + otherAllowances + gratuity);
    const extra = this.round2(extraEarnings);

    // Split-native gross (paid in USD/ZWG by the ratio); ZWG-native COLA is added on afterwards.
    const splitGross = this.round2(
      basic + overtime + underground + night + splitCola + otherAllowances + gratuity + extra,
    );
    const zwgNativeCola = colaIsZwgNative ? this.round2(cola) : 0;
    const gross = this.round2(splitGross + zwgNativeCola);

    const usdPct = this.clampPct(split.usdPct);
    const usd = this.round2((splitGross * usdPct) / 100);
    // ZWG leg = remainder of the split-native gross plus any ZWG-native COLA, so both legs
    // always sum back to gross exactly.
    const zwg = this.round2(gross - usd);

    return {
      basic,
      overtime,
      underground,
      night,
      allowances,
      extraEarnings: extra,
      gross,
      split: { usd, zwg },
    };
  }
}
