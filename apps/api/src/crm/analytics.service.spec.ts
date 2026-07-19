import { OpportunityStage } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const prisma = {
    crmOrganisation: { findMany: jest.fn() },
    crmContact: { findMany: jest.fn() },
    crmOpportunity: { findMany: jest.fn() },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new AnalyticsService(prisma as any);

  beforeEach(() => jest.clearAllMocks());

  it('aggregates counts, valueWon and conversionRate overall and per owner', async () => {
    prisma.crmOrganisation.findMany.mockResolvedValue([
      { ownerUserId: 'u1' },
      { ownerUserId: 'u2' },
    ]);
    prisma.crmContact.findMany.mockResolvedValue([{ ownerUserId: 'u1' }]);
    // opportunities (createdAt-filtered) drive opportunities + lost counts
    prisma.crmOpportunity.findMany.mockImplementation(({ where }) => {
      if (where.stage === OpportunityStage.WON) {
        // won query (wonAt-filtered)
        return Promise.resolve([
          { ownerUserId: 'u1', estimatedValue: 100 },
          { ownerUserId: 'u1', estimatedValue: 50 },
        ]);
      }
      return Promise.resolve([
        { ownerUserId: 'u1', stage: OpportunityStage.WON },
        { ownerUserId: 'u1', stage: OpportunityStage.LOST },
        { ownerUserId: 'u2', stage: OpportunityStage.CONTACT },
      ]);
    });

    const res = await service.conversion({});

    expect(res.overall.organisations).toBe(2);
    expect(res.overall.contacts).toBe(1);
    expect(res.overall.opportunities).toBe(3);
    expect(res.overall.won).toBe(2);
    expect(res.overall.lost).toBe(1);
    expect(res.overall.valueWon).toBe(150);
    // overall conversionRate = won / (won + lost) = 2 / 3
    expect(res.overall.conversionRate).toBeCloseTo(2 / 3);

    const u1 = res.owners.find((o) => o.ownerUserId === 'u1');
    expect(u1).toBeDefined();
    expect(u1?.organisations).toBe(1);
    expect(u1?.won).toBe(2);
    expect(u1?.lost).toBe(1);
    expect(u1?.valueWon).toBe(150);
    expect(u1?.conversionRate).toBeCloseTo(2 / 3);

    const u2 = res.owners.find((o) => o.ownerUserId === 'u2');
    // u2 has one open opportunity, nothing closed -> conversionRate 0
    expect(u2?.opportunities).toBe(1);
    expect(u2?.conversionRate).toBe(0);
  });

  it('returns zero conversionRate when nothing has closed', async () => {
    prisma.crmOrganisation.findMany.mockResolvedValue([]);
    prisma.crmContact.findMany.mockResolvedValue([]);
    prisma.crmOpportunity.findMany.mockResolvedValue([]);

    const res = await service.conversion({});
    expect(res.overall.conversionRate).toBe(0);
    expect(res.overall.won).toBe(0);
    expect(res.owners).toEqual([]);
  });

  it('applies createdAt and wonAt date-range filters and owner scoping', async () => {
    prisma.crmOrganisation.findMany.mockResolvedValue([]);
    prisma.crmContact.findMany.mockResolvedValue([]);
    prisma.crmOpportunity.findMany.mockResolvedValue([]);

    const from = new Date('2026-01-01');
    const to = new Date('2026-06-30');
    await service.conversion({ from, to, ownerUserId: 'u1' });

    const orgArgs = prisma.crmOrganisation.findMany.mock.calls[0][0];
    expect(orgArgs.where.ownerUserId).toBe('u1');
    expect(orgArgs.where.createdAt).toEqual({ gte: from, lte: to });

    // the two crmOpportunity calls: opportunities (createdAt) and won (wonAt)
    const oppCalls = prisma.crmOpportunity.findMany.mock.calls.map((c) => c[0]);
    const openCall = oppCalls.find((c) => c.where.stage === undefined);
    const wonCall = oppCalls.find((c) => c.where.stage === OpportunityStage.WON);
    expect(openCall.where.createdAt).toEqual({ gte: from, lte: to });
    expect(openCall.where.ownerUserId).toBe('u1');
    expect(wonCall.where.wonAt).toEqual({ gte: from, lte: to });
    expect(wonCall.where.ownerUserId).toBe('u1');
  });
});
