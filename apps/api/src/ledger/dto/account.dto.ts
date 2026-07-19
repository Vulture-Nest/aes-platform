import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { AccountType } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class CreateAccountDto {
  @ApiProperty({ example: 'Bank USD' })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ enum: AccountType })
  @IsEnum(AccountType)
  type!: AccountType;

  @ApiProperty()
  @IsString()
  currency!: string;

  @ApiPropertyOptional({ description: 'Site this account belongs to (e.g. per-site petty cash)' })
  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class UpdateAccountDto extends PartialType(CreateAccountDto) {}
