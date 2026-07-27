import { OpportunityStage } from '@prisma/client';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService (pure calculations)', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new AnalyticsService({} as any);

  describe('buildFunnel', () => {
    it('groups responses by status per campaign and zero-fills missing statuses', () => {
      const campaigns = [
        { id: 'c1', name: 'Campaign One' },
        { id: 'c2', name: 'Campaign Two' },
      ];
      const responses = [
        { campaignId: 'c1', status: 'NEW' },
        { campaignId: 'c1', status: 'NEW' },
        { campaignId: 'c1', status: 'QUALIFIED' },
        { campaignId: 'c2', status: 'DEAD' },
        { campaignId: null, status: 'NEW' },
      ];
      const funnel = service.buildFunnel(campaigns, responses);
      const c1 = funnel.find((f) => f.campaignId === 'c1')!;
      expect(c1.byStatus).toEqual({ NEW: 2, CONTACTED: 0, QUALIFIED: 1, DEAD: 0 });
      expect(c1.totalResponses).toBe(3);
      const c2 = funnel.find((f) => f.campaignId === 'c2')!;
      expect(c2.byStatus.DEAD).toBe(1);
      expect(c2.totalResponses).toBe(1);
    });
  });

  describe('buildLeaderboard (cost-per-lead + value-won)', () => {
    it('computes cost-per-lead = total channel cost / responses', () => {
      const campaigns = [{ id: 'c1', name: 'C1' }];
      const channels = [
        { campaignId: 'c1', cost: 100 },
        { campaignId: 'c1', cost: 50 },
        { campaignId: 'other', cost: 999 },
      ];
      const responses = [{ campaignId: 'c1' }, { campaignId: 'c1' }, { campaignId: 'c1' }];
      const opportunities = [
        { campaignId: 'c1', stage: OpportunityStage.WON, estimatedValue: 120000 },
        { campaignId: 'c1', stage: OpportunityStage.CONTACT, estimatedValue: 5000 },
      ];
      const [entry] = service.buildLeaderboard(campaigns, channels, responses, opportunities);
      expect(entry.totalChannelCost).toBe(150);
      expect(entry.totalResponses).toBe(3);
      expect(entry.costPerLead).toBe(50); // 150 / 3
      expect(entry.valueWon).toBe(120000); // only the WON deal counts
    });

    it('returns null cost-per-lead when a campaign has no responses', () => {
      const [entry] = service.buildLeaderboard(
        [{ id: 'c1', name: 'C1' }],
        [{ campaignId: 'c1', cost: 200 }],
        [],
        [],
      );
      expect(entry.costPerLead).toBeNull();
      expect(entry.valueWon).toBe(0);
    });

    it('handles Decimal-like cost/value objects via Number()', () => {
      const dec = (n: number) => ({ toString: () => String(n), valueOf: () => n });
      const [entry] = service.buildLeaderboard(
        [{ id: 'c1', name: 'C1' }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [{ campaignId: 'c1', cost: dec(90) as any }],
        [{ campaignId: 'c1' }, { campaignId: 'c1' }],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        [{ campaignId: 'c1', stage: OpportunityStage.WON, estimatedValue: dec(300) as any }],
      );
      expect(entry.costPerLead).toBe(45); // 90 / 2
      expect(entry.valueWon).toBe(300);
    });
  });

  describe('buildChannelComparison (flier vs social)', () => {
    it('aggregates cost and responses per channelType with cost-per-response', () => {
      const channels = [
        { id: 'ch1', channelType: 'Flier', cost: 200 },
        { id: 'ch2', channelType: 'Facebook', cost: 100 },
        { id: 'ch3', channelType: 'Facebook', cost: 50 },
      ];
      const responses = [
        { channelId: 'ch1' },
        { channelId: 'ch1' },
        { channelId: 'ch2' },
        { channelId: 'ch3' },
        { channelId: null },
        { channelId: 'unknown' },
      ];
      const comparison = service.buildChannelComparison(channels, responses);
      const flier = comparison.find((c) => c.channelType === 'Flier')!;
      expect(flier.totalCost).toBe(200);
      expect(flier.responses).toBe(2);
      expect(flier.costPerResponse).toBe(100); // 200 / 2

      const fb = comparison.find((c) => c.channelType === 'Facebook')!;
      expect(fb.totalCost).toBe(150); // 100 + 50
      expect(fb.responses).toBe(2);
      expect(fb.costPerResponse).toBe(75); // 150 / 2
    });

    it('reports null cost-per-response for a channelType with no responses', () => {
      const comparison = service.buildChannelComparison(
        [{ id: 'ch1', channelType: 'Expo', cost: 500 }],
        [],
      );
      expect(comparison[0].costPerResponse).toBeNull();
      expect(comparison[0].responses).toBe(0);
    });
  });
});
