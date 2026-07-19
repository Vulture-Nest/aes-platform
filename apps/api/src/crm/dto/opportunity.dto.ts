import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { OpportunityStage } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateOpportunityDto {
  @ApiProperty({ example: 'Mimosa water-treatment plant upgrade' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional({ description: 'CRM organisation this deal belongs to' })
  @IsOptional()
  @IsUUID()
  organisationId?: string;

  @ApiPropertyOptional({ description: 'Primary contact for this deal' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional({ enum: OpportunityStage, default: OpportunityStage.CONTACT })
  @IsOptional()
  @IsEnum(OpportunityStage)
  stage?: OpportunityStage;

  @ApiPropertyOptional({ example: 120000, description: 'Estimated VAT-exclusive deal value' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedValue?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'User who owns this deal' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  expectedCloseDate?: Date;
}

export class UpdateOpportunityDto extends PartialType(CreateOpportunityDto) {}

export class ListOpportunitiesQueryDto {
  @ApiPropertyOptional({ enum: OpportunityStage, description: 'Filter by stage' })
  @IsOptional()
  @IsEnum(OpportunityStage)
  stage?: OpportunityStage;

  @ApiPropertyOptional({ description: 'Filter by owning user' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}

export class MoveOpportunityDto {
  @ApiProperty({ enum: OpportunityStage, description: 'Target stage to move the deal to' })
  @IsEnum(OpportunityStage)
  stage!: OpportunityStage;

  @ApiPropertyOptional({ description: 'Required when moving to LOST' })
  @IsOptional()
  @IsString()
  lostReason?: string;
}

/// What kind of financial-core entity a WON opportunity is converted into.
export enum ConvertTarget {
  ORDER = 'ORDER',
  CONTRACT = 'CONTRACT',
}

export class ConvertOpportunityDto {
  @ApiProperty({ enum: ConvertTarget, description: 'Convert into an Order or a Contract' })
  @IsEnum(ConvertTarget)
  as!: ConvertTarget;

  @ApiProperty({ example: 'ORD-2026-014', description: 'Reference for the created order/contract' })
  @IsString()
  @MinLength(1)
  reference!: string;

  @ApiProperty({ description: 'Billed client the created order/contract belongs to' })
  @IsUUID()
  clientId!: string;

  @ApiPropertyOptional({
    example: 120000,
    description: 'VAT-exclusive value; defaults to the opportunity estimatedValue',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  valueExVat?: number;

  @ApiPropertyOptional({
    description: 'Currency; defaults to the opportunity currency',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Order closing date (ORDER only)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  closingDate?: Date;

  @ApiPropertyOptional({
    example: '2026-08-01',
    description: 'Contract start date (CONTRACT only)',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ example: '2027-07-31', description: 'Contract end date (CONTRACT only)' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;
}
