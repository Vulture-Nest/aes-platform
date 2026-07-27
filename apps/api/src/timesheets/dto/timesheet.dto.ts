import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  ValidateNested,
} from 'class-validator';

/** Query filter for listing timesheet periods. */
export class ListTimesheetPeriodsQueryDto {
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

/** Create a monthly timesheet period for a site. */
export class CreateTimesheetPeriodDto {
  @ApiProperty({ description: 'Site the period belongs to' })
  @IsUUID()
  siteId!: string;

  @ApiProperty({ example: '2026-07', description: 'Calendar month in YYYY-MM' })
  @IsString()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month must be in YYYY-MM format' })
  month!: string;
}

/** A single employee-day row in the bulk grid upsert. */
export class TimesheetEntryRowDto {
  @ApiProperty({ description: 'Employee this row is for' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: '2026-07-15' })
  @Type(() => Date)
  @IsDate()
  date!: Date;

  @ApiPropertyOptional({ example: 8, description: 'Normal hours' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hoursNormal?: number;

  @ApiPropertyOptional({ example: 2, description: 'Overtime hours @ 1.5x' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hoursOt15?: number;

  @ApiPropertyOptional({ example: 1, description: 'Overtime hours @ 2.0x' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hoursOt20?: number;

  @ApiPropertyOptional({ example: 1, description: 'Underground shift allowance count' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ugShift?: number;

  @ApiPropertyOptional({ example: 4, description: 'Night hours' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  nightHours?: number;

  @ApiPropertyOptional({ example: 'Called in for breakdown' })
  @IsOptional()
  @IsString()
  remarks?: string;
}

/** Bulk grid upsert: a batch of employee-day rows for one period. */
export class UpsertEntriesDto {
  @ApiProperty({ type: [TimesheetEntryRowDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => TimesheetEntryRowDto)
  rows!: TimesheetEntryRowDto[];
}

/** Reopen-request payload (audited; does not auto-unlock). */
export class ReopenRequestDto {
  @ApiProperty({ example: 'Two night-shift rows were captured on the wrong day' })
  @IsString()
  reason!: string;
}

/**
 * Reopen payload: actually reverts a LOCKED/SITE_APPROVED period back to OPEN (G22).
 * `force` lets a SYS_ADMIN override the payroll-consumed guard.
 */
export class ReopenDto {
  @ApiProperty({ example: 'Two night-shift rows were captured on the wrong day' })
  @IsString()
  reason!: string;

  @ApiPropertyOptional({
    description: 'SYS_ADMIN override: reopen even if a payroll run has consumed this period',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
