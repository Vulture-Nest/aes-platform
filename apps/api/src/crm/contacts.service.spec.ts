import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ContactsService } from './contacts.service';

describe('ContactsService', () => {
  const prisma = {
    crmContact: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    crmOrganisation: { findUnique: jest.fn() },
  };
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new ContactsService(prisma as any, audit as any);

  beforeEach(() => jest.clearAllMocks());

  it('throws NotFound when a contact is missing', async () => {
    prisma.crmContact.findUnique.mockResolvedValue(null);
    await expect(service.findOne('id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects creating a contact for an unknown organisation', async () => {
    prisma.crmOrganisation.findUnique.mockResolvedValue(null);
    await expect(
      service.create(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { organisationId: 'missing', firstName: 'A', lastName: 'B' } as any,
        'actor',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates a contact and writes an audit record', async () => {
    prisma.crmOrganisation.findUnique.mockResolvedValue({ id: 'org1' });
    prisma.crmContact.create.mockResolvedValue({
      id: 'ct1',
      organisationId: 'org1',
      firstName: 'Tendai',
      lastName: 'Mutize',
    });
    const res = await service.create(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { organisationId: 'org1', firstName: 'Tendai', lastName: 'Mutize' } as any,
      'actor',
    );
    expect(res.id).toBe('ct1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', tableName: 'crm_contacts', recordId: 'ct1' }),
    );
  });

  it('lists contacts filtered by organisationId', async () => {
    prisma.crmContact.findMany.mockResolvedValue([{ id: 'ct1' }]);
    const res = await service.list({ organisationId: 'org1' });
    expect(res).toHaveLength(1);
    expect(prisma.crmContact.findMany).toHaveBeenCalledWith({
      where: { organisationId: 'org1' },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  });
});
