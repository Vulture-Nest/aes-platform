import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class CreateOrderDto {
  @ApiProperty()
  @IsUUID()
  clientId!: string;

  @ApiPropertyOptional({ description: 'Optional contract this order belongs to' })
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiProperty({ example: 'ORD-2025-001' })
  @IsString()
  @MinLength(1)
  reference!: string;

  @ApiPropertyOptional({ example: 'Q3 crusher overhaul' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiProperty({ example: 15000, description: 'VAT-exclusive order value' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valueExVat!: number;

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

  @ApiPropertyOptional({ example: '2025-06-01', description: 'Date the order was issued' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  issueDate?: Date;

  @ApiPropertyOptional({ default: false, description: 'Whether an advance payment applies' })
  @IsOptional()
  @IsBoolean()
  advancePayment?: boolean;

  @ApiPropertyOptional({ example: '2025-06-30' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  closingDate?: Date;

  @ApiPropertyOptional({ description: 'User who will service this order' })
  @IsOptional()
  @IsUUID()
  assignedUserId?: string;
}

export class UpdateOrderDto extends PartialType(CreateOrderDto) {}

export class CreateOrderReceiptDto {
  @ApiProperty({ example: 15000 })
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

  @ApiProperty({ example: '2025-07-01' })
  @Type(() => Date)
  @IsDate()
  receivedDate!: Date;

  @ApiPropertyOptional({ example: 'EFT-88213' })
  @IsOptional()
  @IsString()
  reference?: string;
}

/**
 * G18 (Appendix B.2a): add a partial-servicing milestone to an order. Supply a
 * `valuePortion` (order value delivered by this milestone) and/or a `percentPortion`
 * (% of overall scope). `completedAt` marks it done (omit for a not-yet-done milestone).
 */
export class CreateOrderMilestoneDto {
  @ApiProperty({ example: 'Phase 1 — site survey & design' })
  @IsString()
  @MinLength(1)
  description!: string;

  @ApiPropertyOptional({ example: 5000, description: 'Order value ex VAT delivered by this milestone' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valuePortion?: number;

  @ApiPropertyOptional({ example: 33.33, description: 'Percentage of overall scope (0–100)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percentPortion?: number;

  @ApiPropertyOptional({ example: '2025-07-15', description: 'When completed (omit if not yet done)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  completedAt?: Date;
}

export class CreateOrderExpenseDto {
  @ApiProperty({ example: 1200, description: 'VAT-exclusive expense amount' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty()
  @IsString()
  currency!: string;

  @ApiPropertyOptional({ description: 'Whether input VAT is claimable (needs a fiscal invoice)' })
  @IsOptional()
  @IsBoolean()
  vatClaimable?: boolean;

  @ApiPropertyOptional({ example: 'Fuel' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ example: 'Site fuel' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'OFFICIAL' })
  @IsOptional()
  @IsString()
  rateType?: string;
}
