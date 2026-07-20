import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';

describe('OrdersService', () => {
  const prisma = {
    order: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    client: { findUnique: jest.fn() },
    contract: { findUnique: jest.fn() },
    orderReceipt: { create: jest.fn() },
  };
  const audit = { record: jest.fn() };
  const lookups = { assertValid: jest.fn().mockResolvedValue(undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new OrdersService(prisma as any, audit as any, lookups as any);

  // A finance manager (may act on any order).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const manager = { id: 'actor', roles: [{ siteId: null, role: 'FINANCE_OFFICER' }] } as any;

  beforeEach(() => jest.clearAllMocks());

  it('throws NotFound when an order is missing', async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(service.findOne('id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects creating an order for an unknown client', async () => {
    prisma.client.findUnique.mockResolvedValue(null);
    await expect(
      service.create(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { clientId: 'c1', reference: 'O1', valueExVat: 100, currency: 'USD' } as any,
        'actor',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates an order and writes an audit record', async () => {
    prisma.client.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.order.create.mockResolvedValue({
      id: 'o1',
      clientId: 'c1',
      reference: 'O1',
      valueExVat: new Prisma.Decimal('100'),
      currency: 'USD',
    });
    const res = await service.create(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { clientId: 'c1', reference: 'O1', valueExVat: 100, currency: 'USD' } as any,
      'actor',
    );
    expect(res.id).toBe('o1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', tableName: 'orders', recordId: 'o1' }),
    );
  });

  it('records a receipt against an existing order', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', receipts: [], expenses: [] });
    prisma.orderReceipt.create.mockResolvedValue({
      id: 'r1',
      orderId: 'o1',
      amount: new Prisma.Decimal('50'),
      currency: 'USD',
    });
    const res = await service.recordReceipt(
      'o1',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { amount: 50, currency: 'USD', receivedDate: new Date('2025-07-01') } as any,
      manager,
    );
    expect(res.id).toBe('r1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tableName: 'order_receipts', recordId: 'r1' }),
    );
  });

  it('marks an order serviced with a STATUS_CHANGE audit', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: 'o1',
      serviced: false,
      servicedAt: null,
      receipts: [],
      expenses: [],
    });
    prisma.order.update.mockResolvedValue({
      id: 'o1',
      serviced: true,
      servicedAt: new Date('2025-07-19'),
    });
    const res = await service.markServiced('o1', manager);
    expect(res.serviced).toBe(true);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'STATUS_CHANGE', tableName: 'orders', recordId: 'o1' }),
    );
  });
});
