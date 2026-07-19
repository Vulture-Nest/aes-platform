import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { ContractStatus, Currency } from '@prisma/client';
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

export class CreateContractDto {
  @ApiProperty()
  @IsUUID()
  clientId!: string;

  @ApiProperty({ example: 'CTR-2025-001' })
  @IsString()
  @MinLength(1)
  reference!: string;

  @ApiProperty({ example: 250000, description: 'VAT-exclusive contract value' })
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

  @ApiProperty({ example: '2025-01-01' })
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @ApiProperty({ example: '2025-12-31' })
  @Type(() => Date)
  @IsDate()
  endDate!: Date;

  @ApiPropertyOptional({ enum: ContractStatus, default: ContractStatus.UPCOMING })
  @IsOptional()
  @IsEnum(ContractStatus)
  status?: ContractStatus;
}

export class UpdateContractDto extends PartialType(CreateContractDto) {}
