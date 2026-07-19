import { Injectable } from '@nestjs/common';

/**
 * ZimraReconciliationService — Appendix A domain math for reconciling the
 * organisation's books against ZIMRA (Zimbabwe Revenue Authority) assessments.
 *
 * PURE service: every method takes plain typed inputs and returns computed
 * values. No Prisma, no I/O, no injected dependencies. All arithmetic uses
 * plain `number`s; rounding is applied only where the spec calls for it
 * (2 decimal places for monetary results).
 */

/** Which tax head a discrepancy relates to. */
export enum ZimraTaxHead {
  VAT = 'VAT',
  PAYE = 'PAYE',
}

/** A single tax-head discrepancy: what the books say vs. what ZIMRA assessed. */
export interface TaxHeadDiscrepancyInput {
  head: ZimraTaxHead;
  /** Amount per the organisation's own books. */
  booksAmount: number;
  /** Amount per the ZIMRA assessment. */
  assessedAmount: number;
}

/** Result of comparing one tax head's books vs. assessed figures. */
export interface TaxHeadDiscrepancyResult {
  head: ZimraTaxHead;
  booksAmount: number;
  assessedAmount: number;
  /** books - assessed. Positive = books exceed assessment (potential overpayment/recoverable). */
  discrepancy: number;
  /**
   * Whether books and assessment agree within the reconciliation tolerance
   * (|discrepancy| <= tolerance). Defaults to a 0.01 tolerance.
   */
  reconciled: boolean;
}

/** Inputs for computing overdue interest on an outstanding tax balance. */
export interface OverdueInterestInput {
  /** Outstanding balance per the books; only positive balances accrue interest. */
  booksAmount: number;
  /** Statutory date the amount fell due. */
  dueDate: Date;
  /** Reference "today" against which lateness is measured. */
  today: Date;
  /** Annual interest rate as a percentage, e.g. 25 for 25% p.a. */
  ratePct: number;
}

/** Result of an overdue-interest computation. */
export interface OverdueInterestResult {
  daysOverdue: number;
  interest: number;
}

/** Net position and any other outstanding debt for a single tax head. */
export interface TaxHeadLiabilityInput {
  /** Net position for the head; negative = recoverable (floored at zero). */
  netAmount: number;
}

/** Inputs for the overall ZIMRA liability roll-up. */
export interface TotalLiabilityInput {
  /** Net VAT position; negative (recoverable) is floored at zero. */
  netVat: number;
  /** Net PAYE position; negative (recoverable) is floored at zero. */
  netPaye: number;
  /** Any other outstanding debt principal (e.g. penalties, misc heads). */
  otherDebtBalance: number;
  /** Accrued interest on that other debt. */
  otherDebtInterest: number;
}

/** Result of the overall ZIMRA liability roll-up. */
export interface TotalLiabilityResult {
  netVatDue: number;
  netPayeDue: number;
  otherDebtBalance: number;
  otherDebtInterest: number;
  totalLiability: number;
}

/** Default reconciliation tolerance in the reporting currency. */
export const DEFAULT_RECONCILIATION_TOLERANCE = 0.01;

/** Milliseconds in one calendar day. */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Days used to annualise the statutory interest rate. */
const DAYS_PER_YEAR = 365;

@Injectable()
export class ZimraReconciliationService {
  /**
   * Discrepancy for a single tax head: `books - assessed`.
   * A positive result means the books carry more than ZIMRA assessed.
   */
  discrepancy(
    input: TaxHeadDiscrepancyInput,
    tolerance: number = DEFAULT_RECONCILIATION_TOLERANCE,
  ): TaxHeadDiscrepancyResult {
    const discrepancy = round2(input.booksAmount - input.assessedAmount);
    return {
      head: input.head,
      booksAmount: input.booksAmount,
      assessedAmount: input.assessedAmount,
      discrepancy,
      reconciled: Math.abs(discrepancy) <= tolerance,
    };
  }

  /**
   * Discrepancies for the VAT and PAYE heads independently. Convenience wrapper
   * that keeps the two heads separate, as the spec requires.
   */
  discrepancies(
    inputs: TaxHeadDiscrepancyInput[],
    tolerance: number = DEFAULT_RECONCILIATION_TOLERANCE,
  ): TaxHeadDiscrepancyResult[] {
    return inputs.map((input) => this.discrepancy(input, tolerance));
  }

  /**
   * Whole days a balance is overdue: `max(0, today - dueDate)`.
   * Anything on or before the due date returns 0.
   */
  daysOverdue(dueDate: Date, today: Date): number {
    const rawDays = Math.floor((today.getTime() - dueDate.getTime()) / MS_PER_DAY);
    return Math.max(0, rawDays);
  }

  /**
   * Simple-interest accrual on an overdue balance:
   * `interest = max(0, books) * ratePct/100 * days/365`.
   * Recoverable (negative) balances accrue no interest.
   */
  overdueInterest(input: OverdueInterestInput): OverdueInterestResult {
    const days = this.daysOverdue(input.dueDate, input.today);
    const principal = Math.max(0, input.booksAmount);
    const interest = round2((principal * (input.ratePct / 100) * days) / DAYS_PER_YEAR);
    return { daysOverdue: days, interest };
  }

  /**
   * Overall ZIMRA liability roll-up:
   * `max(0, netVat) + max(0, netPaye) + otherDebtBalance + otherDebtInterest`.
   * Recoverable net positions are floored at zero so credits never reduce the
   * total liability payable.
   */
  totalLiability(input: TotalLiabilityInput): TotalLiabilityResult {
    const netVatDue = Math.max(0, input.netVat);
    const netPayeDue = Math.max(0, input.netPaye);
    const totalLiability = round2(
      netVatDue + netPayeDue + input.otherDebtBalance + input.otherDebtInterest,
    );
    return {
      netVatDue: round2(netVatDue),
      netPayeDue: round2(netPayeDue),
      otherDebtBalance: input.otherDebtBalance,
      otherDebtInterest: input.otherDebtInterest,
      totalLiability,
    };
  }
}

/** Round to 2 decimal places, guarding against binary-float drift. */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
