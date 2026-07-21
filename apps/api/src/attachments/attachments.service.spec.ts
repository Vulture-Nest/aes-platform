import { BadRequestException } from '@nestjs/common';
import { AttachmentsService } from './attachments.service';

/* eslint-disable @typescript-eslint/no-explicit-any */

function makeService() {
  const storage = {
    put: jest.fn().mockResolvedValue({ bucket: 'b', key: 'k' }),
    getSignedUrl: jest.fn().mockResolvedValue('https://signed/url'),
  };
  const audit = { record: jest.fn() };
  const service = new AttachmentsService(storage as any, audit as any);
  return { service, storage, audit };
}

const onePixelPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMCAQGeIAqEAAAAAElFTkSuQmCC';

describe('AttachmentsService.upload', () => {
  it('stores the decoded bytes under a namespaced key and audits', async () => {
    const { service, storage, audit } = makeService();
    const { key } = await service.upload(
      { filename: 'receipt.jpg', contentType: 'image/jpeg', data: onePixelPng },
      'user-1',
    );
    expect(key).toMatch(/^attachments\/[0-9a-f-]{36}\/receipt\.jpg$/);
    expect(storage.put).toHaveBeenCalledWith(key, expect.any(Buffer), 'image/jpeg');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ tableName: 'attachments', actorUserId: 'user-1' }),
    );
  });

  it('sanitises unsafe characters in the filename', async () => {
    const { service } = makeService();
    const { key } = await service.upload(
      { filename: '../../etc/passwd', contentType: 'image/png', data: onePixelPng },
      'user-1',
    );
    expect(key).not.toContain('..');
    expect(key).not.toContain('/etc/');
  });

  it('rejects an empty attachment', async () => {
    const { service } = makeService();
    await expect(
      service.upload({ filename: 'x.png', contentType: 'image/png', data: '' }, 'u'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an attachment over the size limit', async () => {
    const { service } = makeService();
    const bigBytes = Buffer.alloc(9 * 1024 * 1024).toString('base64');
    await expect(
      service.upload({ filename: 'big.png', contentType: 'image/png', data: bigBytes }, 'u'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('AttachmentsService.signedUrl', () => {
  it('returns a signed URL for a key', async () => {
    const { service, storage } = makeService();
    const { url } = await service.signedUrl('attachments/abc/receipt.jpg');
    expect(url).toBe('https://signed/url');
    expect(storage.getSignedUrl).toHaveBeenCalledWith('attachments/abc/receipt.jpg', 300);
  });

  it('rejects a missing key', async () => {
    const { service } = makeService();
    await expect(service.signedUrl('')).rejects.toBeInstanceOf(BadRequestException);
  });
});
