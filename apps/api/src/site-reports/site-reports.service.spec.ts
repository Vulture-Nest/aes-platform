import { ConflictException } from '@nestjs/common';
import { SiteReportsService, STANDARD_SECTIONS } from './site-reports.service';

function makePrisma() {
  return {
    site: { findUnique: jest.fn(), findMany: jest.fn() },
    contract: { findMany: jest.fn() },
    siteReportPeriod: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    siteReportSection: { update: jest.fn(), create: jest.fn() },
    siteKpi: { findFirst: jest.fn() },
    siteKpiActual: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
  };
}

describe('SiteReportsService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  const audit = { record: jest.fn() };
  let service: SiteReportsService;

  beforeEach(() => {
    prisma = makePrisma();
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new SiteReportsService(prisma as any, audit as any);
  });

  it('opens a period with the full standard section set', async () => {
    prisma.site.findUnique.mockResolvedValue({ id: 's1', entityId: 'e1' });
    prisma.siteReportPeriod.findUnique.mockResolvedValue(null);
    prisma.siteReportPeriod.create.mockImplementation(async (args: any) => ({
      id: 'p1',
      siteId: 's1',
      periodMonth: '2026-07',
      status: 'OPEN',
      sections: args.data.sections.create,
    }));

    const res = await service.open({ siteId: 's1', periodMonth: '2026-07' }, 'actor');
    expect(res.id).toBe('p1');
    const createArg = prisma.siteReportPeriod.create.mock.calls[0][0];
    expect(createArg.data.sections.create).toHaveLength(STANDARD_SECTIONS.length);
    expect(createArg.data.entityId).toBe('e1');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }));
  });

  it('rejects opening a duplicate period', async () => {
    prisma.site.findUnique.mockResolvedValue({ id: 's1', entityId: null });
    prisma.siteReportPeriod.findUnique.mockResolvedValue({ id: 'exists' });
    await expect(service.open({ siteId: 's1', periodMonth: '2026-07' }, 'actor')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('rejects submitting an already-submitted report', async () => {
    prisma.siteReportPeriod.findUnique.mockResolvedValue({ id: 'p1', status: 'LOCKED', sections: [] });
    await expect(service.submit('p1', { narrative: 'x' }, 'actor')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('locks on submit and flags timeliness RED when past deadline', async () => {
    const pastDeadline = new Date(Date.now() - 60 * 60 * 1000);
    prisma.siteReportPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'OPEN',
      siteId: 's1',
      contractId: 'c1',
      periodMonth: '2026-07',
      deadline: pastDeadline,
      sections: [],
    });
    prisma.siteReportPeriod.update.mockResolvedValue({ id: 'p1', status: 'LOCKED', sections: [] });
    prisma.siteKpi.findFirst.mockResolvedValue({ id: 'kpi-timeliness' });
    prisma.siteKpiActual.findFirst.mockResolvedValue(null);

    const res = await service.submit('p1', { narrative: 'done' }, 'actor');
    expect(res.late).toBe(true);
    expect(prisma.siteReportPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'LOCKED' }) }),
    );
    expect(prisma.siteKpiActual.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actualValue: 0, rag: 'RED' }) }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'STATUS_CHANGE' }));
  });

  it('submits on-time with a GREEN timeliness flag', async () => {
    const futureDeadline = new Date(Date.now() + 60 * 60 * 1000);
    prisma.siteReportPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'OPEN',
      siteId: 's1',
      contractId: null,
      periodMonth: '2026-07',
      deadline: futureDeadline,
      sections: [],
    });
    prisma.siteReportPeriod.update.mockResolvedValue({ id: 'p1', status: 'LOCKED', sections: [] });
    prisma.siteKpi.findFirst.mockResolvedValue({ id: 'kpi-timeliness' });
    prisma.siteKpiActual.findFirst.mockResolvedValue(null);

    const res = await service.submit('p1', { narrative: 'done' }, 'actor');
    expect(res.late).toBe(false);
    expect(prisma.siteKpiActual.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ actualValue: 100, rag: 'GREEN' }) }),
    );
  });

  it('rejects editing a section on a locked report', async () => {
    prisma.siteReportPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      status: 'LOCKED',
      sections: [{ id: 'sec1', sectionKey: 'ADMIN' }],
    });
    await expect(
      service.updateSection('p1', 'ADMIN', { content: {} }, 'actor'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('opens periods only for long-contract sites without an existing period', async () => {
    prisma.contract.findMany.mockResolvedValue([{ clientId: 'cl1' }]);
    prisma.site.findMany.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);
    // s1 already has a period, s2 does not
    prisma.siteReportPeriod.findUnique
      .mockResolvedValueOnce({ id: 'existing' }) // openForMonth existence check for s1
      .mockResolvedValueOnce(null) // openForMonth existence check for s2
      .mockResolvedValueOnce(null); // open() duplicate check for s2
    prisma.site.findUnique.mockResolvedValue({ id: 's2', entityId: null });
    prisma.siteReportPeriod.create.mockResolvedValue({ id: 'p2', siteId: 's2', periodMonth: '2026-07', status: 'OPEN', sections: [] });

    const res = await service.openForMonth({ periodMonth: '2026-07' }, 'actor');
    expect(res.opened).toBe(1);
    expect(res.created[0].siteId).toBe('s2');
  });
});
