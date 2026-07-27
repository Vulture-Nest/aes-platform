import { BadRequestException } from '@nestjs/common';
import { SheService } from './she.service';

function makePrisma() {
  return {
    site: { findUnique: jest.fn() },
    sheRecord: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };
}

describe('SheService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  const audit = { record: jest.fn() };
  let service: SheService;

  beforeEach(() => {
    prisma = makePrisma();
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new SheService(prisma as any, audit as any);
  });

  it('creates a record with the caller as reporter and the site entity, defaulting status OPEN', async () => {
    prisma.site.findUnique.mockResolvedValue({ id: 's1', entityId: 'e1' });
    prisma.sheRecord.create.mockImplementation(async (args: any) => ({ id: 'r1', ...args.data }));

    const res = await service.create(
      { type: 'INCIDENT', siteId: 's1', title: 'Slip', occurredAt: '2026-07-27T08:00:00.000Z' },
      'actor',
    );

    expect(res.id).toBe('r1');
    const createArg = prisma.sheRecord.create.mock.calls[0][0];
    expect(createArg.data.entityId).toBe('e1');
    expect(createArg.data.reportedByUserId).toBe('actor');
    expect(createArg.data.status).toBe('OPEN');
    expect(createArg.data.lti).toBe(false);
    expect(createArg.data.occurredAt).toBeInstanceOf(Date);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }));
  });

  it('rejects creating a record for a non-existent site', async () => {
    prisma.site.findUnique.mockResolvedValue(null);
    await expect(
      service.create(
        { type: 'HAZARD', siteId: 'missing', title: 'x', occurredAt: '2026-07-27T08:00:00.000Z' },
        'actor',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.sheRecord.create).not.toHaveBeenCalled();
  });

  it('lists records applying site/type/status filters', async () => {
    prisma.sheRecord.findMany.mockResolvedValue([{ id: 'r1' }]);
    const res = await service.list({ siteId: 's1', type: 'NEAR_MISS', status: 'OPEN' });
    expect(res).toEqual([{ id: 'r1' }]);
    const arg = prisma.sheRecord.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ siteId: 's1', type: 'NEAR_MISS', status: 'OPEN' });
  });

  it('builds a TRIFR-style summary: counts by type, LTI and open investigations', async () => {
    prisma.sheRecord.groupBy.mockResolvedValue([
      { type: 'INCIDENT', _count: { _all: 3 } },
      { type: 'NEAR_MISS', _count: { _all: 2 } },
    ]);
    // count() is called for LTI then open investigations, in that order.
    prisma.sheRecord.count.mockResolvedValueOnce(1).mockResolvedValueOnce(4);

    const res = await service.stats({ siteId: 's1' });

    expect(res.siteId).toBe('s1');
    expect(res.total).toBe(5);
    expect(res.byType.INCIDENT).toBe(3);
    expect(res.byType.NEAR_MISS).toBe(2);
    // every known type is present, zero-filled
    expect(res.byType.DRILL).toBe(0);
    expect(res.incidentCount).toBe(3);
    expect(res.ltiCount).toBe(1);
    expect(res.openInvestigations).toBe(4);
    expect(prisma.sheRecord.count).toHaveBeenNthCalledWith(1, {
      where: { siteId: 's1', lti: true },
    });
    expect(prisma.sheRecord.count).toHaveBeenNthCalledWith(2, {
      where: { siteId: 's1', status: { not: 'CLOSED' } },
    });
  });
});
