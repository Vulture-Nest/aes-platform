import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEmail, IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

/** Lifecycle of an inbound campaign response/lead. */
export const RESPONSE_STATUSES = ['NEW', 'CONTACTED', 'QUALIFIED', 'DEAD'] as const;
export type ResponseStatus = (typeof RESPONSE_STATUSES)[number];

export class CreateResponseDto {
  @ApiPropertyOptional({ description: 'Campaign this response is attributed to' })
  @IsOptional()
  @IsUUID()
  campaignId?: string;

  @ApiPropertyOptional({ description: 'Channel this response came through' })
  @IsOptional()
  @IsUUID()
  channelId?: string;

  @ApiPropertyOptional({ example: 'Tendai Moyo' })
  @IsOptional()
  @IsString()
  personName?: string;

  @ApiPropertyOptional({ example: 'Mimosa Mining Co' })
  @IsOptional()
  @IsString()
  orgName?: string;

  @ApiPropertyOptional({ example: 'tendai@mimosa.co.zw' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: '+263771234567' })
  @IsOptional()
  @IsString()
  contactPhone?: string;

  @ApiPropertyOptional({ example: '2026-07-15T09:30:00Z', description: 'Defaults to now if omitted' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  receivedAt?: Date;

  @ApiProperty({ example: 'Facebook ad', description: 'How the lead heard about AES (required)' })
  @IsString()
  @MinLength(1)
  howHeard!: string;

  @ApiPropertyOptional({ description: 'BD user who owns this lead' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}

export class ListResponsesQueryDto {
  @ApiPropertyOptional({ enum: RESPONSE_STATUSES, description: 'Filter by status' })
  @IsOptional()
  @IsIn(RESPONSE_STATUSES)
  status?: ResponseStatus;

  @ApiPropertyOptional({ description: 'Filter by campaign' })
  @IsOptional()
  @IsUUID()
  campaignId?: string;
}

export class UpdateResponseStatusDto {
  @ApiProperty({ enum: RESPONSE_STATUSES })
  @IsIn(RESPONSE_STATUSES)
  status!: ResponseStatus;
}

export class ConvertResponseDto {
  @ApiProperty({ example: 'Mimosa water-treatment plant upgrade', description: 'Title for the created CRM opportunity' })
  @IsString()
  @MinLength(2)
  title!: string;

  @ApiPropertyOptional({ description: 'Organisation to attach to the opportunity' })
  @IsOptional()
  @IsUUID()
  organisationId?: string;

  @ApiPropertyOptional({ description: 'Contact to attach to the opportunity' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiPropertyOptional({ example: 120000, description: 'Estimated VAT-exclusive deal value' })
  @IsOptional()
  @Type(() => Number)
  estimatedValue?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ description: 'User who owns the created deal' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}
