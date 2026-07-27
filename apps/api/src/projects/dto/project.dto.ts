import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { ProjectNodeType } from '@prisma/client';

const NODE_TYPES: ProjectNodeType[] = ['PHASE', 'TASK', 'SUBTASK'];

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------
export class CreateProjectDto {
  @ApiProperty({ example: 'Unki Tailings Dam Wall Raise' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Site this project belongs to (RLS scope)' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @ApiPropertyOptional({ example: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  plannedStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  plannedFinish?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualFinish?: string;
}

export class UpdateProjectDto extends PartialType(CreateProjectDto) {}

export class ListProjectsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by site' })
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional({ description: 'Filter by status' })
  @IsOptional()
  @IsString()
  status?: string;
}

// ---------------------------------------------------------------------------
// Node
// ---------------------------------------------------------------------------
export class CreateNodeDto {
  @ApiProperty({ enum: NODE_TYPES })
  @IsIn(NODE_TYPES)
  type!: ProjectNodeType;

  @ApiProperty({ example: 'Excavation' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional({ description: 'Parent node (null for a top-level phase)' })
  @IsOptional()
  @IsUUID()
  parentId?: string;

  @ApiPropertyOptional({ description: 'Relative weight amongst siblings', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  weight?: number;

  @ApiPropertyOptional({ description: 'Ordering position amongst siblings' })
  @IsOptional()
  @IsInt()
  position?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  plannedStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  plannedFinish?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualStart?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  actualFinish?: string;
}

export class UpdateNodeDto extends PartialType(CreateNodeDto) {}

export class ReorderNodesDto {
  @ApiProperty({ type: [String], description: 'Node ids in the desired order' })
  @IsUUID('4', { each: true })
  nodeIds!: string[];
}

// ---------------------------------------------------------------------------
// Tenant progress update (mobile-light)
// ---------------------------------------------------------------------------
export class UpdateProgressDto {
  @ApiPropertyOptional({ description: 'Percent complete (0-100)' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  percentComplete?: number;

  @ApiPropertyOptional({ description: 'Optional progress note (timestamped + attributed)' })
  @IsOptional()
  @IsString()
  note?: string;

  @ApiPropertyOptional({ description: 'Mark node complete (forces 100%)' })
  @IsOptional()
  complete?: boolean;
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------
export class CreateDependencyDto {
  @ApiProperty()
  @IsUUID()
  predecessorNodeId!: string;

  @ApiProperty()
  @IsUUID()
  successorNodeId!: string;

  @ApiPropertyOptional({ example: 'FS', default: 'FS' })
  @IsOptional()
  @IsString()
  depType?: string;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
export class CreateTemplateDto {
  @ApiProperty({ example: 'Standard Civil Works' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ example: 'CIVIL' })
  @IsOptional()
  @IsString()
  jobType?: string;

  @ApiProperty({
    description:
      'Nested WBS structure: array of { title, type, weight?, children?[] }. Explodes into nodes.',
  })
  structure!: unknown;
}

export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}

export class FromTemplateDto {
  @ApiProperty({ example: 'New Project from template' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  siteId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  contractId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  orderId?: string;
}
