import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrganisationsService } from './organisations.service';

describe('OrganisationsService', () => {
  const prisma = {
    crmOrganisation: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn() },
    client: { findUnique: jest.fn() },
  };
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new OrganisationsService(prisma as any, audit as any);

  beforeEach(() => jest.clearAllMocks());

  it('throws NotFound when an organisation is missing', async () => {
    prisma.crmOrganisation.findUnique.mockResolvedValue(null);
    await expect(service.findOne('id')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects creating an organisation linked to an unknown client', async () => {
    prisma.client.findUnique.mockResolvedValue(null);
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      service.create({ name: 'Acme', clientId: 'missing' } as any, 'actor'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creates an organisation and writes an audit record', async () => {
    prisma.crmOrganisation.create.mockResolvedValue({ id: 'org1', name: 'Acme', clientId: null });
    const res = await service.create(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { name: 'Acme' } as any,
      'actor',
    );
    expect(res.id).toBe('org1');
    expect(prisma.crmOrganisation.create).toHaveBeenCalledWith({
      data: { name: 'Acme', createdBy: 'actor', updatedBy: 'actor' },
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        tableName: 'crm_organisations',
        recordId: 'org1',
      }),
    );
  });

  it('lists organisations filtered by clientId', async () => {
    prisma.crmOrganisation.findMany.mockResolvedValue([{ id: 'org1' }]);
    const res = await service.list({ clientId: 'c1' });
    expect(res).toHaveLength(1);
    expect(prisma.crmOrganisation.findMany).toHaveBeenCalledWith({
      where: { clientId: 'c1' },
      orderBy: { name: 'asc' },
    });
  });

  it('lists all organisations when no filter is given', async () => {
    prisma.crmOrganisation.findMany.mockResolvedValue([]);
    await service.list();
    expect(prisma.crmOrganisation.findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { name: 'asc' },
    });
  });
});
