import { DangerRulesService, DEFAULT_DANGER_RULES } from './danger-rules.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeService() {
  const prisma = {
    dangerRule: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
  const audit = { record: jest.fn() };
  const service = new DangerRulesService(prisma as any, audit as any);
  return { service, prisma, audit };
}

describe('DangerRulesService.seedDefaults', () => {
  it('creates all default rules on an empty table', async () => {
    const { service, prisma } = makeService();
    prisma.dangerRule.findMany.mockResolvedValue([]);
    prisma.dangerRule.create.mockResolvedValue({});

    const res = await service.seedDefaults();

    expect(res.created).toHaveLength(DEFAULT_DANGER_RULES.length);
    expect(prisma.dangerRule.create).toHaveBeenCalledTimes(DEFAULT_DANGER_RULES.length);
  });

  it('is idempotent: existing rules are not recreated', async () => {
    const { service, prisma } = makeService();
    prisma.dangerRule.findMany.mockResolvedValue(
      DEFAULT_DANGER_RULES.map((r) => ({ ruleKey: r.ruleKey })),
    );

    const res = await service.seedDefaults();

    expect(res.created).toEqual([]);
    expect(prisma.dangerRule.create).not.toHaveBeenCalled();
  });

  it('only creates the missing rules', async () => {
    const { service, prisma } = makeService();
    // All present except cash_runway.
    prisma.dangerRule.findMany.mockResolvedValue(
      DEFAULT_DANGER_RULES.filter((r) => r.ruleKey !== 'cash_runway').map((r) => ({
        ruleKey: r.ruleKey,
      })),
    );
    prisma.dangerRule.create.mockResolvedValue({});

    const res = await service.seedDefaults();

    expect(res.created).toEqual(['cash_runway']);
  });

  it('seeds payroll_coverage disabled (deferred to S8)', async () => {
    const { service, prisma } = makeService();
    prisma.dangerRule.findMany.mockResolvedValue([]);
    prisma.dangerRule.create.mockResolvedValue({});

    await service.seedDefaults();

    const payrollCall = prisma.dangerRule.create.mock.calls.find(
      (c: any) => c[0].data.ruleKey === 'payroll_coverage',
    );
    expect(payrollCall).toBeDefined();
    expect(payrollCall[0].data.enabled).toBe(false);
  });
});

describe('DangerRulesService.update', () => {
  it('patches params/severity/enabled and audits', async () => {
    const { service, prisma, audit } = makeService();
    prisma.dangerRule.findUnique.mockResolvedValue({
      id: 'r1',
      ruleKey: 'coverage_ratio',
      params: { danger: 1.0 },
      severity: 'DANGER',
      enabled: true,
    });
    prisma.dangerRule.update.mockResolvedValue({ id: 'r1', enabled: false });

    await service.update('r1', { enabled: false }, 'admin');

    expect(prisma.dangerRule.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'r1' },
        data: expect.objectContaining({ enabled: false, updatedBy: 'admin' }),
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tableName: 'danger_rules', action: 'UPDATE' }),
    );
  });
});
