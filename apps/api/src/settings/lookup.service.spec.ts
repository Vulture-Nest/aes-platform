import { BadRequestException } from '@nestjs/common';
import { LookupService } from './lookup.service';

describe('LookupService', () => {
  const prisma = { lookupValue: { findUnique: jest.fn(), delete: jest.fn() } };
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new LookupService(prisma as any, audit as any);

  beforeEach(() => jest.clearAllMocks());

  it('isValid is true only for an active configured code', async () => {
    prisma.lookupValue.findUnique.mockResolvedValueOnce({ active: true });
    expect(await service.isValid('currency', 'USD')).toBe(true);
    prisma.lookupValue.findUnique.mockResolvedValueOnce({ active: false });
    expect(await service.isValid('currency', 'OLD')).toBe(false);
    prisma.lookupValue.findUnique.mockResolvedValueOnce(null);
    expect(await service.isValid('currency', 'ZZZ')).toBe(false);
  });

  it('assertValid throws for an unconfigured value', async () => {
    prisma.lookupValue.findUnique.mockResolvedValue(null);
    await expect(service.assertValid('currency', 'ZZZ')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('refuses to delete a system value', async () => {
    prisma.lookupValue.findUnique.mockResolvedValue({
      id: 'x',
      category: 'currency',
      code: 'USD',
      metadata: { system: true },
    });
    await expect(service.remove('x', 'admin')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.lookupValue.delete).not.toHaveBeenCalled();
  });
});
