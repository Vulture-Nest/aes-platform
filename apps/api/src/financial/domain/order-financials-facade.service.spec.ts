import { Prisma } from '@prisma/client';
import { LoanInterestService } from './loan-interest.service';
import { OrderFinancialsFacadeService } from './order-financials-facade.service';
import { OrderFinancialsService } from './order-financials.service';
import { OrderHealthService, OrderHealthState } from './order-health.service';

const dec = (n: number) => new Prisma.Decimal(n);

/** Build an order row (with relations) for the facade. */
function order(overrides: Partial<{
  valueExVat: number;
  currency: string;
  serviced: boolean;
  closingDate: Date | null;
  receipts: Array<{ amount: number; currency: string }>;
  expenses: Array<{ amount: number }>;
  milestones: Array<{ valuePortion: number; percentPortion: number | null; completedAt: Date | null }>;
}> = {}) {
  return {
    id: 'o1',
    valueExVat: dec(overrides.valueExVat ?? 10000),
    currency: overrides.currency ?? 'USD',
    serviced: overrides.serviced ?? false,
    closingDate: overrides.closingDate ?? null,
    receipts: (overrides.receipts ?? []).map((r) => ({ amount: dec(r.amount), currency: r.currency })),
    expenses: (overrides.expenses ?? []).map((e) => ({ amount: dec(e.amount) })),
    milestones: (overrides.milestones ?? []).map((m) => ({
      valuePortion: dec(m.valuePortion),
      percentPortion: m.percentPortion == null ? null : dec(m.percentPortion),
      completedAt: m.completedAt ?? null,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('OrderFinancialsFacadeService', () => {
  const statutory = { valueAsOf: jest.fn() };
  const prisma = { order: { findUnique: jest.fn() } };
  const build = () =>
    new OrderFinancialsFacadeService(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      prisma as any,
      new OrderFinancialsService(),
      new OrderHealthService(),
      new LoanInterestService(),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      statutory as any,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    statutory.valueAsOf.mockResolvedValue({ value: dec(15) });
  });

  it('computes profit ex VAT, margin, outstanding, spent-to-date and total incl VAT (G16)', async () => {
    const svc = build();
    const snap = await svc.forOrder(
      order({ valueExVat: 10000, expenses: [{ amount: 4000 }], receipts: [{ amount: 5000, currency: 'USD' }] }),
      new Date('2026-07-24T00:00:00Z'),
    );
    expect(snap.vat).toBe(1500); // 10000 * 15%
    expect(snap.totalInclVat).toBe(11500);
    expect(snap.spentToDate).toBe(4000);
    expect(snap.received).toBe(5000);
    expect(snap.outstanding).toBe(6500); // 11500 - 5000
    expect(snap.profitExVat).toBe(6000); // 10000 - 4000
    expect(snap.margin).toBe(0.6); // 6000 / 10000
    expect(snap.vatRatePct).toBe(15);
  });

  it('an order WITHOUT milestones keeps binary-serviced behaviour (parity untouched)', async () => {
    const svc = build();
    const snap = await svc.forOrder(order({ serviced: false, receipts: [] }));
    expect(snap.serviced.milestoneCount).toBe(0);
    expect(snap.serviced.servicedPct).toBe(0);
    expect(snap.serviced.partiallyServiced).toBe(false);
    expect(snap.health).toBe(OrderHealthState.OPEN);
  });

  it('returns PARTIALLY_SERVICED when some (not all) milestones are complete (G18)', async () => {
    const svc = build();
    const snap = await svc.forOrder(
      order({
        valueExVat: 10000,
        milestones: [
          { valuePortion: 4000, percentPortion: null, completedAt: new Date('2026-07-01') },
          { valuePortion: 6000, percentPortion: null, completedAt: null },
        ],
      }),
    );
    expect(snap.serviced.servicedPct).toBe(40); // 4000 / 10000
    expect(snap.serviced.partiallyServiced).toBe(true);
    expect(snap.serviced.fullyServiced).toBe(false);
    expect(snap.health).toBe(OrderHealthState.PARTIALLY_SERVICED);
  });

  it('uses the max percentPortion basis when larger than the value basis', async () => {
    const svc = build();
    const snap = await svc.forOrder(
      order({
        valueExVat: 10000,
        milestones: [
          { valuePortion: 0, percentPortion: 60, completedAt: new Date('2026-07-01') },
          { valuePortion: 0, percentPortion: null, completedAt: null },
        ],
      }),
    );
    expect(snap.serviced.servicedPct).toBe(60);
    expect(snap.serviced.partiallyServiced).toBe(true);
  });

  it('treats a fully-serviced milestone order as serviced (all milestones complete)', async () => {
    const svc = build();
    const snap = await svc.forOrder(
      order({
        valueExVat: 10000,
        closingDate: new Date('2026-07-15'),
        milestones: [
          { valuePortion: 5000, percentPortion: null, completedAt: new Date('2026-07-01') },
          { valuePortion: 5000, percentPortion: null, completedAt: new Date('2026-07-02') },
        ],
      }),
      new Date('2026-07-10T00:00:00Z'),
    );
    expect(snap.serviced.fullyServiced).toBe(true);
    expect(snap.serviced.partiallyServiced).toBe(false);
    // Serviced + within closing + unpaid => AWAITING_PAYMENT.
    expect(snap.health).toBe(OrderHealthState.AWAITING_PAYMENT);
  });

  it('falls back to a 15% VAT default when no statutory rate is configured', async () => {
    const svc = build();
    statutory.valueAsOf.mockRejectedValue(new Error('no rate'));
    const pct = await svc.resolveVatPct(new Date());
    expect(pct).toBe(15);
  });

  it('normalises a fractional VAT rate (0.155) up to a percentage (15.5)', async () => {
    const svc = build();
    statutory.valueAsOf.mockResolvedValue({ value: dec(0.155) });
    const pct = await svc.resolveVatPct(new Date());
    expect(pct).toBe(15.5);
  });

  it('returns null for a missing order id', async () => {
    const svc = build();
    prisma.order.findUnique.mockResolvedValue(null);
    expect(await svc.forOrderId('nope')).toBeNull();
  });
});
