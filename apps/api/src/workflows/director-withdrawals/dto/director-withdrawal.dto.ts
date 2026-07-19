import { ApiProperty } from '@nestjs/swagger';
import { Currency } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsPositive, IsString, MinLength } from 'class-validator';

/** Raise a director withdrawal (starts in DRAFT). Co-approval by a SECOND director follows. */
export class CreateDirectorWithdrawalDto {
  @ApiProperty({ example: 2500, description: 'Amount to withdraw (in the given currency)' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ enum: Currency })
  @IsEnum(Currency)
  currency!: Currency;

  @ApiProperty({
    example: 'CBZ ***4471',
    description: 'Free-text description of the destination account the funds go to',
  })
  @IsString()
  @MinLength(1)
  destinationAccount!: string;

  @ApiProperty({ example: 'Director quarterly drawing', description: 'Reason for the withdrawal' })
  @IsString()
  @MinLength(1)
  reason!: string;
}

/** Record the human-performed transfer that completes a posted withdrawal. */
export class CompleteDirectorWithdrawalDto {
  @ApiProperty({ example: 'EFT', description: 'How the transfer was performed (EFT, RTGS, cash…)' })
  @IsString()
  @MinLength(1)
  transferMethod!: string;

  @ApiProperty({ example: 'EFT-99182', description: 'Bank/transfer reference of the payment' })
  @IsString()
  @MinLength(1)
  transferReference!: string;
}
