import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InteractionType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateInteractionDto {
  @ApiPropertyOptional({ description: 'Organisation this interaction relates to' })
  @IsOptional()
  @IsUUID()
  organisationId?: string;

  @ApiPropertyOptional({ description: 'Contact this interaction relates to' })
  @IsOptional()
  @IsUUID()
  contactId?: string;

  @ApiProperty({ enum: InteractionType })
  @IsEnum(InteractionType)
  type!: InteractionType;

  @ApiProperty({ example: '2026-07-19T10:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  occurredAt!: Date;

  @ApiPropertyOptional({ example: 'Positive; requested a quotation' })
  @IsOptional()
  @IsString()
  outcome?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ListInteractionsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by organisation' })
  @IsOptional()
  @IsUUID()
  organisationId?: string;

  @ApiPropertyOptional({ description: 'Filter by contact' })
  @IsOptional()
  @IsUUID()
  contactId?: string;
}
