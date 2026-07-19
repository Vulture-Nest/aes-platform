import { Injectable } from '@nestjs/common';

/**
 * TaxLedgerConsolidation — Appendix A pure domain service.
 *
 * Consolidates a tax period into two SEPARATE line results:
 *  - VAT: outputVat - inputVat + broughtForwardVatPrincipal - vatPaid = netVat
 *          (netVat may be negative, meaning a recoverable/refundable position).
 *  - PAYE: due + broughtForward - paid = netPaye.
 *
 * It also computes simple (non-compounding) interest per overdue debt row:
 *   interest = principal * zimraRatePct / 100 * daysOverdue / 365.
 *
 * All methods are PURE: they take plain typed inputs and return computed
 * results. No Prisma, no I/O, no injected dependencies. Math is done with
 * plain JavaScript numbers; monetary results are rounded to 2 decimal places
 * and interest to 2 decimal places, matching the ledger's storage precision.
 */

/** A single VAT-bearing line on the OUTPUT (sales) side of the ledger. */
export interface VatOutputLine {
  /** Net taxable amount (exclusive of VAT) for the line. */
  taxableAmount: number;
  /** VAT rate applied, expressed as a percentage (e.g. 15 for 15%). */
  vatRatePct: number;
}

/** A single VAT-bearing line on the INPUT (purchases/expenses) side. */
export interface VatInputLine {
  /** Net taxable amount (exclusive of VAT) for the line. */
  taxableAmount: number;
  /** VAT rate applied, expressed as a percentage (e.g. 15 for 15%). */
  vatRatePct: number;
  /**
   * Whether the input VAT on this line is claimable. Only flagged/claimable
   * lines contribute to input VAT; non-flagged lines are ignored.
   */
  claimable: boolean;
}

/** Inputs required to consolidate the VAT line of a tax period. */
export interface VatConsolidationInput {
  /** VAT-bearing output lines from serviced orders. */
  servicedOrders: VatOutputLine[];
  /** VAT-bearing output lines from contract claims. */
  contractClaims: VatOutputLine[];
  /** Claimable input lines originating from flagged orders. */
  flaggedOrders: VatInputLine[];
  /** Claimable input lines from general expenses. */
  generalExpenses: VatInputLine[];
  /** Claimable input lines from overheads. */
  overheads: VatInputLine[];
  /**
   * VAT principal carried forward from the prior period. Positive means an
   * amount still owed to the authority that rolls into this period.
   */
  broughtForwardVatPrincipal: number;
  /** VAT already paid to the authority during this period. */
  vatPaid: number;
}

/** Consolidated VAT result for a tax period. */
export interface VatLineResult {
  /** Total output VAT: serviced orders + contract claims. */
  outputVat: number;
  /** Total input VAT: flagged orders + general expenses + overheads. */
  inputVat: number;
  /**
   * Net VAT position: outputVat - inputVat + broughtForwardVatPrincipal -
   * vatPaid. Negative means a recoverable (refundable) position.
   */
  netVat: number;
  /** True when netVat is strictly negative (recoverable position). */
  recoverable: boolean;
}

/** Inputs required to consolidate the PAYE line of a tax period. */
export interface PayeConsolidationInput {
  /** PAYE assessed as due for this period. */
  due: number;
  /** PAYE principal carried forward (owed) from the prior period. */
  broughtForward: number;
  /** PAYE already paid during this period. */
  paid: number;
}

/** Consolidated PAYE result for a tax period. */
export interface PayeLineResult {
  /** PAYE assessed as due for this period. */
  due: number;
  /** PAYE carried forward from the prior period. */
  broughtForward: number;
  /** PAYE already paid during this period. */
  paid: number;
  /** Net PAYE position: due + broughtForward - paid. */
  netPaye: number;
}

/** A single overdue debt row for interest computation. */
export interface DebtRow {
  /** Stable identifier for the debt (echoed back in the result). */
  id: string;
  /** Outstanding principal on which interest accrues. */
  principal: number;
  /** ZIMRA interest rate applied, expressed as a percentage per annum. */
  zimraRatePct: number;
  /** Number of days the debt is overdue. */
  daysOverdue: number;
}

/** Interest accrued on a single overdue debt row. */
export interface DebtInterestResult {
  /** Echoed debt identifier. */
  id: string;
  /** Echoed outstanding principal. */
  principal: number;
  /** Simple interest accrued: principal * ratePct/100 * daysOverdue/365. */
  interest: number;
}

/** Full consolidated tax ledger for a period. */
export interface TaxLedgerConsolidationResult {
  /** VAT line result (kept separate from PAYE). */
  vat: VatLineResult;
  /** PAYE line result (kept separate from VAT). */
  paye: PayeLineResult;
  /** Per-row interest on overdue debts. */
  debtInterest: DebtInterestResult[];
  /** Sum of all per-row interest amounts. */
  totalInterest: number;
}

@Injectable()
export class TaxLedgerConsolidationService {
  /** Rounds a monetary value to 2 decimal places (half-up on positives). */
  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  /** VAT on one output line = taxableAmount * rate/100. */
  private outputVatForLine(line: VatOutputLine): number {
    return line.taxableAmount * (line.vatRatePct / 100);
  }

  /** VAT on one input line, but only when the line is claimable/flagged. */
  private inputVatForLine(line: VatInputLine): number {
    if (!line.claimable) {
      return 0;
    }
    return line.taxableAmount * (line.vatRatePct / 100);
  }

  /**
   * Consolidate the VAT line for a period.
   *
   * outputVat = VAT on serviced orders + contract claims.
   * inputVat  = flagged order + general expenses + overheads (claimable only).
   * netVat    = outputVat - inputVat + broughtForwardVatPrincipal - vatPaid.
   */
  consolidateVat(input: VatConsolidationInput): VatLineResult {
    const outputRaw =
      input.servicedOrders.reduce((sum, l) => sum + this.outputVatForLine(l), 0) +
      input.contractClaims.reduce((sum, l) => sum + this.outputVatForLine(l), 0);

    const inputRaw =
      input.flaggedOrders.reduce((sum, l) => sum + this.inputVatForLine(l), 0) +
      input.generalExpenses.reduce((sum, l) => sum + this.inputVatForLine(l), 0) +
      input.overheads.reduce((sum, l) => sum + this.inputVatForLine(l), 0);

    const outputVat = this.round2(outputRaw);
    const inputVat = this.round2(inputRaw);
    const netVat = this.round2(
      outputVat - inputVat + input.broughtForwardVatPrincipal - input.vatPaid,
    );

    return {
      outputVat,
      inputVat,
      netVat,
      recoverable: netVat < 0,
    };
  }

  /**
   * Consolidate the PAYE line for a period.
   *
   * netPaye = due + broughtForward - paid.
   */
  consolidatePaye(input: PayeConsolidationInput): PayeLineResult {
    const due = this.round2(input.due);
    const broughtForward = this.round2(input.broughtForward);
    const paid = this.round2(input.paid);
    const netPaye = this.round2(due + broughtForward - paid);

    return { due, broughtForward, paid, netPaye };
  }

  /**
   * Simple interest on one overdue debt row:
   *   interest = principal * zimraRatePct / 100 * daysOverdue / 365.
   * A debt that is not overdue (daysOverdue <= 0) accrues no interest.
   */
  interestForDebt(row: DebtRow): DebtInterestResult {
    const days = row.daysOverdue > 0 ? row.daysOverdue : 0;
    const interest = this.round2(row.principal * (row.zimraRatePct / 100) * (days / 365));
    return { id: row.id, principal: row.principal, interest };
  }

  /** Interest for a set of overdue debt rows, plus their total. */
  consolidateDebtInterest(rows: DebtRow[]): {
    debtInterest: DebtInterestResult[];
    totalInterest: number;
  } {
    const debtInterest = rows.map((r) => this.interestForDebt(r));
    const totalInterest = this.round2(debtInterest.reduce((sum, r) => sum + r.interest, 0));
    return { debtInterest, totalInterest };
  }

  /**
   * Full consolidation of a tax period into separate VAT and PAYE lines plus
   * overdue-debt interest.
   */
  consolidate(input: {
    vat: VatConsolidationInput;
    paye: PayeConsolidationInput;
    debts: DebtRow[];
  }): TaxLedgerConsolidationResult {
    const vat = this.consolidateVat(input.vat);
    const paye = this.consolidatePaye(input.paye);
    const { debtInterest, totalInterest } = this.consolidateDebtInterest(input.debts);
    return { vat, paye, debtInterest, totalInterest };
  }
}
