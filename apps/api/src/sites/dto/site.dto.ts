import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateSiteDto {
  @ApiProperty({ example: 'Mimosa' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({
    example: 'MINE_SITE',
    description: 'Validated against the site_type lookup catalog.',
  })
  @IsString()
  type!: string;

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
