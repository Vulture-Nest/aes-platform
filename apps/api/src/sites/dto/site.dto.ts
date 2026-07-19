import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { SiteType } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateSiteDto {
  @ApiProperty({ example: 'Mimosa' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ enum: SiteType })
  @IsEnum(SiteType)
  type!: SiteType;

  @ApiPropertyOptional({ description: 'Client this site maps to (mine sites).' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}

export class UpdateSiteDto extends PartialType(CreateSiteDto) {}
