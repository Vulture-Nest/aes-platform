import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

/** Create an HR-lite employee. */
export class CreateEmployeeDto {
  @ApiProperty({ example: 'W-0421', description: 'Unique works number' })
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  worksNo!: string;

  @ApiProperty({ example: 'Tendai' })
  @IsString()
  @MinLength(1)
  firstName!: string;

  @ApiProperty({ example: 'Moyo' })
  @IsString()
  @MinLength(1)
  lastName!: string;

  @ApiPropertyOptional({ example: '63-1234567X-42' })
  @IsOptional()
  @IsString()
  nationalId?: string;

  @ApiPropertyOptional({ example: '0123456789' })
  @IsOptional()
  @IsString()
  nssaNo?: string;

  @ApiPropertyOptional({ example: 'C3' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ example: 'A1', description: 'NEC classification' })
  @IsOptional()
  @IsString()
  necClass?: string;

  @ApiPropertyOptional({ example: 'Loader Operator' })
  @IsOptional()
  @IsString()
  occupation?: string;

  @ApiProperty({ description: 'Site the employee is based at' })
  @IsUUID()
  siteId!: string;

  @ApiProperty({ example: 'PERMANENT', description: 'employment_type lookup code' })
  @IsString()
  employmentType!: string;

  @ApiProperty({ example: 'CLIENT_RATIO', description: 'pay_mode lookup code' })
  @IsString()
  payMode!: string;

  @ApiPropertyOptional({
    example: 60,
    description: 'Fixed USD percentage (0..100); only used when payMode = FIXED_SPLIT',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  fixedUsdPct?: number;

  @ApiPropertyOptional({ example: 3.5, description: 'Hourly rate' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourlyRate?: number;

  @ApiPropertyOptional({ example: 'CBZ Bank' })
  @IsOptional()
  @IsString()
  bankName?: string;

  @ApiPropertyOptional({ example: 'Nelson Mandela Ave' })
  @IsOptional()
  @IsString()
  bankBranch?: string;

  @ApiPropertyOptional({
    example: '01120345678',
    description: 'Bank account number (masked on read)',
  })
  @IsOptional()
  @IsString()
  accountNo?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  accountCurrency?: string;

  @ApiPropertyOptional({ example: 0, description: 'Opening leave balance (days)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  leaveBalance?: number;

  @ApiProperty({ example: '2024-01-15' })
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @ApiPropertyOptional({ example: '2026-01-15' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ description: 'Optional link to a users record (login)' })
  @IsOptional()
  @IsUUID()
  userId?: string;
}

/** Patch an employee — every field optional. */
export class UpdateEmployeeDto extends PartialType(CreateEmployeeDto) {}

/** Query filters for listing employees. */
export class ListEmployeesQueryDto {
  @ApiPropertyOptional({ description: 'Filter to a single site' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ example: 'PERMANENT', description: 'employment_type lookup code' })
  @IsOptional()
  @IsString()
  employmentType?: string;
}
