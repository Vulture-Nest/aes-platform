import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ActingBasis } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateActingAssignmentDto {
  @ApiProperty({ description: 'Employee doing the acting' })
  @IsUUID()
  employeeId!: string;

  @ApiPropertyOptional({ description: 'Entity/multinational dimension' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiProperty({ example: 'Site Manager' })
  @IsString()
  @MinLength(2)
  actingPosition!: string;

  @ApiPropertyOptional({ example: 'M2', description: 'Grade being acted into' })
  @IsOptional()
  @IsString()
  actingGrade?: string;

  @ApiProperty({ example: '2026-06-01' })
  @Type(() => Date)
  @IsDate()
  dateFrom!: Date;

  @ApiProperty({ example: '2026-06-30' })
  @Type(() => Date)
  @IsDate()
  dateTo!: Date;

  @ApiProperty({ enum: ActingBasis, description: 'FIXED amount, or PERCENT of grade differential' })
  @IsEnum(ActingBasis)
  basis!: ActingBasis;

  @ApiPropertyOptional({ example: 150, description: 'Fixed monthly allowance (basis=FIXED)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  fixedAmount?: number;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 15, description: 'Percent of differential (basis=PERCENT), 0..100' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percent?: number;

  @ApiPropertyOptional({ example: 15, description: 'Minimum qualifying days in the period to earn' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minQualifyingDays?: number;
}

/**
 * Inputs to compute the acting allowance for a specific payroll run. Grade basics for a
 * PERCENT-basis assignment are resolved configurably: passed in here, else read from the
 * employee record. Never hard-coded.
 */
export class ComputeActingForRunDto {
  @ApiProperty({ description: 'Employee to compute acting for' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: '2026-06', description: "Run period month YYYY-MM" })
  @IsString()
  month!: string;

  @ApiPropertyOptional({ description: 'Own (substantive) monthly basic — for PERCENT basis' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  ownBasic?: number;

  @ApiPropertyOptional({ description: 'Acting-grade monthly basic — for PERCENT basis' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  actingGradeBasic?: number;

  @ApiPropertyOptional({ description: 'Optional payroll run id to stamp on the extra earning' })
  @IsOptional()
  @IsUUID()
  runId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  pensionable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  nssaAble?: boolean;
}

export class ActingRegisterQueryDto {
  @ApiPropertyOptional({ example: '2026-01-01', description: 'Overlap window start' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Overlap window end' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;

  @ApiPropertyOptional({ description: 'Filter by employee' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}
