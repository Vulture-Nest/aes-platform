import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsDate, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateGeneralExpenseDto {
  @ApiProperty({ example: 1200, description: 'VAT-exclusive amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty()
  @IsString()
  currency!: string;

  @ApiProperty({ description: 'Whether input VAT is claimable (needs a fiscal invoice)' })
  @IsBoolean()
  vatClaimable!: boolean;

  @ApiPropertyOptional({ example: 'Fuel' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ example: '2026-07-01' })
  @Type(() => Date)
  @IsDate()
  expenseDate!: Date;

  @ApiPropertyOptional({ example: 'OFFICIAL' })
  @IsOptional()
  @IsString()
  rateType?: string;
}
