import { Prisma } from '@prisma/client';
import { OrderFinancialsService } from './order-financials.service';
import { OrderHealthRecalcService } from './order-health-recalc.service';
import { OrderHealthService, OrderHealthState } from './order-health.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function makeService(orders: any[]) {
  const prisma = {
    order: {
      findMany: jest.fn().mockResolvedValue(orders),
      update: jest.fn(async ({ data }: any) => data),
    },
  };
  const alerts = { raiseOrRefresh: jest.fn().mockResolvedValue({ id: 'alert1' }) };
  // Threshold lookup throws => VAT falls back to the 15% default (fine for these cases).
  const thresholds = { current: jest.fn().mockRejectedValue(new Error('unseeded')) };

  const service = new OrderHealthRecalcService(
    prisma as any,
    new OrderHealthService(),
    new OrderFinancialsService(),
    alerts as any,
    thresholds as any,
  );
  return { service, prisma, alerts };
}

/** An order that, evaluated now, is OVERDUE_SERVICE: not serviced, no receipts, past closing. */
function overdueServiceOrder(overrides: any = {}) {
  return {
    id: 'o1',
    reference: 'ORD-001',
    valueExVat: dec(1000),
    currency: 'USD',
    closingDate: day('2026-06-01'), // in the past relative to the run date
    serviced: false,
    receipts: [],
    lastHealth: null,
    ...overrides,
  };
}

describe('OrderHealthRecalcService', () => {
  const now = day('2026-07-01');

  it('raises a WATCH alert on a transition from a non-red state INTO OVERDUE_SERVICE', async () => {
    // Previously OPEN (non-red); now past closing + unserviced => OVERDUE_SERVICE (red).
    const order = overdueServiceOrder({ lastHealth: OrderHealthState.OPEN });
    const { service, prisma, alerts } = makeService([order]);

    const res = await service.recalcAll(now);

    expect(res.alertsRaised).toBe(1);
    expect(alerts.raiseOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({
        ruleKey: 'order_health.overdue_service',
        severity: 'WATCH',
        subjectTable: 'orders',
        subjectId: 'o1',
      }),
    );
    // Persisted the new state.
    const update = prisma.order.update.mock.calls[0][0];
    expect(update.data.lastHealth).toBe(OrderHealthState.OVERDUE_SERVICE);
  });

  it('raises the alert on a first-ever evaluation (prior lastHealth = null) into a red state', async () => {
    const order = overdueServiceOrder({ lastHealth: null });
    const { service, alerts } = makeService([order]);
    const res = await service.recalcAll(now);
    expect(res.alertsRaised).toBe(1);
    expect(alerts.raiseOrRefresh).toHaveBeenCalledTimes(1);
  });

  it('does NOT raise a new alert when the order was ALREADY red last night', async () => {
    const order = overdueServiceOrder({ lastHealth: OrderHealthState.OVERDUE_SERVICE });
    const { service, prisma, alerts } = makeService([order]);

    const res = await service.recalcAll(now);

    expect(res.alertsRaised).toBe(0);
    expect(alerts.raiseOrRefresh).not.toHaveBeenCalled();
    // State unchanged => only the freshness timestamp is stamped, no lastHealth change.
    const update = prisma.order.update.mock.calls[0][0];
    expect(update.data.lastHealth).toBeUndefined();
    expect(update.data.healthEvaluatedAt).toEqual(now);
  });

  it('raises OVERDUE_PAYMENT alert when a serviced order goes past closing', async () => {
    // serviced + past closing + not fully paid => OVERDUE_PAYMENT (red).
    const order = overdueServiceOrder({
      serviced: true,
      lastHealth: OrderHealthState.AWAITING_PAYMENT,
    });
    const { service, alerts } = makeService([order]);
    const res = await service.recalcAll(now);
    expect(res.alertsRaised).toBe(1);
    expect(alerts.raiseOrRefresh).toHaveBeenCalledWith(
      expect.objectContaining({ ruleKey: 'order_health.overdue_payment' }),
    );
  });

  it('skips terminal PAID orders and never alerts on them', async () => {
    const order = overdueServiceOrder({
      lastHealth: OrderHealthState.PAID,
      receipts: [{ amount: dec(1150), currency: 'USD' }], // fully paid incl 15% VAT
    });
    const { service, prisma, alerts } = makeService([order]);
    const res = await service.recalcAll(now);
    expect(res.evaluated).toBe(0);
    expect(alerts.raiseOrRefresh).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('does not alert when a green order stays green (e.g. AWAITING_PAYMENT before closing)', async () => {
    const order = overdueServiceOrder({
      serviced: true,
      closingDate: day('2026-12-31'), // not past closing
      lastHealth: OrderHealthState.OPEN,
    });
    const { service, alerts } = makeService([order]);
    const res = await service.recalcAll(now);
    expect(res.alertsRaised).toBe(0);
    expect(alerts.raiseOrRefresh).not.toHaveBeenCalled();
  });
});
