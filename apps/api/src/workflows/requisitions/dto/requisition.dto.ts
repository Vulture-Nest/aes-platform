import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

/** Create a cash requisition (starts in DRAFT). */
export class CreateRequisitionDto {
  @ApiProperty({ example: 'Site fuel top-up for July haulage' })
  @IsString()
  @MinLength(1)
  purpose!: string;

  @ApiProperty({ example: 1500, description: 'Cash amount requested' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ enum: Currency })
  @IsEnum(Currency)
  currency!: Currency;

  @ApiProperty({ example: '2026-07-31' })
  @Type(() => Date)
  @IsDate()
  requiredByDate!: Date;

  @ApiPropertyOptional({ description: 'Optional order this requisition funds' })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Storage key of a supporting attachment' })
  @IsOptional()
  @IsString()
  attachmentKey?: string;

  @ApiPropertyOptional({ description: 'Site this requisition is raised for' })
  @IsOptional()
  @IsUUID()
  siteId?: string;
}

/** Record a human-performed disbursement against an approved requisition. */
export class DisburseRequisitionDto {
  @ApiProperty({ description: 'Source account the cash was paid from' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ example: 'EFT-99213', description: 'Bank/transfer reference of the payment' })
  @IsString()
  @MinLength(1)
  reference!: string;
}
