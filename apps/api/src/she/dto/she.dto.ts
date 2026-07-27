import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

/** Structured SHE record types (mirrors the `type` values documented on the schema model). */
export const SHE_TYPES = [
  'INCIDENT',
  'NEAR_MISS',
  'TOOLBOX_TALK',
  'MEDICAL',
  'DRILL',
  'HAZARD',
] as const;
export type SheType = (typeof SHE_TYPES)[number];

/** Record lifecycle. OPEN on capture; CLOSED once the investigation is concluded. */
export const SHE_STATUSES = ['OPEN', 'IN_PROGRESS', 'CLOSED'] as const;
export type SheStatus = (typeof SHE_STATUSES)[number];

/** POST /she — capture a SHE record at a site. `reportedByUserId` comes from the caller. */
export class CreateSheRecordDto {
  @ApiProperty({ enum: SHE_TYPES, description: 'SHE record type' })
  @IsIn(SHE_TYPES as unknown as string[])
  type!: SheType;

  @ApiProperty({ description: 'Site the record is captured against' })
  @IsUUID()
  siteId!: string;

  @ApiProperty({ example: 'Slip near the wash bay' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional({ description: 'Free-text description of what happened' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'MINOR', description: 'Severity label (free text)' })
  @IsOptional()
  @IsString()
  severity?: string;

  @ApiProperty({ description: 'When the event occurred (ISO date-time)' })
  @IsDateString()
  occurredAt!: string;

  @ApiPropertyOptional({ description: 'Investigation notes / findings' })
  @IsOptional()
  @IsString()
  investigation?: string;

  @ApiPropertyOptional({ description: 'Lost-time injury flag', default: false })
  @IsOptional()
  @IsBoolean()
  lti?: boolean;
}

/** PATCH /she/:id — advance an investigation (status / investigation / LTI). */
export class UpdateSheRecordDto {
  @ApiPropertyOptional({ enum: SHE_STATUSES })
  @IsOptional()
  @IsIn(SHE_STATUSES as unknown as string[])
  status?: SheStatus;

  @ApiPropertyOptional({ description: 'Investigation notes / findings' })
  @IsOptional()
  @IsString()
  investigation?: string;

  @ApiPropertyOptional({ description: 'Lost-time injury flag' })
  @IsOptional()
  @IsBoolean()
  lti?: boolean;
}

/** GET /she — list filter. */
export class ListSheRecordsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ enum: SHE_TYPES })
  @IsOptional()
  @IsIn(SHE_TYPES as unknown as string[])
  type?: SheType;

  @ApiPropertyOptional({ enum: SHE_STATUSES })
  @IsOptional()
  @IsIn(SHE_STATUSES as unknown as string[])
  status?: SheStatus;
}

/** GET /she/stats — TRIFR-style summary scope. */
export class SheStatsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  siteId?: string;
}
