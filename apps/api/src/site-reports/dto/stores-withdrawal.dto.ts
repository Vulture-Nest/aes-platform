import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export const STORES_ITEM_TYPES = ['FUEL', 'OIL', 'MATERIAL', 'TOOL'] as const;

export class CreateStoresWithdrawalDto {
  @ApiProperty({ description: 'Site the item was drawn at' })
  @IsUUID()
  siteId!: string;

  @ApiProperty({ enum: STORES_ITEM_TYPES })
  @IsIn(STORES_ITEM_TYPES as unknown as string[])
  itemType!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 200 })
  @IsNumber()
  @Min(0)
  quantity!: number;

  @ApiPropertyOptional({ example: 'litres' })
  @IsOptional()
  @IsString()
  unit?: string;

  @ApiProperty({ example: 350.5, description: 'Monetary value of the withdrawal' })
  @IsNumber()
  @Min(0)
  value!: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'AES-TRK-04' })
  @IsOptional()
  @IsString()
  vehicleRef?: string;

  @ApiProperty({ description: 'When the stock was drawn (ISO date-time)' })
  @IsDateString()
  drawnAt!: string;

  @ApiPropertyOptional({ description: 'Allocated/authorised quantity for variance flagging' })
  @IsOptional()
  @IsNumber()
  allocation?: number;
}

export class UpdateStoresWithdrawalDto extends PartialType(CreateStoresWithdrawalDto) {}

export class ListStoresWithdrawalsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ enum: STORES_ITEM_TYPES })
  @IsOptional()
  @IsIn(STORES_ITEM_TYPES as unknown as string[])
  itemType?: string;
}
