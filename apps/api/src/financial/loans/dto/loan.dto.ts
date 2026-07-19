import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { LoanInterestMethod, LoanStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateLoanDto {
  @ApiProperty({ example: 'ABC Microfinance' })
  @IsString()
  @MinLength(1)
  lender!: string;

  @ApiProperty({ example: 50000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  principal!: number;

  @ApiProperty()
  @IsString()
  currency!: string;

  @ApiPropertyOptional({ description: 'FX rate row used to convert this money' })
  @IsOptional()
  @IsUUID()
  fxRateId?: string;

  @ApiPropertyOptional({ example: 'OFFICIAL' })
  @IsOptional()
  @IsString()
  rateType?: string;

  @ApiProperty({ example: 2.5, description: 'Weekly interest rate percentage' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  weeklyRatePct!: number;

  @ApiPropertyOptional({ enum: LoanInterestMethod, default: LoanInterestMethod.FLAT })
  @IsOptional()
  @IsEnum(LoanInterestMethod)
  interestMethod?: LoanInterestMethod;

  @ApiProperty({ example: '2025-01-15' })
  @Type(() => Date)
  @IsDate()
  startDate!: Date;

  @ApiPropertyOptional({ enum: LoanStatus, default: LoanStatus.ACTIVE })
  @IsOptional()
  @IsEnum(LoanStatus)
  status?: LoanStatus;
}

export class UpdateLoanDto extends PartialType(CreateLoanDto) {}

export class CreateLoanRepaymentDto {
  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty()
  @IsString()
  currency!: string;

  @ApiPropertyOptional({ description: 'FX rate row used to convert this money' })
  @IsOptional()
  @IsUUID()
  fxRateId?: string;

  @ApiPropertyOptional({ example: 'OFFICIAL' })
  @IsOptional()
  @IsString()
  rateType?: string;

  @ApiProperty({ example: '2025-01-22' })
  @Type(() => Date)
  @IsDate()
  repaidDate!: Date;
}
