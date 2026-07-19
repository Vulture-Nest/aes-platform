import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsNumber, IsString, Min, MinLength } from 'class-validator';

/** Create an effective-dated per-diem rate row (admin only). */
export class CreateTravelRateDto {
  @ApiProperty({ example: 'M3', description: 'Traveller grade band' })
  @IsString()
  @MinLength(1)
  grade!: string;

  @ApiProperty({ example: 'A', description: 'Destination class band' })
  @IsString()
  @MinLength(1)
  destinationClass!: string;

  @ApiProperty({ enum: Currency })
  @IsEnum(Currency)
  currency!: Currency;

  @ApiProperty({ example: 85, description: 'Per-day allowance for this grade/class/currency' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  dailyRate!: number;

  @ApiProperty({ example: '2026-07-01', description: 'Date this rate becomes effective' })
  @Type(() => Date)
  @IsDate()
  effectiveDate!: Date;
}
