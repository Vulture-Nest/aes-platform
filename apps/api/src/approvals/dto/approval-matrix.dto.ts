import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ApprovalMode } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreateApprovalMatrixDto {
  @ApiProperty({ example: 'requisition', description: 'Module key this rule applies to' })
  @IsString()
  module!: string;

  @ApiPropertyOptional({ example: 0, description: 'Inclusive lower bound of the amount band' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minAmount?: number;

  @ApiPropertyOptional({ example: 10000, description: 'Inclusive upper bound of the amount band' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Scope to a site; omit for a global rule' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiProperty({ example: 1, description: 'Ordering of this step within the chain' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  stepOrder!: number;

  @ApiProperty({
    example: 'FINANCE_DIRECTOR',
    description: 'Approver role code; validated at runtime against the settings lookup catalog.',
  })
  @IsString()
  approverRole!: string;

  @ApiPropertyOptional({ enum: ApprovalMode, default: ApprovalMode.SEQUENTIAL })
  @IsOptional()
  @IsEnum(ApprovalMode)
  mode?: ApprovalMode;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

/** Patch an approval-matrix rule — currently just enable/disable. */
export class UpdateApprovalMatrixDto {
  @ApiPropertyOptional({ description: 'Enable or disable this routing rule' })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
