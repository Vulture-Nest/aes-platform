import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

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

  @ApiProperty()
  @IsString()
  currency!: string;

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

  @ApiPropertyOptional({
    example: 'UPCOMING',
    description: 'Configured contract_status lookup code',
  })
  @IsOptional()
  @IsString()
  status?: string;
}

export class UpdateContractDto extends PartialType(CreateContractDto) {}

export class CreateContractClaimDto {
  @ApiProperty({ example: 20000, description: 'VAT-exclusive claim amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amountExVat!: number;

  @ApiProperty()
  @IsString()
  currency!: string;

  @ApiProperty({ example: '2026-07-01' })
  @Type(() => Date)
  @IsDate()
  claimDate!: Date;

  @ApiPropertyOptional({ example: 3000, description: 'VAT paid to date against this claim' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  vatPaidToDate?: number;

  @ApiPropertyOptional({ example: '2026-07-15', description: 'Date the claim was received/settled' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  receivedDate?: Date;

  @ApiPropertyOptional({ example: 'OFFICIAL' })
  @IsOptional()
  @IsString()
  rateType?: string;
}
