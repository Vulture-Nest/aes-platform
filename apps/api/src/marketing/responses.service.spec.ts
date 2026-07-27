import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OpportunityStage } from '@prisma/client';
import { ResponsesService } from './responses.service';

describe('ResponsesService', () => {
  const prisma = {
    campaignResponse: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    crmOpportunity: { create: jest.fn() },
  };
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new ResponsesService(prisma as any, audit as any);

  beforeEach(() => jest.clearAllMocks());

  it('throws NotFound when a response is missing', async () => {
    prisma.campaignResponse.findUnique.mockResolvedValue(null);
    await expect(service.findOne('id')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('updateStatus (transitions)', () => {
    it('allows NEW -> CONTACTED', async () => {
      prisma.campaignResponse.findUnique.mockResolvedValue({ id: 'r1', status: 'NEW' });
      prisma.campaignResponse.update.mockResolvedValue({ id: 'r1', status: 'CONTACTED' });
      const res = await service.updateStatus('r1', 'CONTACTED', 'actor');
      expect(res.status).toBe('CONTACTED');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STATUS_CHANGE', tableName: 'campaign_responses' }),
      );
    });

    it('rejects an invalid skip NEW -> QUALIFIED', async () => {
      prisma.campaignResponse.findUnique.mockResolvedValue({ id: 'r1', status: 'NEW' });
      await expect(service.updateStatus('r1', 'QUALIFIED', 'actor')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.campaignResponse.update).not.toHaveBeenCalled();
    });

    it('allows re-opening DEAD -> CONTACTED', async () => {
      prisma.campaignResponse.findUnique.mockResolvedValue({ id: 'r1', status: 'DEAD' });
      prisma.campaignResponse.update.mockResolvedValue({ id: 'r1', status: 'CONTACTED' });
      const res = await service.updateStatus('r1', 'CONTACTED', 'actor');
      expect(res.status).toBe('CONTACTED');
    });
  });

  describe('convert', () => {
    it('creates an attributed opportunity and links it back, marking the lead QUALIFIED', async () => {
      prisma.campaignResponse.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'CONTACTED',
        campaignId: 'c1',
        ownerUserId: 'owner1',
        opportunityId: null,
      });
      prisma.crmOpportunity.create.mockResolvedValue({
        id: 'opp1',
        title: 'Deal',
        campaignId: 'c1',
        responseId: 'r1',
        stage: OpportunityStage.CONTACT,
      });
      prisma.campaignResponse.update.mockResolvedValue({
        id: 'r1',
        status: 'QUALIFIED',
        opportunityId: 'opp1',
      });

      const res = await service.convert('r1', { title: 'Deal' }, 'actor');

      const createArg = prisma.crmOpportunity.create.mock.calls[0][0];
      expect(createArg.data.campaignId).toBe('c1');
      expect(createArg.data.responseId).toBe('r1');
      expect(createArg.data.ownerUserId).toBe('owner1');

      const updateArg = prisma.campaignResponse.update.mock.calls[0][0];
      expect(updateArg.data.opportunityId).toBe('opp1');
      expect(updateArg.data.status).toBe('QUALIFIED');

      expect(res.opportunity.id).toBe('opp1');
      expect(res.response.opportunityId).toBe('opp1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', tableName: 'crm_opportunities' }),
      );
    });

    it('rejects converting an already-converted response', async () => {
      prisma.campaignResponse.findUnique.mockResolvedValue({
        id: 'r1',
        status: 'QUALIFIED',
        opportunityId: 'existing',
      });
      await expect(service.convert('r1', { title: 'Deal' }, 'actor')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.crmOpportunity.create).not.toHaveBeenCalled();
    });
  });
});
