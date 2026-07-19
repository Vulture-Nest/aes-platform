import { NotFoundException } from '@nestjs/common';
import { AlertSeverity } from '@prisma/client';
import { AlertService } from './alert.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeService() {
  const prisma = {
    alert: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
    userSiteRole: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const notifications = { send: jest.fn().mockResolvedValue([]) };
  const audit = { record: jest.fn() };
  const service = new AlertService(prisma as any, notifications as any, audit as any);
  return { service, prisma, notifications, audit };
}

describe('AlertService.raiseOrRefresh (dedupe)', () => {
  it('refreshes an existing active alert instead of creating a duplicate (no re-notify)', async () => {
    const { service, prisma, notifications } = makeService();
    prisma.alert.findFirst.mockResolvedValue({ id: 'a1', ruleKey: 'coverage_ratio' });
    prisma.alert.update.mockResolvedValue({ id: 'a1' });

    await service.raiseOrRefresh({
      ruleKey: 'coverage_ratio',
      severity: AlertSeverity.DANGER,
      subjectId: undefined,
      message: 'refreshed message',
    });

    expect(prisma.alert.create).not.toHaveBeenCalled();
    expect(prisma.alert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({ message: 'refreshed message' }),
      }),
    );
    // Refresh must NOT fan out a new notification.
    expect(notifications.send).not.toHaveBeenCalled();
  });

  it('creates a new alert and fans out when none is active', async () => {
    const { service, prisma, notifications } = makeService();
    prisma.alert.findFirst.mockResolvedValue(null);
    prisma.alert.create.mockResolvedValue({
      id: 'a2',
      ruleKey: 'zimra_overdue',
      severity: AlertSeverity.DANGER,
      subjectTable: 'zimra_assessments',
      subjectId: 'z1',
      message: 'overdue',
    });
    prisma.userSiteRole.findMany.mockResolvedValue([{ userId: 'director-1' }]);

    await service.raiseOrRefresh({
      ruleKey: 'zimra_overdue',
      severity: AlertSeverity.DANGER,
      subjectTable: 'zimra_assessments',
      subjectId: 'z1',
      message: 'overdue',
    });

    expect(prisma.alert.create).toHaveBeenCalled();
    expect(notifications.send).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'alert.zimra_overdue',
        severity: 'DANGER',
        userIds: ['director-1'],
      }),
    );
  });

  it('scopes the active-alert lookup to (ruleKey, subjectId) with null guards', async () => {
    const { service, prisma } = makeService();
    prisma.alert.findFirst.mockResolvedValue(null);
    prisma.alert.create.mockResolvedValue({
      id: 'a3',
      ruleKey: 'deadline_breach',
      severity: 'DANGER',
    });

    await service.raiseOrRefresh({
      ruleKey: 'deadline_breach',
      severity: AlertSeverity.DANGER,
      message: 'x',
    });

    expect(prisma.alert.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          ruleKey: 'deadline_breach',
          subjectId: null,
          resolvedAt: null,
          acknowledgedAt: null,
        }),
      }),
    );
  });
});

describe('AlertService.ack', () => {
  it('sets acknowledgedBy/At and audits the change', async () => {
    const { service, prisma, audit } = makeService();
    prisma.alert.findUnique.mockResolvedValue({
      id: 'a1',
      acknowledgedAt: null,
      acknowledgedByUserId: null,
    });
    prisma.alert.update.mockResolvedValue({
      id: 'a1',
      acknowledgedAt: new Date(),
      acknowledgedByUserId: 'u1',
    });

    await service.ack('a1', 'u1');

    expect(prisma.alert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'a1' },
        data: expect.objectContaining({ acknowledgedByUserId: 'u1' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tableName: 'alerts', recordId: 'a1', action: 'STATUS_CHANGE' }),
    );
  });

  it('throws NotFound for a missing alert', async () => {
    const { service, prisma } = makeService();
    prisma.alert.findUnique.mockResolvedValue(null);
    await expect(service.ack('missing', 'u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('is idempotent: a second ack keeps the original acknowledger/time', async () => {
    const { service, prisma } = makeService();
    const firstAck = new Date('2026-07-01T00:00:00.000Z');
    prisma.alert.findUnique.mockResolvedValue({
      id: 'a1',
      acknowledgedAt: firstAck,
      acknowledgedByUserId: 'first-user',
    });
    prisma.alert.update.mockResolvedValue({ id: 'a1' });

    await service.ack('a1', 'second-user');

    expect(prisma.alert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { acknowledgedByUserId: 'first-user', acknowledgedAt: firstAck },
      }),
    );
  });
});

describe('AlertService.resolve', () => {
  it('resolves active alerts for (ruleKey, subjectId)', async () => {
    const { service, prisma } = makeService();
    prisma.alert.updateMany.mockResolvedValue({ count: 2 });
    const res = await service.resolve('coverage_ratio');
    expect(res).toEqual({ resolved: 2 });
    expect(prisma.alert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { ruleKey: 'coverage_ratio', subjectId: null, resolvedAt: null },
      }),
    );
  });
});

describe('AlertService.list', () => {
  it('filters active-only + severity when requested', async () => {
    const { service, prisma } = makeService();
    prisma.alert.findMany.mockResolvedValue([]);
    await service.list({ activeOnly: true, severity: AlertSeverity.WATCH });
    expect(prisma.alert.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { acknowledgedAt: null, resolvedAt: null, severity: 'WATCH' },
      }),
    );
  });
});
