import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  MinLength,
} from 'class-validator';

export class CreateEntityDto {
  @ApiProperty({ example: 'AES Zimbabwe' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'ZW', description: 'ISO-3166 alpha-2 country code' })
  @IsString()
  @Length(2, 2)
  country!: string;

  @ApiProperty({ example: 'USD', description: 'ISO-4217 base currency code' })
  @IsString()
  @Length(3, 3)
  baseCurrency!: string;

  @ApiPropertyOptional({ description: 'External chart-of-accounts reference' })
  @IsOptional()
  @IsString()
  chartOfAccountsRef?: string;

  @ApiPropertyOptional({ example: 'Africa/Harare', default: 'Africa/Harare' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 'en', default: 'en' })
  @IsOptional()
  @IsString()
  locale?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateEntityDto extends PartialType(CreateEntityDto) {}

export class CreateHolidayDto {
  @ApiProperty({ example: '2026-04-18', description: 'Holiday date (ISO-8601)' })
  @IsISO8601()
  date!: string;

  @ApiProperty({ example: 'Good Friday' })
  @IsString()
  @MinLength(2)
  name!: string;
}
