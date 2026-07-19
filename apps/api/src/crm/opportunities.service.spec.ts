import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OpportunityStage } from '@prisma/client';
import { ConvertTarget } from './dto/opportunity.dto';
import { OpportunitiesService } from './opportunities.service';

describe('OpportunitiesService', () => {
  const prisma = {
    crmOpportunity: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    client: { findUnique: jest.fn() },
    order: { create: jest.fn() },
    contract: { create: jest.fn() },
  };
  const audit = { record: jest.fn() };
  const lookups = { assertValid: jest.fn().mockResolvedValue(undefined) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new OpportunitiesService(prisma as any, audit as any, lookups as any);

  beforeEach(() => jest.clearAllMocks());

  it('throws NotFound when an opportunity is missing', async () => {
    prisma.crmOpportunity.findUnique.mockResolvedValue(null);
    await expect(service.findOne('id')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('move (stage transitions)', () => {
    it('allows a valid forward transition CONTACT -> QUALIFIED', async () => {
      prisma.crmOpportunity.findUnique.mockResolvedValue({
        id: 'o1',
        stage: OpportunityStage.CONTACT,
        wonAt: null,
        lostReason: null,
      });
      prisma.crmOpportunity.update.mockResolvedValue({
        id: 'o1',
        stage: OpportunityStage.QUALIFIED,
        lostReason: null,
      });
      const res = await service.move('o1', OpportunityStage.QUALIFIED, 'actor');
      expect(res.stage).toBe(OpportunityStage.QUALIFIED);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGE',
          tableName: 'crm_opportunities',
          recordId: 'o1',
        }),
      );
    });

    it('rejects an invalid skip transition CONTACT -> WON', async () => {
      prisma.crmOpportunity.findUnique.mockResolvedValue({
        id: 'o1',
        stage: OpportunityStage.CONTACT,
        wonAt: null,
      });
      await expect(service.move('o1', OpportunityStage.WON, 'actor')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.crmOpportunity.update).not.toHaveBeenCalled();
    });

    it('sets wonAt when moving NEGOTIATION -> WON', async () => {
      prisma.crmOpportunity.findUnique.mockResolvedValue({
        id: 'o1',
        stage: OpportunityStage.NEGOTIATION,
        wonAt: null,
      });
      prisma.crmOpportunity.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'o1', stage: data.stage, lostReason: null }),
      );
      await service.move('o1', OpportunityStage.WON, 'actor');
      const call = prisma.crmOpportunity.update.mock.calls[0][0];
      expect(call.data.stage).toBe(OpportunityStage.WON);
      expect(call.data.wonAt).toBeInstanceOf(Date);
    });

    it('requires lostReason when moving to LOST', async () => {
      prisma.crmOpportunity.findUnique.mockResolvedValue({
        id: 'o1',
        stage: OpportunityStage.PROPOSAL,
        wonAt: null,
      });
      await expect(service.move('o1', OpportunityStage.LOST, 'actor')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('captures lostReason when moving to LOST', async () => {
      prisma.crmOpportunity.findUnique.mockResolvedValue({
        id: 'o1',
        stage: OpportunityStage.PROPOSAL,
        wonAt: null,
        lostReason: null,
      });
      prisma.crmOpportunity.update.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'o1', stage: data.stage, lostReason: data.lostReason }),
      );
      const res = await service.move('o1', OpportunityStage.LOST, 'actor', 'Budget cut');
      expect(res.stage).toBe(OpportunityStage.LOST);
      expect(res.lostReason).toBe('Budget cut');
    });
  });

  describe('board (grouping)', () => {
    it('groups opportunities into a kanban shape keyed by every stage', async () => {
      prisma.crmOpportunity.findMany.mockResolvedValue([
        { id: 'a', stage: OpportunityStage.CONTACT },
        { id: 'b', stage: OpportunityStage.CONTACT },
        { id: 'c', stage: OpportunityStage.WON },
      ]);
      const board = await service.board();
      expect(Object.keys(board).sort()).toEqual(
        [
          OpportunityStage.CONTACT,
          OpportunityStage.QUALIFIED,
          OpportunityStage.PROPOSAL,
          OpportunityStage.NEGOTIATION,
          OpportunityStage.WON,
          OpportunityStage.LOST,
        ].sort(),
      );
      expect(board[OpportunityStage.CONTACT]).toHaveLength(2);
      expect(board[OpportunityStage.WON]).toHaveLength(1);
      expect(board[OpportunityStage.QUALIFIED]).toEqual([]);
    });
  });

  describe('convert', () => {
    const wonOpp = {
      id: 'o1',
      stage: OpportunityStage.WON,
      estimatedValue: 120000,
      currency: 'USD',
      wonAt: new Date('2026-01-01'),
      convertedOrderId: null,
      convertedContractId: null,
    };

    it('creates a linked order, records convertedOrderId and audits the linkage', async () => {
      prisma.crmOpportunity.findUnique.mockResolvedValue(wonOpp);
      prisma.client.findUnique.mockResolvedValue({ id: 'client1' });
      prisma.order.create.mockResolvedValue({
        id: 'order1',
        clientId: 'client1',
        reference: 'ORD-1',
        valueExVat: { toString: () => '120000' },
        currency: 'USD',
      });
      prisma.crmOpportunity.update.mockResolvedValue({
        id: 'o1',
        stage: OpportunityStage.WON,
        convertedOrderId: 'order1',
      });

      const res = await service.convert(
        'o1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { as: ConvertTarget.ORDER, reference: 'ORD-1', clientId: 'client1' } as any,
        'actor',
      );

      // linked order was created off the opportunity's own value/currency
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            clientId: 'client1',
            reference: 'ORD-1',
            valueExVat: 120000,
            currency: 'USD',
          }),
        }),
      );
      // convertedOrderId linked back on the opportunity
      const updateCall = prisma.crmOpportunity.update.mock.calls[0][0];
      expect(updateCall.data.convertedOrderId).toBe('order1');
      expect(updateCall.data.stage).toBe(OpportunityStage.WON);
      expect('order' in res && res.order.id).toBe('order1');
      expect(res.opportunity.convertedOrderId).toBe('order1');

      // audits both the created order and the STATUS_CHANGE linkage
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', tableName: 'orders', recordId: 'order1' }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'STATUS_CHANGE',
          tableName: 'crm_opportunities',
          recordId: 'o1',
        }),
      );
    });

    it('creates a linked contract and records convertedContractId', async () => {
      prisma.crmOpportunity.findUnique.mockResolvedValue(wonOpp);
      prisma.client.findUnique.mockResolvedValue({ id: 'client1' });
      prisma.contract.create.mockResolvedValue({
        id: 'ctr1',
        clientId: 'client1',
        reference: 'CTR-1',
        valueExVat: { toString: () => '120000' },
        currency: 'USD',
        status: 'UPCOMING',
      });
      prisma.crmOpportunity.update.mockResolvedValue({
        id: 'o1',
        stage: OpportunityStage.WON,
        convertedContractId: 'ctr1',
      });

      const res = await service.convert(
        'o1',
        {
          as: ConvertTarget.CONTRACT,
          reference: 'CTR-1',
          clientId: 'client1',
          startDate: new Date('2026-08-01'),
          endDate: new Date('2027-07-31'),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
        'actor',
      );
      expect('contract' in res && res.contract.id).toBe('ctr1');
      expect(prisma.crmOpportunity.update.mock.calls[0][0].data.convertedContractId).toBe('ctr1');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE', tableName: 'contracts', recordId: 'ctr1' }),
      );
    });

    it('promotes a not-yet-WON opportunity through a valid transition on convert', async () => {
      prisma.crmOpportunity.findUnique.mockResolvedValue({
        ...wonOpp,
        stage: OpportunityStage.NEGOTIATION,
        wonAt: null,
      });
      prisma.client.findUnique.mockResolvedValue({ id: 'client1' });
      prisma.order.create.mockResolvedValue({
        id: 'order2',
        clientId: 'client1',
        reference: 'ORD-2',
        valueExVat: { toString: () => '120000' },
        currency: 'USD',
      });
      prisma.crmOpportunity.update.mockResolvedValue({
        id: 'o1',
        stage: OpportunityStage.WON,
        convertedOrderId: 'order2',
      });
      const res = await service.convert(
        'o1',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { as: ConvertTarget.ORDER, reference: 'ORD-2', clientId: 'client1' } as any,
        'actor',
      );
      expect(res.opportunity.stage).toBe(OpportunityStage.WON);
    });

    it('rejects converting a CONTACT-stage opportunity (invalid transition to WON)', async () => {
      prisma.crmOpportunity.findUnique.mockResolvedValue({
        ...wonOpp,
        stage: OpportunityStage.CONTACT,
        wonAt: null,
      });
      prisma.client.findUnique.mockResolvedValue({ id: 'client1' });
      await expect(
        service.convert(
          'o1',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { as: ConvertTarget.ORDER, reference: 'ORD-3', clientId: 'client1' } as any,
          'actor',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects converting an already-converted opportunity', async () => {
      prisma.crmOpportunity.findUnique.mockResolvedValue({
        ...wonOpp,
        convertedOrderId: 'existing',
      });
      await expect(
        service.convert(
          'o1',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { as: ConvertTarget.ORDER, reference: 'ORD-4', clientId: 'client1' } as any,
          'actor',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects a CONTRACT conversion without start/end dates', async () => {
      prisma.crmOpportunity.findUnique.mockResolvedValue(wonOpp);
      prisma.client.findUnique.mockResolvedValue({ id: 'client1' });
      await expect(
        service.convert(
          'o1',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { as: ConvertTarget.CONTRACT, reference: 'CTR-2', clientId: 'client1' } as any,
          'actor',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects conversion when the client does not exist', async () => {
      prisma.crmOpportunity.findUnique.mockResolvedValue(wonOpp);
      prisma.client.findUnique.mockResolvedValue(null);
      await expect(
        service.convert(
          'o1',
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          { as: ConvertTarget.ORDER, reference: 'ORD-5', clientId: 'missing' } as any,
          'actor',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
