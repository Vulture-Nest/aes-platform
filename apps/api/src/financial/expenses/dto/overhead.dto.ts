import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateOverheadDto {
  @ApiProperty({ example: 5000 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty()
  @IsString()
  currency!: string;

  @ApiPropertyOptional({ example: 'Rent' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    example: '2026-07',
    description: 'Period the overhead belongs to (YYYY-MM)',
  })
  @IsOptional()
  @IsString()
  periodMonth?: string;

  @ApiPropertyOptional({ example: 'OFFICIAL' })
  @IsOptional()
  @IsString()
  rateType?: string;
}
