import { Injectable } from '@nestjs/common';

/**
 * OrderHealth state machine (Appendix A).
 *
 * Pure, self-contained domain service: no Prisma, no I/O, no dependencies.
 * Takes plain typed inputs and returns a computed {@link OrderHealthState}.
 * All money is passed in as plain numbers (already normalised to a single
 * currency by the caller); this service performs no rounding beyond the
 * PAID tolerance comparison.
 */

/** Possible health states of an order, in strict first-match evaluation order. */
export enum OrderHealthState {
  /** received >= totalInclVat (within tolerance). */
  PAID = 'PAID',
  /** received > 0 but the order has not yet been serviced. */
  ADVANCE_PAID = 'ADVANCE_PAID',
  /** serviced and past the closing date without full payment. */
  OVERDUE_PAYMENT = 'OVERDUE_PAYMENT',
  /** serviced and still within the closing date, awaiting payment. */
  AWAITING_PAYMENT = 'AWAITING_PAYMENT',
  /** not serviced and past the closing date. */
  OVERDUE_SERVICE = 'OVERDUE_SERVICE',
  /** some, but not all, service milestones are complete. */
  PARTIALLY_SERVICED = 'PARTIALLY_SERVICED',
  /** nothing has happened yet. */
  OPEN = 'OPEN',
}

/** A single service milestone with a monetary value and completion flag. */
export interface ServiceMilestone {
  /** Monetary value of this milestone (informational; not required for the tick). */
  value: number;
  /** Whether this milestone has been completed. */
  completed: boolean;
}

/** Inputs to the OrderHealth state machine. */
export interface OrderHealthInput {
  /** Total amount received against the order. */
  receivedTotal: number;
  /** Total order value including VAT. */
  totalInclVat: number;
  /** Binary serviced tick (the default servicing model). */
  serviced: boolean;
  /** The evaluation date ("now"). */
  today: Date;
  /** The order's closing (due) date. */
  closingDate: Date;
  /** Optional granular service milestones; used only for PARTIALLY_SERVICED. */
  milestones?: ServiceMilestone[];
}

/** Absolute tolerance (in currency units) for the PAID comparison. */
const PAID_TOLERANCE = 0.01;

@Injectable()
export class OrderHealthService {
  /**
   * Compute the health state of an order using strict first-match semantics.
   * The first branch whose condition holds wins; later branches are not
   * evaluated. Branch order is significant and mirrors {@link OrderHealthState}.
   */
  evaluate(input: OrderHealthInput): OrderHealthState {
    const { receivedTotal, totalInclVat, serviced, today, closingDate, milestones } = input;

    const pastClosing = this.isPastClosing(today, closingDate);

    // 1. PAID: fully received within tolerance.
    if (receivedTotal >= totalInclVat - PAID_TOLERANCE) {
      return OrderHealthState.PAID;
    }

    // 2. ADVANCE_PAID: money in, but not yet serviced.
    if (receivedTotal > 0 && !serviced) {
      return OrderHealthState.ADVANCE_PAID;
    }

    // 3/4. Serviced: either overdue on payment or awaiting it.
    if (serviced) {
      return pastClosing ? OrderHealthState.OVERDUE_PAYMENT : OrderHealthState.AWAITING_PAYMENT;
    }

    // 5. OVERDUE_SERVICE: not serviced and past the closing date.
    if (pastClosing) {
      return OrderHealthState.OVERDUE_SERVICE;
    }

    // 6. PARTIALLY_SERVICED: some but not all milestones complete.
    if (this.isPartiallyServiced(milestones)) {
      return OrderHealthState.PARTIALLY_SERVICED;
    }

    // 7. OPEN: nothing else applies.
    return OrderHealthState.OPEN;
  }

  /** True when `today` is strictly after `closingDate`. */
  private isPastClosing(today: Date, closingDate: Date): boolean {
    return today.getTime() > closingDate.getTime();
  }

  /** True when at least one milestone is complete but not all of them are. */
  private isPartiallyServiced(milestones?: ServiceMilestone[]): boolean {
    if (!milestones || milestones.length === 0) {
      return false;
    }
    const completed = milestones.filter((m) => m.completed).length;
    return completed > 0 && completed < milestones.length;
  }
}
