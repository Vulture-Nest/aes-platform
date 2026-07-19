import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateContactDto {
  @ApiProperty({ description: 'Organisation this contact belongs to' })
  @IsUUID()
  organisationId!: string;

  @ApiProperty({ example: 'Tendai' })
  @IsString()
  @MinLength(1)
  firstName!: string;

  @ApiProperty({ example: 'Mutize' })
  @IsString()
  @MinLength(1)
  lastName!: string;

  @ApiPropertyOptional({ example: 'tendai@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: '+263771234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'Procurement Manager' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ description: 'User who owns this contact' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}

export class UpdateContactDto extends PartialType(CreateContactDto) {}

export class ListContactsQueryDto {
  @ApiPropertyOptional({ description: 'Filter to a single organisation' })
  @IsOptional()
  @IsUUID()
  organisationId?: string;
}
