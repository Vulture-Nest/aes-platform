import { NotFoundException } from '@nestjs/common';
import { DEFAULT_ENTITY_ID, EntitiesService } from './entities.service';

describe('EntitiesService', () => {
  const prisma = {
    entity: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    site: { findUnique: jest.fn(), count: jest.fn() },
    employee: { count: jest.fn() },
    order: { count: jest.fn() },
    publicHoliday: { findMany: jest.fn(), findFirst: jest.fn(), create: jest.fn(), delete: jest.fn() },
  };
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new EntitiesService(prisma as any, audit as any);

  beforeEach(() => jest.clearAllMocks());

  describe('countryPackFor', () => {
    it('returns the localisation bundle for an entity', async () => {
      prisma.entity.findUnique.mockResolvedValue({
        id: 'e1',
        country: 'ZW',
        baseCurrency: 'USD',
        timezone: 'Africa/Harare',
        locale: 'en',
      });
      const pack = await service.countryPackFor('e1');
      expect(pack).toEqual({
        country: 'ZW',
        baseCurrency: 'USD',
        timezone: 'Africa/Harare',
        locale: 'en',
      });
    });

    it('throws NotFound when the entity is missing', async () => {
      prisma.entity.findUnique.mockResolvedValue(null);
      await expect(service.countryPackFor('missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('resolveEntityForSite', () => {
    it('resolves the entity via the site entityId', async () => {
      prisma.site.findUnique.mockResolvedValue({ entityId: 'e2' });
      prisma.entity.findUnique.mockResolvedValue({ id: 'e2', country: 'ZM' });
      const entity = await service.resolveEntityForSite('s1');
      expect(entity.id).toBe('e2');
      expect(prisma.entity.findUnique).toHaveBeenCalledWith({ where: { id: 'e2' } });
    });

    it('falls back to the default entity when the site has no entityId', async () => {
      prisma.site.findUnique.mockResolvedValue({ entityId: null });
      prisma.entity.findUnique.mockResolvedValue({ id: DEFAULT_ENTITY_ID });
      const entity = await service.resolveEntityForSite('s1');
      expect(entity.id).toBe(DEFAULT_ENTITY_ID);
      expect(prisma.entity.findUnique).toHaveBeenCalledWith({ where: { id: DEFAULT_ENTITY_ID } });
    });

    it('throws NotFound when the site is missing', async () => {
      prisma.site.findUnique.mockResolvedValue(null);
      await expect(service.resolveEntityForSite('missing')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('summary', () => {
    it('returns the entity plus linked-dimension counts', async () => {
      prisma.entity.findUnique.mockResolvedValue({ id: 'e1', name: 'AES ZW' });
      prisma.site.count.mockResolvedValue(3);
      prisma.employee.count.mockResolvedValue(120);
      prisma.order.count.mockResolvedValue(7);
      const res = await service.summary('e1');
      expect(res).toEqual({
        entity: { id: 'e1', name: 'AES ZW' },
        counts: { sites: 3, employees: 120, orders: 7 },
      });
    });
  });

  describe('deleteHoliday', () => {
    it('throws NotFound when the holiday is not under the entity', async () => {
      prisma.publicHoliday.findFirst.mockResolvedValue(null);
      await expect(service.deleteHoliday('e1', 'h1', 'actor')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('deletes the holiday and writes an audit record', async () => {
      prisma.publicHoliday.findFirst.mockResolvedValue({ id: 'h1', date: new Date(), name: 'X' });
      const res = await service.deleteHoliday('e1', 'h1', 'actor');
      expect(res).toEqual({ deleted: true });
      expect(prisma.publicHoliday.delete).toHaveBeenCalledWith({ where: { id: 'h1' } });
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE', tableName: 'public_holidays' }),
      );
    });
  });
});
