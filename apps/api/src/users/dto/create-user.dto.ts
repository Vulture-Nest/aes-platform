import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class SiteRoleAssignmentDto {
  @ApiPropertyOptional({ description: 'Site scope; omit for a global role (SYS_ADMIN, AUDITOR).' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role!: Role;
}

export class CreateUserDto {
  @ApiProperty({ example: 'clerk.mimosa@aes.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ minLength: 10, description: 'Temporary password; user changes on first login.' })
  @IsString()
  @MinLength(10)
  password!: string;

  @ApiPropertyOptional({ description: 'Require MFA (auto-forced for FD/OD/Director/SysAdmin).' })
  @IsOptional()
  @IsBoolean()
  mfaRequired?: boolean;

  @ApiPropertyOptional({ type: [SiteRoleAssignmentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SiteRoleAssignmentDto)
  roles?: SiteRoleAssignmentDto[];
}
