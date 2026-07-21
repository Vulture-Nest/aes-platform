import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';

/**
 * Attachment upload/download. StorageModule (STORAGE_SERVICE) and AuditService are
 * global, so no extra imports are needed.
 */
@Module({
  controllers: [AttachmentsController],
  providers: [AttachmentsService],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
