import { BadRequestException, Injectable } from '@nestjs/common';

/**
 * Inputs for a percentage-of-gross employer statutory contribution.
 *
 * `gross` and `pct` are plain numbers supplied by the caller; this service
 * performs NO I/O and hardcodes NO statutory numbers. Real rates/bands must be
 * sourced upstream (e.g. from StatutoryRatesService) and passed in as inputs.
 */
export interface EmployerStatutoryInput {
  /** Gross pay the contribution is levied on (>= 0). */
  gross: number;
  /** Contribution rate expressed as a percentage, e.g. 1 means 1% (>= 0). */
  pct: number;
}

/**
 * Pure, table-testable employer-side statutory contribution calculators.
 *
 * Every method is a total function of its inputs: no Prisma, no clock, no
 * randomness. Money results are rounded to 2 decimal places. Negative `gross`
 * or `pct` are rejected — these represent invalid upstream data, not zero.
 */
@Injectable()
export class EmployerStatutoryService {
  /** ZIMDEF (manpower development) employer levy: gross * pct / 100. */
  zimdef(input: EmployerStatutoryInput): number {
    return this.percentOfGross('zimdef', input);
  }

  /** NEC (National Employment Council) employer contribution: gross * pct / 100. */
  nec(input: EmployerStatutoryInput): number {
    return this.percentOfGross('nec', input);
  }

  /** MIPF (Mining Industry Pension Fund) employer contribution for mine sites: gross * pct / 100. */
  mipf(input: EmployerStatutoryInput): number {
    return this.percentOfGross('mipf', input);
  }

  private percentOfGross(label: string, { gross, pct }: EmployerStatutoryInput): number {
    this.assertNonNegative(`${label}.gross`, gross);
    this.assertNonNegative(`${label}.pct`, pct);
    return this.round2((gross * pct) / 100);
  }

  private assertNonNegative(field: string, value: number): void {
    if (!Number.isFinite(value)) {
      throw new BadRequestException(`${field} must be a finite number`);
    }
    if (value < 0) {
      throw new BadRequestException(`${field} must not be negative`);
    }
  }

  /** Round half-away-from-zero to 2dp, avoiding binary float artefacts. */
  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
