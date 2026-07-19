import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AlertSeverity } from '@prisma/client';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString } from 'class-validator';

/** Create a danger rule (or seed one explicitly). */
export class CreateDangerRuleDto {
  @ApiProperty({ example: 'cash_runway' })
  @IsString()
  ruleKey!: string;

  @ApiProperty({ description: 'Rule-specific params (thresholds).', example: { dangerWeeks: 4 } })
  @IsObject()
  params!: Record<string, unknown>;

  @ApiProperty({ enum: AlertSeverity })
  @IsEnum(AlertSeverity)
  severity!: AlertSeverity;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

/** Patch a danger rule — every field optional. */
export class UpdateDangerRuleDto {
  @ApiPropertyOptional({ description: 'Rule-specific params (thresholds).' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;

  @ApiPropertyOptional({ enum: AlertSeverity })
  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
