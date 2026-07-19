import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEmail,
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

  @ApiProperty({
    example: 'SITE_CLERK',
    description: 'Role code; validated at runtime against the settings lookup catalog.',
  })
  @IsString()
  role!: string;
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
