import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
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

export class CreateOrderDto {
  @ApiProperty()
  @IsUUID()
  clientId!: string;

  @ApiPropertyOptional({ description: 'Optional contract this order belongs to' })
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiProperty({ example: 'ORD-2025-001' })
  @IsString()
  @MinLength(1)
  reference!: string;

  @ApiProperty({ example: 15000, description: 'VAT-exclusive order value' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valueExVat!: number;

  @ApiProperty({ enum: Currency })
  @IsEnum(Currency)
  currency!: Currency;

  @ApiPropertyOptional({ description: 'FX rate row used to convert this money' })
  @IsOptional()
  @IsUUID()
  fxRateId?: string;

  @ApiPropertyOptional({ example: 'OFFICIAL' })
  @IsOptional()
  @IsString()
  rateType?: string;

  @ApiPropertyOptional({ example: '2025-06-30' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  closingDate?: Date;
}

export class UpdateOrderDto extends PartialType(CreateOrderDto) {}

export class CreateOrderReceiptDto {
  @ApiProperty({ example: 15000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ enum: Currency })
  @IsEnum(Currency)
  currency!: Currency;

  @ApiPropertyOptional({ description: 'FX rate row used to convert this money' })
  @IsOptional()
  @IsUUID()
  fxRateId?: string;

  @ApiPropertyOptional({ example: 'OFFICIAL' })
  @IsOptional()
  @IsString()
  rateType?: string;

  @ApiProperty({ example: '2025-07-01' })
  @Type(() => Date)
  @IsDate()
  receivedDate!: Date;

  @ApiPropertyOptional({ example: 'EFT-88213' })
  @IsOptional()
  @IsString()
  reference?: string;
}
