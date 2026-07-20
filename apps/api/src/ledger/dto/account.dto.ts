import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({ example: 'Bank USD' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ example: 'BANK', description: 'Configured account_type lookup code' })
  @IsString()
  type!: string;

  @ApiProperty()
  @IsString()
  currency!: string;

  @ApiPropertyOptional({ description: 'Site this account belongs to (e.g. per-site petty cash)' })
  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class UpdateAccountDto extends PartialType(CreateAccountDto) {}
