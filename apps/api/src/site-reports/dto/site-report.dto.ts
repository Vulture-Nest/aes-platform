import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

const MONTH_REGEX = /^\d{4}-\d{2}$/;

/** POST /site-reports/open — manually open a monthly period for a site. */
export class OpenPeriodDto {
  @ApiProperty({ description: 'Site the report is for' })
  @IsUUID()
  siteId!: string;

  @ApiPropertyOptional({ description: 'Linked long-term contract' })
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiProperty({ example: '2026-07', description: 'Report month YYYY-MM' })
  @Matches(MONTH_REGEX, { message: 'periodMonth must be YYYY-MM' })
  periodMonth!: string;

  @ApiPropertyOptional({ description: 'Submission deadline (ISO date-time)' })
  @IsOptional()
  @IsDateString()
  deadline?: string;
}

/** POST /site-reports/open-for-month — open periods for all long-contract sites. */
export class OpenForMonthDto {
  @ApiProperty({ example: '2026-07' })
  @Matches(MONTH_REGEX, { message: 'periodMonth must be YYYY-MM' })
  periodMonth!: string;

  @ApiPropertyOptional({ description: 'Deadline applied to every opened period' })
  @IsOptional()
  @IsDateString()
  deadline?: string;
}

/** PATCH /site-reports/:id/sections/:key — set section content / mark complete. */
export class UpdateSectionDto {
  @ApiPropertyOptional({ description: 'Section body as arbitrary JSON' })
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @ApiPropertyOptional({ description: 'Completion timestamp (ISO); omit to leave incomplete' })
  @IsOptional()
  @IsDateString()
  completedAt?: string;

  @ApiPropertyOptional({ description: 'Human title for OTHER/custom sections' })
  @IsOptional()
  @IsString()
  title?: string;
}

/** POST /site-reports/:id/sections — add a custom (e.g. OTHER) section. */
export class AddSectionDto {
  @ApiProperty({ example: 'OTHER_SECURITY' })
  @IsString()
  @IsNotEmpty()
  sectionKey!: string;

  @ApiProperty({ example: 'Security & Access' })
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;
}

/** POST /site-reports/:id/submit — Site Manager review + submit. */
export class SubmitReportDto {
  @ApiProperty({ description: 'Overall Site Manager narrative for the month' })
  @IsString()
  @IsNotEmpty()
  narrative!: string;
}

export class ListPeriodsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ example: '2026-07' })
  @IsOptional()
  @Matches(MONTH_REGEX, { message: 'periodMonth must be YYYY-MM' })
  periodMonth?: string;

  @ApiPropertyOptional({ example: 'OPEN' })
  @IsOptional()
  @IsString()
  status?: string;
}
