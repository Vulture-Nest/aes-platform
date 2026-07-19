import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { RateType } from '../rate-type.enum';
import { IsDate, IsEnum, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateExchangeRateDto {
  @ApiProperty({ example: '2025-03-01' })
  @Type(() => Date)
  @IsDate()
  dateEffective!: Date;

  @ApiProperty({ example: 'USD/ZWG' })
  @Matches(/^[A-Z]{3}\/[A-Z]{3}$/, { message: 'currencyPair must look like "USD/ZWG"' })
  currencyPair!: string;

  @ApiProperty({ example: 26.5 })
  @IsNumber()
  @Min(0)
  officialRate!: number;

  @ApiPropertyOptional({ example: 40.0, description: 'Street/parallel rate' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  parallelRate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  source?: string;
}

export class RateAsOfQueryDto {
  @ApiProperty({ example: 'USD/ZWG' })
  @Matches(/^[A-Z]{3}\/[A-Z]{3}$/)
  pair!: string;

  @ApiPropertyOptional({ description: 'Defaults to now' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  date?: Date;

  @ApiPropertyOptional({ enum: RateType, default: RateType.OFFICIAL })
  @IsOptional()
  @IsEnum(RateType)
  type?: RateType;
}
