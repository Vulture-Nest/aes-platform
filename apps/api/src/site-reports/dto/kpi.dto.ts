import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

export const KPI_DIRECTIONS = ['HIGHER_BETTER', 'LOWER_BETTER'] as const;

export class CreateKpiDto {
  @ApiPropertyOptional({ description: 'Scope the KPI to a contract' })
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiPropertyOptional({ description: 'Scope the KPI to a site' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiProperty({ example: 'timeliness' })
  @IsString()
  kpiKey!: string;

  @ApiProperty({ example: 'Report Timeliness' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: '%' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiPropertyOptional({ example: 1, description: 'Weight in the site score' })
  @IsOptional()
  @IsNumber()
  weight?: number;

  @ApiPropertyOptional({ enum: KPI_DIRECTIONS, default: 'HIGHER_BETTER' })
  @IsOptional()
  @IsIn(KPI_DIRECTIONS as unknown as string[])
  direction?: string;
}

export class UpdateKpiDto extends PartialType(CreateKpiDto) {}

export class ListKpisQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class UpsertTargetDto {
  @ApiPropertyOptional({ example: '2026-07', description: 'Month this target applies to (stepped targets)' })
  @IsOptional()
  @Matches(MONTH_REGEX, { message: 'periodMonth must be YYYY-MM' })
  periodMonth?: string;

  @ApiPropertyOptional({ description: 'Effective-from date (alternative to periodMonth)' })
  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  targetValue!: number;

  @ApiPropertyOptional({ example: 5, description: 'Amber band width in the KPI unit' })
  @IsOptional()
  @IsNumber()
  tolerance?: number;
}

export class UpsertActualDto {
  @ApiProperty({ example: '2026-07' })
  @Matches(MONTH_REGEX, { message: 'periodMonth must be YYYY-MM' })
  periodMonth!: string;

  @ApiProperty({ example: 96 })
  @IsNumber()
  actualValue!: number;
}
