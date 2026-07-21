import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Upload a supporting attachment (receipt photo / document) as base64. Kept as a
 * simple JSON body so mobile/web clients can post a captured image without
 * multipart plumbing; the returned key is passed to the owning request
 * (requisition.attachmentKey / petty-cash receiptKey).
 */
export class UploadAttachmentDto {
  @ApiProperty({ example: 'receipt.jpg' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  filename!: string;

  @ApiProperty({ example: 'image/jpeg', description: 'Image or PDF mime type' })
  @IsString()
  @Matches(/^(image\/(jpeg|png|webp|heic)|application\/pdf)$/, {
    message: 'contentType must be a JPEG/PNG/WebP/HEIC image or PDF',
  })
  contentType!: string;

  @ApiProperty({ description: 'Base64-encoded file bytes (no data: prefix)' })
  @IsString()
  @MinLength(1)
  data!: string;
}
