import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { BoardVisibility } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

export class CreateBoardDto {
  @ApiProperty({ example: 'Q3 Growth Plan' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: BoardVisibility, default: BoardVisibility.TEAM })
  @IsOptional()
  @IsEnum(BoardVisibility)
  visibility?: BoardVisibility;

  @ApiPropertyOptional({ description: 'Entity the board belongs to' })
  @IsOptional()
  @IsUUID()
  entityId?: string;

  @ApiPropertyOptional({ description: 'Project the board is linked to' })
  @IsOptional()
  @IsUUID()
  projectId?: string;

  @ApiPropertyOptional({ description: 'Owning user' })
  @IsOptional()
  @IsUUID()
  ownerUserId?: string;
}

export class UpdateBoardDto extends PartialType(CreateBoardDto) {}

export class ReclassifyBoardDto {
  @ApiProperty({ enum: BoardVisibility })
  @IsEnum(BoardVisibility)
  visibility!: BoardVisibility;
}

// ---------------------------------------------------------------------------
// Board members
// ---------------------------------------------------------------------------

export class AddBoardMemberDto {
  @ApiProperty()
  @IsUUID()
  userId!: string;

  @ApiPropertyOptional({ example: 'EDITOR' })
  @IsOptional()
  @IsString()
  role?: string;
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

export class CreateListDto {
  @ApiProperty({ example: 'To Do' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  position?: number;
}

export class UpdateListDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  position?: number;
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

export class CreateCardDto {
  @ApiProperty({ example: 'Draft the proposal' })
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  position?: number;

  @ApiPropertyOptional({ description: 'Assigned user' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class UpdateCardDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Assigned user (null-able via omission)' })
  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @ApiPropertyOptional({ format: 'date-time' })
  @IsOptional()
  @IsDateString()
  dueDate?: string;
}

export class MoveCardDto {
  @ApiProperty({ description: 'Destination list' })
  @IsUUID()
  listId!: string;

  @ApiProperty({ description: 'Zero-based position within the destination list' })
  @IsInt()
  position!: number;
}

// ---------------------------------------------------------------------------
// Checklist items
// ---------------------------------------------------------------------------

export class AddChecklistItemDto {
  @ApiProperty({ example: 'Send to legal' })
  @IsString()
  @MinLength(1)
  text!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  position?: number;
}

export class ToggleChecklistItemDto {
  @ApiProperty()
  @IsBoolean()
  done!: boolean;
}

// ---------------------------------------------------------------------------
// Comments
// ---------------------------------------------------------------------------

export class AddCommentDto {
  @ApiProperty({ example: 'Looks good, ship it.' })
  @IsString()
  @MinLength(1)
  body!: string;
}
