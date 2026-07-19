import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

/** Open a petty-cash float for a site + currency, entrusted to a named custodian. */
export class CreateFloatDto {
  @ApiProperty({ description: 'Site the float is held at' })
  @IsUUID()
  siteId!: string;

  @ApiProperty({ enum: Currency })
  @IsEnum(Currency)
  currency!: Currency;

  @ApiProperty({ description: 'User who holds and is accountable for the float' })
  @IsUUID()
  custodianUserId!: string;

  @ApiProperty({ example: 500, description: 'Nominal imprest amount entrusted to the custodian' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  floatAmount!: number;
}

/**
 * Draw cash out of the float (a voucher). Below the FD threshold this posts immediately after
 * a Site Manager confirm; at/above the threshold it is routed to FD approval before cash leaves.
 */
export class CreateWithdrawalDto {
  @ApiProperty({ example: 45, description: 'Cash amount to withdraw (in the float currency)' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ example: 'Fuel for site generator' })
  @IsString()
  @MinLength(1)
  purpose!: string;

  @ApiPropertyOptional({ description: 'Order this spend relates to' })
  @IsOptional()
  @IsUUID()
  orderId?: string;

  @ApiPropertyOptional({ description: 'Storage key of the receipt photo supporting the voucher' })
  @IsOptional()
  @IsString()
  receiptKey?: string;
}

/**
 * A currency conversion executed against the float: `amount` of the float currency is swapped
 * at `achievedRate` for the target currency. Recorded as two linked legs (CONVERSION_OUT of the
 * float currency + CONVERSION_IN of the target). Variance vs the official rate of the day is
 * computed server-side.
 */
export class CreateConversionDto {
  @ApiProperty({ example: 100, description: 'Amount of the float currency being converted OUT' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ enum: Currency, description: 'Currency received IN from the conversion' })
  @IsEnum(Currency)
  toCurrency!: Currency;

  @ApiProperty({
    example: 32.5,
    description: 'Rate actually achieved (units of toCurrency per 1 unit of the float currency)',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  achievedRate!: number;

  @ApiPropertyOptional({ example: 'USD/ZWG', description: 'FX pair to read the official rate for' })
  @IsOptional()
  @IsString()
  currencyPair?: string;

  @ApiPropertyOptional({ example: 'Swap USD to ZWG for local vendor' })
  @IsOptional()
  @IsString()
  purpose?: string;
}

/** Record an in-app physical cash count of the float for reconciliation. */
export class RecordCountDto {
  @ApiProperty({ example: 480, description: 'Cash physically counted in the float' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  countedAmount!: number;
}

/**
 * Imprest replenishment: top the float back up to its nominal amount. This is an approvable
 * item; on approval the disbursement moves bank -> site petty cash in the ledger.
 */
export class CreateTopUpDto {
  @ApiProperty({ example: 320, description: 'Amount to replenish into the float' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  amount!: number;

  @ApiProperty({ description: 'Bank/source account the replenishment is drawn from' })
  @IsUUID()
  sourceAccountId!: string;

  @ApiPropertyOptional({ example: 'Imprest top-up for vouchers since last replenishment' })
  @IsOptional()
  @IsString()
  purpose?: string;
}
