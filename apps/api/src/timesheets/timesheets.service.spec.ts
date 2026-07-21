import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { ApprovalStatus, Prisma, TimesheetPeriodStatus } from '@prisma/client';
import { StatusTransitionRegistry } from '../approvals/status-transition.registry';
import { TimesheetsService } from './timesheets.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

const dec = (n: number) => new Prisma.Decimal(n);

function makeService(maxHoursPerDay = 24) {
  const prisma = {
    site: { findUnique: jest.fn() },
    employee: { findMany: jest.fn().mockResolvedValue([]) },
    timesheetPeriod: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    timesheetEntry: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn(),
      upsert: jest.fn(),
    },
    $transaction: jest.fn().mockResolvedValue([]),
    rlsTx: jest.fn().mockImplementation(async (cb: any) => cb(prisma)),
  };
  const audit = { record: jest.fn() };
  const approvals = { submit: jest.fn().mockResolvedValue({ id: 'chain1' }) };
  const transitions = new StatusTransitionRegistry();
  const config = { get: jest.fn().mockReturnValue({ maxHoursPerDay }) };

  const service = new TimesheetsService(
    prisma as any,
    audit as any,
    approvals as any,
    transitions,
    config as any,
  );
  service.onModuleInit();
  return { service, prisma, audit, approvals, transitions };
}

describe('TimesheetsService.createPeriod', () => {
  it('creates an OPEN period when none exists for the (site, month)', async () => {
    const { service, prisma } = makeService();
    prisma.site.findUnique.mockResolvedValue({ id: 's1' });
    prisma.timesheetPeriod.findUnique.mockResolvedValue(null);
    prisma.timesheetPeriod.create.mockResolvedValue({ id: 'p1', status: 'OPEN' });

    await service.createPeriod({ siteId: 's1', month: '2026-07' }, 'u1');

    expect(prisma.timesheetPeriod.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ siteId: 's1', month: '2026-07', status: 'OPEN' }),
      }),
    );
  });

  it('rejects a duplicate period for the same site + month', async () => {
    const { service, prisma } = makeService();
    prisma.site.findUnique.mockResolvedValue({ id: 's1' });
    prisma.timesheetPeriod.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.createPeriod({ siteId: 's1', month: '2026-07' }, 'u1'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('TimesheetsService.upsertEntries', () => {
  it('rejects edits once the period is LOCKED', async () => {
    const { service, prisma } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      siteId: 's1',
      status: TimesheetPeriodStatus.LOCKED,
    });
    await expect(
      service.upsertEntries(
        'p1',
        { rows: [{ employeeId: 'e1', date: new Date('2026-07-15'), hoursNormal: 8 }] },
        'u1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects edits once the period is SITE_APPROVED', async () => {
    const { service, prisma } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      siteId: 's1',
      status: TimesheetPeriodStatus.SITE_APPROVED,
    });
    await expect(
      service.upsertEntries(
        'p1',
        { rows: [{ employeeId: 'e1', date: new Date('2026-07-15'), hoursNormal: 8 }] },
        'u1',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects the whole batch when any row exceeds max hours/day', async () => {
    const { service, prisma } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      siteId: 's1',
      status: TimesheetPeriodStatus.OPEN,
    });
    await expect(
      service.upsertEntries(
        'p1',
        {
          rows: [
            { employeeId: 'e1', date: new Date('2026-07-15'), hoursNormal: 8 },
            { employeeId: 'e1', date: new Date('2026-07-16'), hoursNormal: 30 },
          ],
        },
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects rows for an employee not on the period site', async () => {
    const { service, prisma } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      siteId: 's1',
      status: TimesheetPeriodStatus.OPEN,
    });
    prisma.employee.findMany.mockResolvedValue([{ id: 'e1', siteId: 'OTHER' }]);
    await expect(
      service.upsertEntries(
        'p1',
        { rows: [{ employeeId: 'e1', date: new Date('2026-07-15'), hoursNormal: 8 }] },
        'u1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('upserts valid rows into an OPEN period and reports anomalies', async () => {
    const { service, prisma } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      siteId: 's1',
      status: TimesheetPeriodStatus.OPEN,
    });
    prisma.employee.findMany.mockResolvedValue([{ id: 'e1', siteId: 's1' }]);
    prisma.timesheetEntry.upsert.mockReturnValue('op');

    const result = await service.upsertEntries(
      'p1',
      {
        rows: [
          { employeeId: 'e1', date: new Date('2026-07-15'), hoursNormal: 8 },
          { employeeId: 'e1', date: new Date('2026-07-16'), hoursOt15: 3 }, // anomaly: OT-only
        ],
      },
      'u1',
    );

    expect(result).toEqual({ upserted: 2, anomalies: 1 });
    expect(prisma.rlsTx).toHaveBeenCalledTimes(1);
  });
});

describe('TimesheetsService.submit', () => {
  it('routes an OPEN period with entries into the approval engine', async () => {
    const { service, prisma, approvals } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      siteId: 's1',
      status: TimesheetPeriodStatus.OPEN,
    });
    prisma.timesheetEntry.count.mockResolvedValue(5);

    await service.submit('p1', 'u1');

    expect(approvals.submit).toHaveBeenCalledWith(
      expect.objectContaining({
        module: 'timesheet_period',
        subjectTable: 'timesheet_periods',
        subjectId: 'p1',
        siteId: 's1',
        requesterId: 'u1',
      }),
    );
  });

  it('refuses to submit a period with no entries', async () => {
    const { service, prisma } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      siteId: 's1',
      status: TimesheetPeriodStatus.OPEN,
    });
    prisma.timesheetEntry.count.mockResolvedValue(0);
    await expect(service.submit('p1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses to submit a non-OPEN period', async () => {
    const { service, prisma } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      siteId: 's1',
      status: TimesheetPeriodStatus.LOCKED,
    });
    await expect(service.submit('p1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TimesheetsService — status transitions', () => {
  it('flips OPEN -> SITE_APPROVED when the approval chain resolves APPROVED', async () => {
    const { prisma, transitions } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      status: TimesheetPeriodStatus.OPEN,
    });
    prisma.timesheetPeriod.update.mockResolvedValue({ id: 'p1' });

    await transitions.fire('timesheet_periods', 'p1', ApprovalStatus.APPROVED);

    expect(prisma.timesheetPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'p1' },
        data: { status: TimesheetPeriodStatus.SITE_APPROVED },
      }),
    );
  });

  it('leaves the period OPEN on REJECTED', async () => {
    const { prisma, transitions } = makeService();
    await transitions.fire('timesheet_periods', 'p1', ApprovalStatus.REJECTED);
    expect(prisma.timesheetPeriod.update).not.toHaveBeenCalled();
  });
});

describe('TimesheetsService.lock', () => {
  it('locks a SITE_APPROVED period and stamps lockedAt', async () => {
    const { service, prisma } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      status: TimesheetPeriodStatus.SITE_APPROVED,
    });
    prisma.timesheetPeriod.update.mockResolvedValue({ id: 'p1', status: 'LOCKED' });

    await service.lock('p1', 'u1');

    expect(prisma.timesheetPeriod.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: TimesheetPeriodStatus.LOCKED }),
      }),
    );
    const call = prisma.timesheetPeriod.update.mock.calls[0][0];
    expect(call.data.lockedAt).toBeInstanceOf(Date);
  });

  it('refuses to lock an OPEN period', async () => {
    const { service, prisma } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      status: TimesheetPeriodStatus.OPEN,
    });
    await expect(service.lock('p1', 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TimesheetsService.getForPayroll', () => {
  it('allows reading a LOCKED period', async () => {
    const { service, prisma } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      status: TimesheetPeriodStatus.LOCKED,
      entries: [],
    });
    await expect(service.getForPayroll('p1')).resolves.toMatchObject({ id: 'p1' });
  });

  it('blocks payroll from reading an OPEN period', async () => {
    const { service, prisma } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      status: TimesheetPeriodStatus.OPEN,
      entries: [],
    });
    await expect(service.getForPayroll('p1')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('TimesheetsService.manhours', () => {
  it('aggregates per-employee totals per category', async () => {
    const { service, prisma } = makeService();
    prisma.timesheetPeriod.findUnique.mockResolvedValue({
      id: 'p1',
      siteId: 's1',
      month: '2026-07',
      status: TimesheetPeriodStatus.LOCKED,
    });
    prisma.timesheetEntry.findMany.mockResolvedValue([
      {
        employeeId: 'e1',
        hoursNormal: dec(8),
        hoursOt15: dec(0),
        hoursOt20: dec(0),
        ugShift: dec(1),
        nightHours: dec(0),
        employee: { worksNo: 'W-1', firstName: 'A', lastName: 'B' },
      },
      {
        employeeId: 'e1',
        hoursNormal: dec(8),
        hoursOt15: dec(2),
        hoursOt20: dec(0),
        ugShift: dec(0),
        nightHours: dec(0),
        employee: { worksNo: 'W-1', firstName: 'A', lastName: 'B' },
      },
    ]);

    const result = await service.manhours('p1');
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      employeeId: 'e1',
      hoursNormal: 16,
      hoursOt15: 2,
      ugShift: 1,
      totalHours: 19,
    });
  });
});
