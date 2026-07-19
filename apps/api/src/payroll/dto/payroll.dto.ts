import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

/** Open a new DRAFT payroll run for a site + month. */
export class OpenPayrollRunDto {
  @ApiProperty({ description: 'Site the run belongs to' })
  @IsUUID()
  siteId!: string;

  @ApiProperty({ example: '2026-07', description: 'Calendar month in YYYY-MM' })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be in YYYY-MM format' })
  month!: string;

  @ApiPropertyOptional({
    description: 'Exchange-rate row to snapshot for USD/ZWG conversion. Resolved as-of if omitted.',
  })
  @IsOptional()
  @IsUUID()
  fxRateId?: string;
}

/** Query filter for listing payroll runs. */
export class ListPayrollRunsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by site' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ example: '2026-07', description: 'Filter by month (YYYY-MM)' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be in YYYY-MM format' })
  month?: string;
}
