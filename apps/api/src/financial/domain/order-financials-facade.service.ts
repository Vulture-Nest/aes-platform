import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StatutoryRatesService } from '../../reference/statutory-rates/statutory-rates.service';
import { LoanInterestService } from './loan-interest.service';
import { OrderFinancialsResult, OrderFinancialsService } from './order-financials.service';
import { OrderHealthService, OrderHealthState, ServiceMilestone } from './order-health.service';

/** Statutory key for the standard VAT rate (percentage, e.g. 15 for 15%). */
const VAT_PCT_KEY = 'vat_pct';
/** Fallback VAT percentage when no statutory value is configured. */
const DEFAULT_VAT_PCT = 15;

/** Prisma.Decimal | number | null | undefined -> number (never NaN). */
function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === 'number' ? value : Number(value);
}

/** Round a monetary/percentage value to 2 decimal places, avoiding negative-zero. */
function round2(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/**
 * G18 (Appendix B.2a): partial-servicing progress derived from an order's milestones.
 *
 * `servicedPct` is the fraction of the order delivered so far:
 *   - value basis:   Σ completed milestone valuePortion ÷ order value ex VAT
 *   - percent basis: max completed percentPortion (already a % of scope)
 * We take the LARGER of the two so a milestone can express progress either way.
 * `fullyServiced` is true once all milestones are complete (or servicedPct ≥ 100%).
 */
export interface ServicedProgress {
  /** Number of milestones on the order. */
  milestoneCount: number;
  /** Number of completed milestones. */
  completedCount: number;
  /** Fraction serviced in [0, 1] (0 when there are no milestones). */
  servicedFraction: number;
  /** servicedFraction as a percentage in [0, 100], rounded to 2 dp. */
  servicedPct: number;
  /** True when every milestone is complete (all-or-nothing gate for full servicing). */
  fullyServiced: boolean;
  /** True when 0 < completed < total AND not yet fully serviced. */
  partiallyServiced: boolean;
}

/** The enriched financial + health snapshot for a single order (G16). */
export interface OrderFinancialsSnapshot {
  orderId: string;
  currency: string;
  /** Computed health state (Appendix A), accounting for partial servicing (G18). */
  health: OrderHealthState;
  /** VAT amount on the order value. */
  vat: number;
  /** valueExVat + vat. */
  totalInclVat: number;
  /** Σ order expenses (ex VAT). */
  spentToDate: number;
  /** Cash received against the order, normalised to the order currency at OFFICIAL rate. */
  received: number;
  /** totalInclVat − received (positive => still owed to us). */
  outstanding: number;
  /** valueExVat − spentToDate. */
  profitExVat: number;
  /** profitExVat − loan interest. */
  netProfit: number;
  /** netProfit / valueExVat, or null when valueExVat is zero. */
  margin: number | null;
  /** VAT percentage applied. */
  vatRatePct: number;
  /** G18: partial-servicing progress from milestones. */
  serviced: ServicedProgress;
}

/** An order row shape with the relations the facade needs. */
type OrderWithRelations = Prisma.OrderGetPayload<{
  include: { receipts: true; expenses: true; milestones: true };
}>;

/**
 * OrderFinancialsFacadeService — G16/G18 live wiring.
 *
 * Loads a single order with its receipts, expenses and milestones, resolves the
 * statutory VAT rate + FX + loan interest, then delegates the maths to the pure
 * {@link OrderFinancialsService} and health to the pure {@link OrderHealthService}.
 * It reuses the existing Appendix A.1/A.2 domain services rather than reinventing
 * the calculations; the only new logic is the G18 serviced% derivation and the
 * choice to feed milestones into the health state machine.
 *
 * Orders WITHOUT milestones keep the classic binary-serviced behaviour, so nothing
 * about the migration-parity figures changes for imported (milestone-free) orders.
 */
@Injectable()
export class OrderFinancialsFacadeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly financials: OrderFinancialsService,
    private readonly health: OrderHealthService,
    private readonly loanInterest: LoanInterestService,
    private readonly statutoryRates: StatutoryRatesService,
  ) {}

  /** Compute the enriched snapshot for one order id. Throws nothing if absent → null. */
  async forOrderId(orderId: string, asOf: Date = new Date()): Promise<OrderFinancialsSnapshot | null> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { receipts: true, expenses: true, milestones: true },
    });
    if (!order) {
      return null;
    }
    return this.forOrder(order, asOf);
  }

  /**
   * Compute an enriched snapshot from an already-loaded order (with relations).
   * `vatPct` may be supplied to avoid a per-order statutory lookup in list mode.
   */
  async forOrder(
    order: OrderWithRelations,
    asOf: Date = new Date(),
    vatPct?: number,
  ): Promise<OrderFinancialsSnapshot> {
    const resolvedVatPct = vatPct ?? (await this.resolveVatPct(asOf));

    // Receipts + expenses in the order's own currency (native base; the parity/ageing
    // panels use the same no-implicit-FX convention for a single order).
    const received = order.receipts
      .filter((r) => r.currency === order.currency)
      .reduce((sum, r) => sum + num(r.amount), 0);

    const financials: OrderFinancialsResult = this.financials.compute({
      order: { valueExVat: num(order.valueExVat), vatRatePct: resolvedVatPct },
      receipts: [{ amountUsd: received, amountZig: 0 }],
      expenses: order.expenses.map((e) => ({ amountExVat: num(e.amount) })),
      rates: { officialRate: 1, streetRate: 1 },
      loanInterestTotal: 0,
    });

    const serviced = this.servicedProgress(order, num(order.valueExVat));

    const milestones: ServiceMilestone[] | undefined =
      order.milestones.length > 0
        ? order.milestones.map((m) => ({ value: num(m.valuePortion), completed: m.completedAt != null }))
        : undefined;

    const health = this.health.evaluate({
      receivedTotal: received,
      totalInclVat: financials.totalInclVat,
      // An order is "serviced" for health when the binary tick is set OR every
      // milestone is complete (a fully-serviced milestone order behaves as serviced).
      serviced: order.serviced || (serviced.milestoneCount > 0 && serviced.fullyServiced),
      today: asOf,
      // No closing date => never past-closing; far-future sentinel.
      closingDate: order.closingDate ?? new Date(8640000000000000),
      milestones,
    });

    return {
      orderId: order.id,
      currency: order.currency,
      health,
      vat: financials.vat,
      totalInclVat: financials.totalInclVat,
      spentToDate: financials.spentToDate,
      received: round2(received),
      outstanding: financials.outstanding,
      profitExVat: financials.profitExVat,
      netProfit: financials.netProfit,
      margin: financials.margin,
      vatRatePct: resolvedVatPct,
      serviced,
    };
  }

  /**
   * G18 serviced% from an order's milestones.
   *
   * value basis:   Σ completed valuePortion ÷ order value (capped at 1)
   * percent basis: max completed percentPortion / 100 (capped at 1)
   * The larger of the two is the reported progress. With no milestones the fraction
   * is 0 and nothing is partially serviced — the classic binary model is untouched.
   */
  servicedProgress(order: OrderWithRelations, valueExVat: number): ServicedProgress {
    const milestones = order.milestones;
    const milestoneCount = milestones.length;
    if (milestoneCount === 0) {
      return {
        milestoneCount: 0,
        completedCount: 0,
        servicedFraction: 0,
        servicedPct: 0,
        fullyServiced: false,
        partiallyServiced: false,
      };
    }

    const completed = milestones.filter((m) => m.completedAt != null);
    const completedCount = completed.length;

    const completedValue = completed.reduce((sum, m) => sum + num(m.valuePortion), 0);
    const valueFraction = valueExVat > 0 ? completedValue / valueExVat : 0;

    const maxPercent = completed.reduce((max, m) => Math.max(max, num(m.percentPortion)), 0);
    const percentFraction = maxPercent / 100;

    const rawFraction = Math.max(valueFraction, percentFraction);
    const servicedFraction = Math.min(1, Math.max(0, rawFraction));

    const fullyServiced = completedCount === milestoneCount || servicedFraction >= 1;
    const partiallyServiced = completedCount > 0 && completedCount < milestoneCount && !fullyServiced;

    return {
      milestoneCount,
      completedCount,
      servicedFraction: round2(servicedFraction),
      servicedPct: round2(servicedFraction * 100),
      fullyServiced,
      partiallyServiced,
    };
  }

  /**
   * Resolve the standard VAT percentage from statutory config; fall back on absence.
   * vat_pct rows may be stored country-agnostic (currency null) or scoped to USD, so
   * we try the null-currency lookup first and fall back to the USD-scoped row.
   */
  async resolveVatPct(asOf: Date): Promise<number> {
    const value = (await this.lookupVatValue(asOf, undefined)) ?? (await this.lookupVatValue(asOf, 'USD'));
    if (value == null || value <= 0) {
      return DEFAULT_VAT_PCT;
    }
    // Stored as a percentage (e.g. 15). A fraction (e.g. 0.155) is normalised up so
    // either convention resolves to a sane percentage.
    return value < 1 ? value * 100 : value;
  }

  /** Look up the vat_pct value for a currency scope; null when absent/unparseable. */
  private async lookupVatValue(asOf: Date, currency?: string): Promise<number | null> {
    try {
      const row = await this.statutoryRates.valueAsOf(VAT_PCT_KEY, asOf, currency);
      const value = num(row.value);
      return value > 0 ? value : null;
    } catch {
      return null;
    }
  }
}
