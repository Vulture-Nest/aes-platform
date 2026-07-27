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
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * A new rate for a grade / NEC class after a gazetted award. Either a new hourly rate
 * (for hourly-paid employees) and/or a new monthly basic may be supplied — the engine
 * picks whichever applies to the employee's pay mode.
 */
export class NewRateDto {
  @ApiPropertyOptional({ description: 'Employee grade this rate applies to' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ description: 'NEC class this rate applies to' })
  @IsOptional()
  @IsString()
  necClass?: string;

  @ApiPropertyOptional({ example: 2.15, description: 'New hourly rate' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  hourly?: number;

  @ApiPropertyOptional({ example: 450, description: 'New monthly basic' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  basic?: number;
}

export class CreateBackPayBatchDto {
  @ApiProperty({ example: 'NEC 2024 wage award' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ description: 'Entity/multinational dimension' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiProperty({ example: '2024-01-01', description: 'Date the new rates take effect from' })
  @Type(() => Date)
  @IsDate()
  rateEffectiveFrom!: Date;

  @ApiPropertyOptional({ example: '2024-03-15', description: 'Date the award was gazetted' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  gazettedAt?: Date;

  @ApiPropertyOptional({ default: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiProperty({ type: [NewRateDto], description: 'New rates by grade / NEC class' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => NewRateDto)
  newRates!: NewRateDto[];

  @ApiProperty({
    type: [String],
    example: ['2024-01', '2024-02'],
    description: 'Affected periods (YYYY-MM) to recompute back-pay for',
  })
  @IsArray()
  @ArrayMinSize(1)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { each: true, message: 'affectedPeriods must be YYYY-MM' })
  affectedPeriods!: string[];

  @ApiPropertyOptional({ default: true, description: 'Are back-pay differences taxable?' })
  @IsOptional()
  @IsBoolean()
  taxable?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Are back-pay differences pensionable?' })
  @IsOptional()
  @IsBoolean()
  pensionable?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Are back-pay differences NSSA-able?' })
  @IsOptional()
  @IsBoolean()
  nssaAble?: boolean;
}
