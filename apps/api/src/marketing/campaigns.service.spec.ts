import { NotFoundException } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';

describe('CampaignsService', () => {
  const prisma = {
    campaign: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() },
    campaignChannel: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
    },
    channelMetric: { create: jest.fn(), findMany: jest.fn() },
  };
  const audit = { record: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = new CampaignsService(prisma as any, audit as any);

  beforeEach(() => jest.clearAllMocks());

  it('throws NotFound getting a missing campaign', async () => {
    prisma.campaign.findUnique.mockResolvedValue(null);
    await expect(service.findOne('id')).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('createChannel (Flier auto-code)', () => {
    it('generates a sequential AES-FL-<seq> flierCode and a tracking-link stub for Flier channels', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.campaignChannel.count.mockResolvedValue(6); // 6 existing => next is 0007
      prisma.campaignChannel.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'ch1', ...data }),
      );
      const channel = await service.createChannel('c1', { channelType: 'Flier' }, 'actor');
      const arg = prisma.campaignChannel.create.mock.calls[0][0];
      expect(arg.data.flierCode).toBe('AES-FL-0007');
      expect(arg.data.trackingLink).toBe('https://aes.co.zw/f/AES-FL-0007');
      expect(channel.flierCode).toBe('AES-FL-0007');
    });

    it('does not auto-generate a flierCode for non-Flier channels', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.campaignChannel.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'ch2', ...data }),
      );
      await service.createChannel('c1', { channelType: 'Facebook' }, 'actor');
      const arg = prisma.campaignChannel.create.mock.calls[0][0];
      expect(arg.data.flierCode).toBeNull();
      expect(prisma.campaignChannel.count).not.toHaveBeenCalled();
    });

    it('respects a supplied flierCode/trackingLink', async () => {
      prisma.campaign.findUnique.mockResolvedValue({ id: 'c1' });
      prisma.campaignChannel.create.mockImplementation(({ data }) =>
        Promise.resolve({ id: 'ch3', ...data }),
      );
      await service.createChannel(
        'c1',
        { channelType: 'Flier', flierCode: 'CUSTOM-1', trackingLink: 'https://x.test' },
        'actor',
      );
      const arg = prisma.campaignChannel.create.mock.calls[0][0];
      expect(arg.data.flierCode).toBe('CUSTOM-1');
      expect(arg.data.trackingLink).toBe('https://x.test');
      expect(prisma.campaignChannel.count).not.toHaveBeenCalled();
    });
  });
});
