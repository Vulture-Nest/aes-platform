import { OrderHealthInput, OrderHealthService, OrderHealthState } from './order-health.service';

describe('OrderHealthService', () => {
  const service = new OrderHealthService();

  const before = new Date('2026-07-01T00:00:00Z');
  const closing = new Date('2026-07-15T00:00:00Z');
  const after = new Date('2026-07-20T00:00:00Z');

  interface Case {
    name: string;
    input: OrderHealthInput;
    expected: OrderHealthState;
  }

  const cases: Case[] = [
    {
      name: 'PAID when received equals total',
      input: {
        receivedTotal: 1000,
        totalInclVat: 1000,
        serviced: false,
        today: before,
        closingDate: closing,
      },
      expected: OrderHealthState.PAID,
    },
    {
      name: 'PAID when received exceeds total',
      input: {
        receivedTotal: 1200,
        totalInclVat: 1000,
        serviced: false,
        today: before,
        closingDate: closing,
      },
      expected: OrderHealthState.PAID,
    },
    {
      name: 'PAID at the lower +/-0.01 tolerance boundary (short by exactly 0.01)',
      input: {
        receivedTotal: 999.99,
        totalInclVat: 1000,
        serviced: false,
        today: before,
        closingDate: closing,
      },
      expected: OrderHealthState.PAID,
    },
    {
      name: 'not PAID when short by more than the 0.01 tolerance',
      input: {
        receivedTotal: 999.98,
        totalInclVat: 1000,
        serviced: false,
        today: before,
        closingDate: closing,
      },
      expected: OrderHealthState.ADVANCE_PAID,
    },
    {
      name: 'ADVANCE_PAID when part-paid and not serviced',
      input: {
        receivedTotal: 400,
        totalInclVat: 1000,
        serviced: false,
        today: before,
        closingDate: closing,
      },
      expected: OrderHealthState.ADVANCE_PAID,
    },
    {
      name: 'ADVANCE_PAID takes precedence over OVERDUE_SERVICE when part-paid and past closing',
      input: {
        receivedTotal: 400,
        totalInclVat: 1000,
        serviced: false,
        today: after,
        closingDate: closing,
      },
      expected: OrderHealthState.ADVANCE_PAID,
    },
    {
      name: 'OVERDUE_PAYMENT when serviced and past closing with no payment',
      input: {
        receivedTotal: 0,
        totalInclVat: 1000,
        serviced: true,
        today: after,
        closingDate: closing,
      },
      expected: OrderHealthState.OVERDUE_PAYMENT,
    },
    {
      name: 'AWAITING_PAYMENT when serviced and still within closing',
      input: {
        receivedTotal: 0,
        totalInclVat: 1000,
        serviced: true,
        today: before,
        closingDate: closing,
      },
      expected: OrderHealthState.AWAITING_PAYMENT,
    },
    {
      name: 'AWAITING_PAYMENT at the closing-date boundary (today === closing)',
      input: {
        receivedTotal: 0,
        totalInclVat: 1000,
        serviced: true,
        today: closing,
        closingDate: closing,
      },
      expected: OrderHealthState.AWAITING_PAYMENT,
    },
    {
      name: 'OVERDUE_SERVICE when not serviced, unpaid, and past closing',
      input: {
        receivedTotal: 0,
        totalInclVat: 1000,
        serviced: false,
        today: after,
        closingDate: closing,
      },
      expected: OrderHealthState.OVERDUE_SERVICE,
    },
    {
      name: 'PARTIALLY_SERVICED when some but not all milestones complete',
      input: {
        receivedTotal: 0,
        totalInclVat: 1000,
        serviced: false,
        today: before,
        closingDate: closing,
        milestones: [
          { value: 500, completed: true },
          { value: 500, completed: false },
        ],
      },
      expected: OrderHealthState.PARTIALLY_SERVICED,
    },
    {
      name: 'OPEN when all milestones complete but serviced tick is still false',
      input: {
        receivedTotal: 0,
        totalInclVat: 1000,
        serviced: false,
        today: before,
        closingDate: closing,
        milestones: [
          { value: 500, completed: true },
          { value: 500, completed: true },
        ],
      },
      expected: OrderHealthState.OPEN,
    },
    {
      name: 'OPEN when no milestones are complete',
      input: {
        receivedTotal: 0,
        totalInclVat: 1000,
        serviced: false,
        today: before,
        closingDate: closing,
        milestones: [
          { value: 500, completed: false },
          { value: 500, completed: false },
        ],
      },
      expected: OrderHealthState.OPEN,
    },
    {
      name: 'OPEN when nothing has happened and no milestones supplied',
      input: {
        receivedTotal: 0,
        totalInclVat: 1000,
        serviced: false,
        today: before,
        closingDate: closing,
      },
      expected: OrderHealthState.OPEN,
    },
    {
      name: 'PAID beats a serviced+overdue situation (fully paid wins first)',
      input: {
        receivedTotal: 1000,
        totalInclVat: 1000,
        serviced: true,
        today: after,
        closingDate: closing,
      },
      expected: OrderHealthState.PAID,
    },
  ];

  it.each(cases)('$name', ({ input, expected }) => {
    expect(service.evaluate(input)).toBe(expected);
  });
});
