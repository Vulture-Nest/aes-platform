import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '@prisma/client';
import { IsEnum, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateThresholdDto {
  @ApiProperty({ example: 'petty_cash_fd_threshold' })
  @IsString()
  key!: string;

  @ApiPropertyOptional({ enum: Currency })
  @IsOptional()
  @IsEnum(Currency)
  currency?: Currency;

  @ApiPropertyOptional({ example: 100, description: 'Scalar threshold value' })
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional({ description: 'Structured params (e.g. danger-rule bands)' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
