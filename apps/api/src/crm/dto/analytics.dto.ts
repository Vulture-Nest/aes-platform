import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsOptional, IsUUID } from 'class-validator';

/// Query filters for the CRM conversion-analytics report.
export class ConversionAnalyticsQueryDto {
  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Start of the date range (inclusive)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'End of the date range (inclusive)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ description: 'Restrict the report to a single owning user' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}
