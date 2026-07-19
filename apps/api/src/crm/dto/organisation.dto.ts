import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateOrganisationDto {
  @ApiProperty({ example: 'Mimosa Mining Company' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({ description: 'Soft link to an existing billed client' })
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @ApiPropertyOptional({ example: 'Mining' })
  @IsOptional()
  @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: 'Referral' })
  @IsOptional()
  @IsString()
  source?: string;

  @ApiPropertyOptional({ description: 'User who owns this relationship' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateOrganisationDto extends PartialType(CreateOrganisationDto) {}

export class ListOrganisationsQueryDto {
  @ApiPropertyOptional({ description: 'Filter to organisations linked to a client' })
  @IsOptional()
  @IsUUID()
  clientId?: string;
}
