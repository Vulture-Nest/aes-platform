import { Injectable, Logger } from '@nestjs/common';
import { AlertSeverity, Prisma } from '@prisma/client';
import { AlertService } from '../../command-centre/danger/alert.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ThresholdsService } from '../../reference/thresholds/thresholds.service';
import { OrderFinancialsService } from './order-financials.service';
import { OrderHealthService, OrderHealthState } from './order-health.service';

/** Statutory/threshold key for the standard VAT rate (percentage). */
const VAT_RATE_KEY = 'vat_standard';
/** Fallback VAT percentage when no threshold value is configured. */
const DEFAULT_VAT_PCT = 15;

/** The health states considered "red" — a transition INTO one of these raises an alert. */
const RED_STATES: ReadonlySet<OrderHealthState> = new Set([
  OrderHealthState.OVERDUE_PAYMENT,
  OrderHealthState.OVERDUE_SERVICE,
]);

/** Rule keys for the two red-state alerts (per-order, deduped by AlertService). */
const RULE_KEY: Record<string, string> = {
  [OrderHealthState.OVERDUE_PAYMENT]: 'order_health.overdue_payment',
  [OrderHealthState.OVERDUE_SERVICE]: 'order_health.overdue_service',
};

/** Prisma.Decimal | number | null -> number (never NaN). */
function num(value: Prisma.Decimal | number | null | undefined): number {
  if (value === null || value === undefined) {
    return 0;
  }
  return typeof value === 'number' ? value : Number(value);
}

/** Outcome of an order-health recalc run. */
export interface OrderHealthRecalcRunResult {
  /** Open (non-PAID) orders evaluated. */
  evaluated: number;
  /** Orders whose persisted health changed this run. */
  changed: number;
  /** Alerts raised on a fresh transition INTO a red state. */
  alertsRaised: number;
}

/** An order that isn't red is "green" for transition purposes (any non-red state). */
function isRed(state: OrderHealthState | null | undefined): boolean {
  return state != null && RED_STATES.has(state);
}

/**
 * OrderHealthRecalcService — G9c nightly job.
 *
 * Recomputes each open order's OrderHealth (via the pure {@link OrderHealthService}),
 * persists the result on the order (`lastHealth` + `healthEvaluatedAt`), and raises a
 * WATCH alert (via the existing {@link AlertService}) the FIRST time an order transitions
 * from a NON-red state into a red one (OVERDUE_PAYMENT / OVERDUE_SERVICE).
 *
 * Transition detection: an alert is raised only when the previously-persisted
 * `lastHealth` was NOT red and the newly-computed state IS red. If the order was
 * already red last night, no new alert fires (AlertService.raiseOrRefresh also
 * dedupes an already-active alert, so this is belt-and-braces). Orders that are
 * fully PAID are terminal and skipped.
 */
@Injectable()
export class OrderHealthRecalcService {
  private readonly logger = new Logger(OrderHealthRecalcService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly orderHealth: OrderHealthService,
    private readonly orderFinancials: OrderFinancialsService,
    private readonly alerts: AlertService,
    private readonly thresholds: ThresholdsService,
  ) {}

  /** Recompute + persist health for every open order and raise transition alerts. */
  async recalcAll(now: Date = new Date()): Promise<OrderHealthRecalcRunResult> {
    const [orders, vatPct] = await Promise.all([
      this.prisma.order.findMany({ include: { receipts: true } }),
      this.resolveVatPct(now),
    ]);

    let evaluated = 0;
    let changed = 0;
    let alertsRaised = 0;

    for (const order of orders) {
      const previous = (order.lastHealth as OrderHealthState | null) ?? null;
      // A PAID order that was already recorded PAID is terminal — skip re-evaluation.
      if (previous === OrderHealthState.PAID) {
        continue;
      }
      evaluated += 1;

      const next = this.evaluateOne(order, vatPct, now);

      if (next !== previous) {
        changed += 1;
        await this.prisma.order.update({
          where: { id: order.id },
          data: { lastHealth: next, healthEvaluatedAt: now },
        });
      } else {
        // Same state — still stamp the evaluation time so freshness is visible.
        await this.prisma.order.update({
          where: { id: order.id },
          data: { healthEvaluatedAt: now },
        });
      }

      // Transition INTO a red state from a non-red (or unknown) prior state -> alert.
      if (isRed(next) && !isRed(previous)) {
        await this.raiseRedAlert(order.id, order.reference, next);
        alertsRaised += 1;
      }
    }

    return { evaluated, changed, alertsRaised };
  }

  /**
   * Compute the health state for one order. Receipts are summed in the order's own
   * currency (native base, no implicit FX — matching the receivables/ageing panel).
   */
  private evaluateOne(
    order: Prisma.OrderGetPayload<{ include: { receipts: true } }>,
    vatPct: number,
    now: Date,
  ): OrderHealthState {
    const receivedTotal = order.receipts
      .filter((r) => r.currency === order.currency)
      .reduce((sum, r) => sum + num(r.amount), 0);

    // totalInclVat derived from the pure financials service (single source of truth).
    const { totalInclVat } = this.orderFinancials.compute({
      order: { valueExVat: num(order.valueExVat), vatRatePct: vatPct },
      receipts: [{ amountUsd: receivedTotal, amountZig: 0 }],
      expenses: [],
      rates: { officialRate: 1, streetRate: 1 },
      loanInterestTotal: 0,
    });

    return this.orderHealth.evaluate({
      receivedTotal,
      totalInclVat,
      serviced: order.serviced,
      today: now,
      // No closing date => never "past closing"; use a far-future sentinel.
      closingDate: order.closingDate ?? new Date(8640000000000000),
    });
  }

  /** Raise (or refresh) the WATCH alert for an order entering a red health state. */
  private async raiseRedAlert(
    orderId: string,
    reference: string,
    state: OrderHealthState,
  ): Promise<void> {
    const ruleKey = RULE_KEY[state];
    await this.alerts.raiseOrRefresh({
      ruleKey,
      severity: AlertSeverity.WATCH,
      subjectTable: 'orders',
      subjectId: orderId,
      message: `Order ${reference} is now ${state.replace('_', ' ').toLowerCase()}`,
      payload: { orderId, reference, health: state },
    });
    this.logger.log(`Order ${orderId} transitioned into ${state}; raised ${ruleKey}`);
  }

  /** Resolve the standard VAT percentage; fall back to the default on absence. Never throws. */
  private async resolveVatPct(asOf: Date): Promise<number> {
    try {
      const row = await this.thresholds.current(VAT_RATE_KEY);
      const value = num(row.value);
      return value > 0 ? value : DEFAULT_VAT_PCT;
    } catch {
      void asOf;
      return DEFAULT_VAT_PCT;
    }
  }
}
