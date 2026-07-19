import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { EmployeesService, maskAccountNo } from './employees.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeService() {
  const prisma = {
    employee: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    site: { findUnique: jest.fn().mockResolvedValue({ id: 's1' }) },
    user: { findUnique: jest.fn() },
  };
  const audit = { record: jest.fn() };
  const lookups = { assertValid: jest.fn().mockResolvedValue(undefined) };
  const service = new EmployeesService(prisma as any, audit as any, lookups as any);
  return { service, prisma, audit, lookups };
}

const financeUser: AuthenticatedUser = {
  id: 'fin1',
  email: 'fo@aes.local',
  status: 'ACTIVE',
  roles: [{ siteId: null, role: Role.FINANCE_OFFICER }],
};

const siteManagerS1: AuthenticatedUser = {
  id: 'sm1',
  email: 'sm@aes.local',
  status: 'ACTIVE',
  roles: [{ siteId: 's1', role: Role.SITE_MANAGER }],
};

const baseEmployee = {
  id: 'e1',
  worksNo: 'W-1',
  firstName: 'A',
  lastName: 'B',
  siteId: 's1',
  accountNo: '01120345678',
  fixedUsdPct: null,
  payMode: 'CLIENT_RATIO',
};

describe('maskAccountNo', () => {
  it('masks all but the last 4 digits', () => {
    expect(maskAccountNo('01120345678')).toBe('*******5678');
  });

  it('passes through null', () => {
    expect(maskAccountNo(null)).toBeNull();
  });

  it('handles short numbers', () => {
    expect(maskAccountNo('12')).toBe('12');
  });
});

describe('EmployeesService reads mask account numbers', () => {
  it('masks accountNo in findOne', async () => {
    const { service, prisma } = makeService();
    prisma.employee.findUnique.mockResolvedValue(baseEmployee);
    const view = await service.findOne(financeUser, 'e1');
    expect(view.accountNo).toBe('*******5678');
  });

  it('masks accountNo in list', async () => {
    const { service, prisma } = makeService();
    prisma.employee.findMany.mockResolvedValue([baseEmployee]);
    const views = await service.list(financeUser, {});
    expect(views[0].accountNo).toBe('*******5678');
  });

  it('audits each read', async () => {
    const { service, prisma, audit } = makeService();
    prisma.employee.findUnique.mockResolvedValue(baseEmployee);
    await service.findOne(financeUser, 'e1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tableName: 'employees', actorUserId: 'fin1' }),
    );
  });
});

describe('EmployeesService site scoping (SITE_MANAGER)', () => {
  it('restricts a site manager list query to their own site', async () => {
    const { service, prisma } = makeService();
    prisma.employee.findMany.mockResolvedValue([]);
    await service.list(siteManagerS1, {});
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ siteId: { in: ['s1'] } }) }),
    );
  });

  it('forbids a site manager viewing an employee at another site', async () => {
    const { service, prisma } = makeService();
    prisma.employee.findUnique.mockResolvedValue({ ...baseEmployee, siteId: 'OTHER' });
    await expect(service.findOne(siteManagerS1, 'e1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids a site manager filtering to a site they do not hold', async () => {
    const { service } = makeService();
    await expect(service.list(siteManagerS1, { siteId: 'OTHER' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets finance see all sites (no site filter)', async () => {
    const { service, prisma } = makeService();
    await service.list(financeUser, {});
    const call = prisma.employee.findMany.mock.calls[0][0];
    expect(call.where.siteId).toBeUndefined();
  });
});

describe('EmployeesService.create pay-mode consistency', () => {
  it('requires fixedUsdPct when payMode is FIXED_SPLIT', async () => {
    const { service } = makeService();
    await expect(
      service.create(
        {
          worksNo: 'W-9',
          firstName: 'A',
          lastName: 'B',
          siteId: 's1',
          employmentType: 'PERMANENT' as any,
          payMode: 'FIXED_SPLIT',
          startDate: new Date(),
        },
        'fin1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects fixedUsdPct when payMode is CLIENT_RATIO', async () => {
    const { service } = makeService();
    await expect(
      service.create(
        {
          worksNo: 'W-9',
          firstName: 'A',
          lastName: 'B',
          siteId: 's1',
          employmentType: 'PERMANENT' as any,
          payMode: 'CLIENT_RATIO',
          fixedUsdPct: 60,
          startDate: new Date(),
        },
        'fin1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a FIXED_SPLIT employee and returns a masked account number', async () => {
    const { service, prisma } = makeService();
    prisma.employee.create.mockResolvedValue({ ...baseEmployee, accountNo: '99887766' });
    const view = await service.create(
      {
        worksNo: 'W-9',
        firstName: 'A',
        lastName: 'B',
        siteId: 's1',
        employmentType: 'PERMANENT' as any,
        payMode: 'FIXED_SPLIT',
        fixedUsdPct: 60,
        accountNo: '99887766',
        startDate: new Date(),
      },
      'fin1',
    );
    expect(view.accountNo).toBe('****7766');
  });
});
