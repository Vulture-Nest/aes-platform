import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';

export class CreatePpeRequirementDto {
  @ApiPropertyOptional({ description: 'Role this requirement applies to (role- or employee-scoped)' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ description: 'Employee this requirement applies to' })
  @IsOptional()
  @IsUUID()
  employeeId?: string;

  @ApiProperty({ example: 'HARD_HAT' })
  @IsString()
  itemType!: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  quantity?: number;

  @ApiPropertyOptional({ example: 12, description: 'Lifespan in months (drives replacement-due)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  lifespanMonths?: number;
}

export class UpdatePpeRequirementDto extends PartialType(CreatePpeRequirementDto) {}

export class CreatePpeIssueDto {
  @ApiProperty({ description: 'Employee the PPE was issued to' })
  @IsUUID()
  employeeId!: string;

  @ApiProperty({ example: 'HARD_HAT' })
  @IsString()
  itemType!: string;

  @ApiProperty({ description: 'Date of issue (ISO date-time)' })
  @IsDateString()
  issueDate!: string;

  @ApiPropertyOptional({ example: 'L' })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiPropertyOptional({ description: 'Replacement-due date (ISO); computed from lifespan when omitted' })
  @IsOptional()
  @IsDateString()
  replacementDue?: string;

  @ApiPropertyOptional({ example: 'GOOD' })
  @IsOptional()
  @IsString()
  condition?: string;
}

export class UpdatePpeIssueDto extends PartialType(CreatePpeIssueDto) {}

export class ListPpeRequirementsQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class ListPpeIssuesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  employeeId?: string;
}

export class PpeComplianceQueryDto {
  @ApiPropertyOptional({ description: 'Restrict to a site (via that site\'s employees)' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ description: 'Days ahead within which a replacement counts as expiring', default: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  expiringWithinDays?: number;
}
