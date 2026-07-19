import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class CreateThresholdDto {
  @ApiProperty({ example: 'petty_cash_fd_threshold' })
  @IsString()
  key!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 100, description: 'Scalar threshold value' })
  @IsOptional()
  @IsNumber()
  value?: number;

  @ApiPropertyOptional({ description: 'Structured params (e.g. danger-rule bands)' })
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}
