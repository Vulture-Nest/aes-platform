import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/** A single category line supplied when creating (or revising) a budget. */
export class BudgetLineDto {
  @ApiProperty({ example: 'Fuel', description: 'Spend category this line budgets for' })
  @IsString()
  @MinLength(1)
  category!: string;

  @ApiPropertyOptional({ description: 'Free-text description of the line' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 5000, description: 'Budgeted amount for the category' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;
}

/** Create a budget (starts in DRAFT) with one or more category lines. */
export class CreateBudgetDto {
  @ApiProperty({ example: 'July 2026 Site Operating Budget' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ example: '2026-07', description: 'ISO budget period (YYYY-MM)' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}$/, { message: 'periodMonth must be an ISO month string (YYYY-MM)' })
  periodMonth?: string;

  @ApiPropertyOptional({ description: 'Site this budget is scoped to (omit for a global budget)' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiProperty()
  @IsString()
  currency!: string;

  @ApiProperty({ type: [BudgetLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  lines!: BudgetLineDto[];
}

/**
 * Revise an active/approved budget: clone it to a new version. Lines default to a copy of the
 * source budget's lines; supply `lines` to override them (a Budget Change Request). Both take the
 * same dual OD+FD approval path.
 */
export class ReviseBudgetDto {
  @ApiPropertyOptional({ example: 'July 2026 Site Operating Budget (rev 2)' })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    type: [BudgetLineDto],
    description: 'Replacement lines; omit to carry the current lines forward unchanged',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BudgetLineDto)
  lines?: BudgetLineDto[];
}
