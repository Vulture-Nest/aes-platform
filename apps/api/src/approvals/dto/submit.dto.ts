import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

/**
 * Payload other modules pass to ApprovalService.submit — also exposed as a
 * SYS_ADMIN-only endpoint for testing the engine in isolation.
 */
export class SubmitDto {
  @ApiProperty({ example: 'requisition' })
  @IsString()
  module!: string;

  @ApiProperty({ example: 'requisitions', description: 'Subject table name' })
  @IsString()
  subjectTable!: string;

  @ApiProperty({ description: 'PK of the subject row being submitted for approval' })
  @IsUUID()
  subjectId!: string;

  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Site scope, used to select site-specific matrix rows' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiProperty({ description: 'The user who raised the subject (blocked from self-approval)' })
  @IsUUID()
  requesterId!: string;
}
