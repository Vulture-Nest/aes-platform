import { BadRequestException } from '@nestjs/common';
import { InteractionType } from '@prisma/client';
import { InteractionsService } from './interactions.service';

describe('InteractionsService', () => {
  const prisma = {
    crmInteraction: { findMany: jest.fn(), create: jest.fn() },
    crmOrganisation: { findUnique: jest.fn() },
    crmContact: { findUnique: jest.fn() },
  };
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new InteractionsService(prisma as any, audit as any);

  beforeEach(() => jest.clearAllMocks());

  it('rejects an interaction referencing neither an organisation nor a contact', async () => {
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.create({ type: InteractionType.CALL, occurredAt: new Date() } as any, 'actor'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an interaction for an unknown organisation', async () => {
    prisma.crmOrganisation.findUnique.mockResolvedValue(null);
    await expect(
      service.create(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { organisationId: 'missing', type: InteractionType.VISIT, occurredAt: new Date() } as any,
        'actor',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('logs an interaction and writes an audit record', async () => {
    prisma.crmOrganisation.findUnique.mockResolvedValue({ id: 'org1' });
    prisma.crmInteraction.create.mockResolvedValue({
      id: 'in1',
      organisationId: 'org1',
      contactId: null,
      type: InteractionType.TENDER,
      occurredAt: new Date('2026-07-19'),
      outcome: 'Submitted bid',
    });
    const res = await service.create(
      {
        organisationId: 'org1',
        type: InteractionType.TENDER,
        occurredAt: new Date('2026-07-19'),
        outcome: 'Submitted bid',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
      'actor',
    );
    expect(res.id).toBe('in1');
    expect(prisma.crmInteraction.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ byUserId: 'actor', createdBy: 'actor', updatedBy: 'actor' }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        tableName: 'crm_interactions',
        recordId: 'in1',
      }),
    );
  });

  it('lists interactions filtered by organisation and contact', async () => {
    prisma.crmInteraction.findMany.mockResolvedValue([{ id: 'in1' }]);
    const res = await service.list({ organisationId: 'org1', contactId: 'ct1' });
    expect(res).toHaveLength(1);
    expect(prisma.crmInteraction.findMany).toHaveBeenCalledWith({
      where: { organisationId: 'org1', contactId: 'ct1' },
      orderBy: { occurredAt: 'desc' },
    });
  });
});
