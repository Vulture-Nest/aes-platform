import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsUUID } from 'class-validator';

export class CreateDelegationDto {
  @ApiProperty({ description: 'The approver being substituted' })
  @IsUUID()
  approverUserId!: string;

  @ApiProperty({ description: 'The alternate who acts in their place' })
  @IsUUID()
  delegateUserId!: string;

  @ApiProperty({ example: '2025-03-01' })
  @Type(() => Date)
  @IsDate()
  dateFrom!: Date;

  @ApiProperty({ example: '2025-03-14' })
  @Type(() => Date)
  @IsDate()
  dateTo!: Date;
}
