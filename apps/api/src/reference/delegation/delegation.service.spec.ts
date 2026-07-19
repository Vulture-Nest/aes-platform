import { BadRequestException } from '@nestjs/common';
import { DelegationService } from './delegation.service';

describe('DelegationService', () => {
  const prisma = { delegationRule: { create: jest.fn(), findFirst: jest.fn() } };
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new DelegationService(prisma as any, audit as any);

  beforeEach(() => jest.clearAllMocks());

  const dto = {
    approverUserId: 'a',
    delegateUserId: 'b',
    dateFrom: new Date('2025-03-01'),
    dateTo: new Date('2025-03-14'),
  };

  it('creates a valid delegation and audits it', async () => {
    prisma.delegationRule.create.mockResolvedValue({ id: 'd1', ...dto });
    await service.create(dto, 'admin');
    expect(prisma.delegationRule.create).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tableName: 'delegation_rules' }),
    );
  });

  it('rejects self-delegation', async () => {
    await expect(service.create({ ...dto, delegateUserId: 'a' }, 'admin')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an inverted date range', async () => {
    await expect(
      service.create({ ...dto, dateFrom: new Date('2025-03-20') }, 'admin'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('resolves the active delegate within the window', async () => {
    prisma.delegationRule.findFirst.mockResolvedValue({ delegateUserId: 'b' });
    expect(await service.activeDelegateFor('a', new Date('2025-03-07'))).toBe('b');
  });

  it('returns null when no active delegation covers the date', async () => {
    prisma.delegationRule.findFirst.mockResolvedValue(null);
    expect(await service.activeDelegateFor('a', new Date('2025-04-01'))).toBeNull();
  });
});
