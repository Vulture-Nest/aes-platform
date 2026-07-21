import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../audit/audit.service';
import { STORAGE_SERVICE, StorageService } from '../storage/storage.service';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

/** Max decoded attachment size (8 MB) — receipts should be compressed client-side. */
const MAX_BYTES = 8 * 1024 * 1024;
const URL_TTL_SECONDS = 300;

/**
 * Stores supporting attachments (receipt photos, documents) in object storage and
 * hands back a key the owning request references. Reads are via short-lived signed URLs.
 */
@Injectable()
export class AttachmentsService {
  constructor(
    @Inject(STORAGE_SERVICE) private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  async upload(dto: UploadAttachmentDto, actorId: string): Promise<{ key: string }> {
    let body: Buffer;
    try {
      body = Buffer.from(dto.data, 'base64');
    } catch {
      throw new BadRequestException('data is not valid base64');
    }
    if (body.length === 0) {
      throw new BadRequestException('Attachment is empty');
    }
    if (body.length > MAX_BYTES) {
      throw new BadRequestException('Attachment exceeds the 8 MB limit');
    }

    // Namespaced, unguessable key; keep a sanitised filename as the last segment.
    // Replace anything outside [word/./-], then collapse `..` so no traversal survives.
    const safeName = dto.filename.replace(/[^\w.\-]/g, '_').replace(/\.{2,}/g, '.') || 'file';
    const key = `attachments/${randomUUID()}/${safeName}`;
    await this.storage.put(key, body, dto.contentType);

    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'attachments',
      recordId: null,
      after: { key, contentType: dto.contentType, bytes: body.length },
    });
    return { key };
  }

  async signedUrl(key: string): Promise<{ url: string }> {
    if (!key) {
      throw new BadRequestException('key is required');
    }
    const url = await this.storage.getSignedUrl(key, URL_TTL_SECONDS);
    return { url };
  }
}
