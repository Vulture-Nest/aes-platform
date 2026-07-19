import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';

/** Create a travel allowance request (starts in DRAFT). The per-diem and advance are */
/** resolved server-side from the travel_rates table, not supplied by the client. */
export class CreateTravelDto {
  @ApiProperty({ example: 'Bulawayo depot audit' })
  @IsString()
  @MinLength(1)
  destination!: string;

  @ApiPropertyOptional({
    example: 'A',
    description: 'Destination class band that keys the per-diem rate table',
  })
  @IsOptional()
  @IsString()
  destinationClass?: string;

  @ApiProperty({ example: '2026-08-01' })
  @Type(() => Date)
  @IsDate()
  dateFrom!: Date;

  @ApiProperty({ example: '2026-08-05' })
  @Type(() => Date)
  @IsDate()
  dateTo!: Date;

  @ApiPropertyOptional({
    example: 'M3',
    description: 'Traveller grade band that keys the per-diem rate table',
  })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiProperty({ example: 5, description: 'Number of chargeable days' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  days!: number;

  @ApiProperty()
  @IsString()
  currency!: string;

  @ApiPropertyOptional({ description: 'Site this trip is raised for' })
  @IsOptional()
  @IsUUID()
  siteId?: string;
}

/** Record a human-performed disbursement of a travel advance. */
export class DisburseTravelDto {
  @ApiProperty({ description: 'Source account the advance was paid from' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ example: 'EFT-77120', description: 'Bank/transfer reference of the payment' })
  @IsString()
  @MinLength(1)
  reference!: string;
}

/** Retire a disbursed travel advance: reconcile spend against the advance. */
export class RetireTravelDto {
  @ApiProperty({ description: 'Storage key of the receipts pack supporting the retirement' })
  @IsString()
  @MinLength(1)
  receiptsKey!: string;

  @ApiProperty({
    example: 120,
    description: 'Unspent portion of the advance returned by the traveller (in trip currency)',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  unspent!: number;
}
