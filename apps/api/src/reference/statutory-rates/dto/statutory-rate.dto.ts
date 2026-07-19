import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateStatutoryRateDto {
  @ApiProperty({ example: 'vat_pct', description: 'vat_pct, zimra_interest_pct, paye_bands, …' })
  @IsString()
  key!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 15.5, description: 'Scalar value (percent or amount)' })
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional({ description: 'Structured value, e.g. PAYE bands' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiProperty({ example: '2025-01-01' })
  @Type(() => Date)
  @IsDate()
  dateEffective!: Date;
}

export class StatutoryValueQueryDto {
  @ApiProperty({ example: 'vat_pct' })
  @IsString()
  key!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;
}
