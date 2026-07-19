import { Injectable } from '@nestjs/common';
import { Prisma, TaxType } from '@prisma/client';
import { PerformanceService, ExpenseBreakdown } from '../../financial/domain/performance.service';
import { TaxLedgerConsolidationService } from '../../financial/domain/tax-ledger-consolidation.service';
import { ZimraReconciliationService } from '../../financial/domain/zimra-reconciliation.service';
import { StatutoryRatesService } from '../../reference/statutory-rates/statutory-rates.service';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Command Centre — Panel 6: Tax exposure.
 *
 * A READ-ONLY snapshot of the organisation's tax position, combining:
 *  - Net VAT and net PAYE from the tax ledger (TaxLedgerConsolidationService).
 *  - Outstanding ZIMRA assessments with days overdue + accrued interest
 *    (ZimraReconciliationService).
 *  - A CORPORATE INCOME TAX PROVISION *ESTIMATE* — (CIT% + AIDS levy% on CIT)
 *    applied to operating profit (PerformanceService). This line is clearly
 *    labelled as an estimate and is NOT a filed/assessed liability.
 *
 * The service performs no writes. It queries Prisma for the raw rows, converts
 * Prisma.Decimal to number, and delegates every calculation to the pure
 * Appendix A domain services. All money is reported in USD; non-USD rows are
 * summed within their own currency and the USD roll-up excludes them (the panel
 * surfaces per-currency PAYE/VAT nets keyed by currency to avoid silently
 * mixing currencies).
 */

/** Statutory-rate keys this panel reads (with hard-coded fallbacks). */
const KEY_CIT_PCT = 'corporate_income_tax_pct';
const KEY_AIDS_LEVY_PCT = 'aids_levy_pct';
const KEY_ZIMRA_INTEREST_PCT = 'zimra_interest_pct';

/** Statutory defaults (Zimbabwe) used when no configured rate exists. */
const DEFAULT_CIT_PCT = 25;
const DEFAULT_AIDS_LEVY_PCT = 3; // charged on the income-tax amount, not on profit.
const DEFAULT_ZIMRA_INTEREST_PCT = 25;

/** Optional inputs for a tax-exposure computation. */
export interface TaxExposureParams {
  /** Reporting "today" for overdue-ageing (defaults to now). */
  asOf?: Date;
  /** Reporting currency for the ledger nets + provision (defaults to USD). */
  currency?: string;
}

/** A consolidated net position line for one tax head. */
export interface TaxHeadLine {
  taxType: TaxType;
  currency: string;
  /** Amount assessed/due for the head across the ledger. */
  due: number;
  /** Amount already paid against the head. */
  paid: number;
  /** Net position: due - paid. Negative means a credit/recoverable position. */
  net: number;
}

/** One ZIMRA assessment with its overdue ageing + accrued interest. */
export interface AssessmentExposure {
  id: string;
  taxType: TaxType;
  currency: string;
  assessedAmount: number;
  dueDate: string;
  daysOverdue: number;
  /** Simple interest accrued on the overdue balance at the ZIMRA rate. */
  accruedInterest: number;
  /** assessedAmount + accruedInterest. */
  totalWithInterest: number;
}

/** The CIT provision estimate line. Clearly an estimate — not a filed return. */
export interface CorporateIncomeTaxEstimate {
  /** Always true — this line is an ESTIMATE, never a filed/assessed liability. */
  estimate: true;
  currency: string;
  /** Operating profit the estimate is based on (floored at zero). */
  operatingProfit: number;
  /** CIT rate applied (percent). */
  citRatePct: number;
  /** AIDS levy rate applied to the CIT amount (percent). */
  aidsLevyPct: number;
  /** Base corporate income tax = operatingProfit * citRatePct / 100. */
  corporateIncomeTax: number;
  /** AIDS levy = corporateIncomeTax * aidsLevyPct / 100. */
  aidsLevy: number;
  /** Total provision = corporateIncomeTax + aidsLevy. */
  provision: number;
  /** Effective combined rate as a percent (provision / operatingProfit * 100). */
  effectiveRatePct: number;
  /** Human note reinforcing that this is an estimate. */
  note: string;
}

/** The full Panel 6 result. */
export interface TaxExposurePanelResult {
  asOf: string;
  currency: string;
  /** Net VAT line for the reporting currency. */
  vat: TaxHeadLine;
  /** Net PAYE line for the reporting currency. */
  paye: TaxHeadLine;
  /** Outstanding ZIMRA assessments with overdue ageing + interest. */
  assessments: AssessmentExposure[];
  /** Roll-up of assessment exposure across the list. */
  assessmentTotals: {
    count: number;
    assessedAmount: number;
    accruedInterest: number;
    totalWithInterest: number;
  };
  /** CIT provision estimate (clearly labelled). */
  corporateIncomeTax: CorporateIncomeTaxEstimate;
  /**
   * Total tax exposure in the reporting currency:
   * max(0, netVat) + max(0, netPaye) + assessment totals (in-currency) +
   * CIT provision estimate. Recoverable nets are floored at zero.
   */
  totalExposure: number;
}

@Injectable()
export class TaxExposureService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxLedger: TaxLedgerConsolidationService,
    private readonly zimra: ZimraReconciliationService,
    private readonly performance: PerformanceService,
    private readonly statutoryRates: StatutoryRatesService,
  ) {}

  /** Prisma.Decimal | number | null | undefined -> number (0 for nullish). */
  private num(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return typeof value === 'number' ? value : Number(value);
  }

  /** Round money to 2 decimal places, guarding binary-float drift + negative zero. */
  private round2(value: number): number {
    const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
    return rounded === 0 ? 0 : rounded;
  }

  /**
   * Read a statutory percentage by key, falling back to `fallback` when no
   * configured rate exists (the reference table may be unseeded). Never throws.
   */
  private async ratePct(key: string, asOf: Date, fallback: number): Promise<number> {
    try {
      const row = await this.statutoryRates.valueAsOf(key, asOf);
      const value = this.num(row.value);
      return value > 0 ? value : fallback;
    } catch {
      return fallback;
    }
  }

  /**
   * Compute the tax-exposure panel. Read-only.
   */
  async compute(params?: TaxExposureParams): Promise<TaxExposurePanelResult> {
    const asOf = params?.asOf ?? new Date();
    const currency = params?.currency ?? 'USD';

    const [vat, paye, assessments, corporateIncomeTax] = await Promise.all([
      this.consolidateHead(TaxType.VAT, currency),
      this.consolidateHead(TaxType.PAYE, currency),
      this.assessmentExposure(currency, asOf),
      this.corporateIncomeTaxEstimate(currency, asOf),
    ]);

    const assessmentTotals = assessments.reduce(
      (acc, a) => ({
        count: acc.count + 1,
        assessedAmount: this.round2(acc.assessedAmount + a.assessedAmount),
        accruedInterest: this.round2(acc.accruedInterest + a.accruedInterest),
        totalWithInterest: this.round2(acc.totalWithInterest + a.totalWithInterest),
      }),
      { count: 0, assessedAmount: 0, accruedInterest: 0, totalWithInterest: 0 },
    );

    // Recoverable (negative) net positions are floored at zero for the roll-up.
    const totalExposure = this.round2(
      Math.max(0, vat.net) +
        Math.max(0, paye.net) +
        assessmentTotals.totalWithInterest +
        corporateIncomeTax.provision,
    );

    return {
      asOf: asOf.toISOString(),
      currency,
      vat,
      paye,
      assessments,
      assessmentTotals,
      corporateIncomeTax,
      totalExposure,
    };
  }

  /**
   * Consolidate one tax head (VAT/PAYE) from the tax_ledger for a currency.
   * netPaye/netVat both reduce to due - paid at the ledger level; the pure PAYE
   * consolidation is reused (no brought-forward here — that is period-scoped).
   */
  private async consolidateHead(taxType: TaxType, currency: string): Promise<TaxHeadLine> {
    const rows = await this.prisma.taxLedger.findMany({ where: { taxType, currency } });

    const due = rows.reduce((sum, r) => sum + this.num(r.amountDue), 0);
    const paid = rows.reduce((sum, r) => sum + this.num(r.amountPaid), 0);

    const line = this.taxLedger.consolidatePaye({ due, broughtForward: 0, paid });

    return {
      taxType,
      currency,
      due: line.due,
      paid: line.paid,
      net: line.netPaye,
    };
  }

  /**
   * Outstanding ZIMRA assessments in the reporting currency, each with days
   * overdue + accrued interest at the configured ZIMRA interest rate.
   */
  private async assessmentExposure(currency: string, asOf: Date): Promise<AssessmentExposure[]> {
    const [rows, zimraRatePct] = await Promise.all([
      this.prisma.zimraAssessment.findMany({
        where: { currency },
        orderBy: { dueDate: 'asc' },
      }),
      this.ratePct(KEY_ZIMRA_INTEREST_PCT, asOf, DEFAULT_ZIMRA_INTEREST_PCT),
    ]);

    return rows.map((r) => {
      const assessedAmount = this.round2(this.num(r.assessedAmount));
      const { daysOverdue, interest } = this.zimra.overdueInterest({
        booksAmount: assessedAmount,
        dueDate: r.dueDate,
        today: asOf,
        ratePct: zimraRatePct,
      });
      return {
        id: r.id,
        taxType: r.taxType,
        currency: r.currency,
        assessedAmount,
        dueDate: r.dueDate.toISOString(),
        daysOverdue,
        accruedInterest: interest,
        totalWithInterest: this.round2(assessedAmount + interest),
      };
    });
  }

  /**
   * Corporate income tax PROVISION ESTIMATE on operating profit.
   *
   * operatingProfit is derived from PerformanceService using serviced-order and
   * claim income vs. the four expense buckets (order/general/overheads/loan
   * interest), all filtered to the reporting currency. The provision is:
   *   cit  = max(0, operatingProfit) * citRatePct/100
   *   levy = cit * aidsLevyPct/100          (AIDS levy is charged on the tax)
   *   provision = cit + levy
   * This is explicitly an ESTIMATE — a real return depends on tax adjustments,
   * capital allowances, carried-forward losses, etc.
   */
  private async corporateIncomeTaxEstimate(
    currency: string,
    asOf: Date,
  ): Promise<CorporateIncomeTaxEstimate> {
    const [orders, claims, orderExpenses, generalExpenses, overheads, loanInterest] =
      await Promise.all([
        this.prisma.order.findMany({ where: { currency } }),
        this.prisma.contractClaim.findMany({ where: { currency } }),
        this.prisma.orderExpense.findMany({ where: { currency } }),
        this.prisma.generalExpense.findMany({ where: { currency } }),
        this.prisma.overhead.findMany({ where: { currency } }),
        this.prisma.loanInterest.findMany({ where: { currency } }),
      ]);

    const expenses: ExpenseBreakdown = {
      order: orderExpenses.reduce((sum, e) => sum + this.num(e.amount), 0),
      general: generalExpenses.reduce((sum, e) => sum + this.num(e.amount), 0),
      overheads: overheads.reduce((sum, o) => sum + this.num(o.amount), 0),
      loanInterest: loanInterest.reduce((sum, i) => sum + this.num(i.amount), 0),
    };

    const perf = this.performance.compute({
      orders: orders.map((o) => ({
        valueExVat: this.num(o.valueExVat),
        serviced: o.serviced,
      })),
      claims: claims.map((c) => ({ amountExVat: this.num(c.amountExVat) })),
      expenses,
    });

    const [citRatePct, aidsLevyPct] = await Promise.all([
      this.ratePct(KEY_CIT_PCT, asOf, DEFAULT_CIT_PCT),
      this.ratePct(KEY_AIDS_LEVY_PCT, asOf, DEFAULT_AIDS_LEVY_PCT),
    ]);

    // Only a positive operating profit generates a provision (no tax on a loss).
    const operatingProfit = Math.max(0, perf.operatingProfit);
    const corporateIncomeTax = this.round2(operatingProfit * (citRatePct / 100));
    const aidsLevy = this.round2(corporateIncomeTax * (aidsLevyPct / 100));
    const provision = this.round2(corporateIncomeTax + aidsLevy);
    const effectiveRatePct =
      operatingProfit > 0 ? this.round2((provision / operatingProfit) * 100) : 0;

    return {
      estimate: true,
      currency,
      operatingProfit,
      citRatePct,
      aidsLevyPct,
      corporateIncomeTax,
      aidsLevy,
      provision,
      effectiveRatePct,
      note: `ESTIMATE only: ${citRatePct}% corporate income tax + ${aidsLevyPct}% AIDS levy on operating profit. Not a filed or assessed liability.`,
    };
  }
}
