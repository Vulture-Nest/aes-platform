import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

export class CreateCampaignDto {
  @ApiProperty({ example: 'Q3 Mining-sector water-treatment push' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ description: 'Legal operating entity this campaign belongs to' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ example: 'Generate 20 qualified leads from platinum belt' })
  @IsOptional()
  @IsString()
  objective?: string;

  @ApiPropertyOptional({ example: 'Mine procurement + facilities managers' })
  @IsOptional()
  @IsString()
  audience?: string;

  @ApiPropertyOptional({ example: 5000, description: 'Total campaign budget' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  budget?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: '2026-07-01' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startDate?: Date;

  @ApiPropertyOptional({ example: '2026-09-30' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endDate?: Date;

  @ApiPropertyOptional({ example: 'PLANNED', default: 'PLANNED' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'User who owns this campaign' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}

export class UpdateCampaignDto extends PartialType(CreateCampaignDto) {}

export class ListCampaignsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by status (PLANNED/ACTIVE/CLOSED)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Filter by owning entity' })
  @IsOptional()
  @IsUUID()
  entityId?: string;
}

export class CreateChannelDto {
  @ApiProperty({ example: 'Facebook', description: 'Free string: Facebook/LinkedIn/WhatsApp/X/Instagram/Expo/Flier' })
  @IsString()
  @MinLength(1)
  channelType!: string;

  @ApiPropertyOptional({ example: 250, description: 'Channel cost' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'Tracking link (auto-stubbed for Flier channels if omitted)' })
  @IsOptional()
  @IsString()
  trackingLink?: string;

  @ApiPropertyOptional({ description: 'Flier code (auto-generated AES-FL-<seq> for Flier channels if omitted)' })
  @IsOptional()
  @IsString()
  flierCode?: string;

  @ApiPropertyOptional({ example: 500, description: 'Print run quantity (Flier channels)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  printRunQty?: number;
}

export class UpdateChannelDto extends PartialType(CreateChannelDto) {}

export class CreateMetricDto {
  @ApiProperty({ example: '2026-07-06', description: 'Monday of the reporting week' })
  @Type(() => Date)
  @IsDate()
  weekOf!: Date;

  @ApiPropertyOptional({ example: 12000, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  impressions?: number;

  @ApiPropertyOptional({ example: 800, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  engagements?: number;

  @ApiPropertyOptional({ example: 140, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  clicks?: number;

  @ApiPropertyOptional({ example: 250, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  spend?: number;
}
