import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AttachmentsService } from './attachments.service';
import { UploadAttachmentDto } from './dto/upload-attachment.dto';

/**
 * Attachment upload/download for supporting documents (receipt photos captured on
 * mobile, etc.). Any authenticated user may upload — the returned key is then set on
 * the owning request (requisition / petty-cash withdrawal), which carries its own RBAC.
 */
@ApiTags('attachments')
@ApiBearerAuth()
@Controller({ path: 'attachments', version: '1' })
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Upload a base64 attachment (receipt/document); returns its storage key' })
  upload(@Body() dto: UploadAttachmentDto, @CurrentUser('id') actorId: string) {
    return this.attachments.upload(dto, actorId);
  }

  @Get('url')
  @ApiOperation({ summary: 'Get a short-lived signed URL to view an attachment by key' })
  @ApiQuery({ name: 'key', required: true })
  signedUrl(@Query('key') key: string) {
    return this.attachments.signedUrl(key);
  }
}
