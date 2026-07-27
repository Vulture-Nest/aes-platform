import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Matches,
  MinLength,
} from 'class-validator';

const PERIOD_REGEX = /^\d{4}-\d{2}$/;

export class ReturnsHubQueryDto {
  @ApiProperty({ example: '2026-07', description: 'Period in YYYY-MM' })
  @Matches(PERIOD_REGEX, { message: 'period must be YYYY-MM' })
  period!: string;

  @ApiPropertyOptional({ description: 'Filter to a single entity' })
  @IsOptional()
  @IsUUID()
  entityId?: string;
}

export class PostFromPayrollDto {
  @ApiProperty({ example: '2026-07', description: 'Payroll period in YYYY-MM' })
  @Matches(PERIOD_REGEX, { message: 'period must be YYYY-MM' })
  period!: string;

  @ApiPropertyOptional({ description: 'Restrict to a single site' })
  @IsOptional()
  @IsUUID()
  siteId?: string;
}

export class PostVatDto {
  @ApiProperty({ example: '2026-07', description: 'Period in YYYY-MM' })
  @Matches(PERIOD_REGEX, { message: 'period must be YYYY-MM' })
  period!: string;
}

export class RemitDto {
  @ApiProperty({ example: '2026-07-15T00:00:00.000Z' })
  @IsISO8601()
  paidAt!: string;

  @ApiProperty({ example: 1200.5 })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @MinLength(2)
  currency!: string;

  @ApiPropertyOptional({ example: 'ZIMRA-REF-0001' })
  @IsOptional()
  @IsString()
  reference?: string;

  @ApiPropertyOptional({ description: 'Object storage key of the proof of payment' })
  @IsOptional()
  @IsString()
  proofAttachmentKey?: string;
}

export class SummaryQueryDto {
  @ApiProperty({ example: '2026-07', description: 'Anchor period in YYYY-MM (YTD ends here)' })
  @Matches(PERIOD_REGEX, { message: 'period must be YYYY-MM' })
  period!: string;

  @ApiPropertyOptional({ description: 'Filter to a single entity' })
  @IsOptional()
  @IsUUID()
  entityId?: string;
}

// ---------------------------------------------------------------------------
// WHT rate CRUD
// ---------------------------------------------------------------------------

export class CreateWhtRateDto {
  @ApiPropertyOptional({ example: 'ZW', default: 'ZW' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ example: 'CONTRACTS', description: 'WHT category, e.g. CONTRACTS, ROYALTIES' })
  @IsString()
  @MinLength(2)
  category!: string;

  @ApiProperty({ example: 0.1, description: 'Fractional rate (0.10 = 10%)' })
  @IsNumber()
  rate!: number;

  @ApiPropertyOptional({ example: 1000, description: 'Minimum tax base before WHT applies' })
  @IsOptional()
  @IsNumber()
  thresholdAmount?: number;

  @ApiProperty({ example: '2026-01-01T00:00:00.000Z' })
  @IsISO8601()
  effectiveFrom!: string;
}

export class UpdateWhtRateDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  rate?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  thresholdAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsISO8601()
  effectiveFrom?: string;
}

export class ListWhtRatesQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  category?: string;
}

// ---------------------------------------------------------------------------
// WHT transactions
// ---------------------------------------------------------------------------

export class WhtPayableDto {
  @ApiProperty({ example: 'Acme Suppliers Ltd' })
  @IsString()
  @MinLength(1)
  counterparty!: string;

  @ApiProperty({ example: 5000, description: 'Gross taxable payment base' })
  @IsNumber()
  @IsPositive()
  taxBase!: number;

  @ApiProperty({ example: 'CONTRACTS' })
  @IsString()
  @MinLength(2)
  category!: string;

  @ApiProperty({ example: false, description: 'Whether the supplier holds a valid tax clearance' })
  @IsBoolean()
  supplierTaxClearanceHeld!: boolean;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @MinLength(2)
  currency!: string;

  @ApiPropertyOptional({ example: 'PMT-2026-0001' })
  @IsOptional()
  @IsString()
  relatedPaymentRef?: string;

  @ApiPropertyOptional({ example: 'ZW', default: 'ZW' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ description: 'Payment date used to resolve rate + deadline' })
  @IsOptional()
  @IsISO8601()
  paymentDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string;
}

export class WhtSufferedDto {
  @ApiProperty({ example: 'Big Mine Co' })
  @IsString()
  @MinLength(1)
  counterparty!: string;

  @ApiProperty({ example: 800, description: 'WHT amount withheld from us' })
  @IsNumber()
  @IsPositive()
  amount!: number;

  @ApiProperty({ example: 'USD' })
  @IsString()
  @MinLength(2)
  currency!: string;

  @ApiPropertyOptional({ example: 'CERT-2026-0007' })
  @IsOptional()
  @IsString()
  certificateRef?: string;

  @ApiProperty({ example: '2026-07', description: 'Tax period in YYYY-MM' })
  @Matches(PERIOD_REGEX, { message: 'taxPeriod must be YYYY-MM' })
  taxPeriod!: string;

  @ApiPropertyOptional({ description: 'Whether the WHT certificate has been received' })
  @IsOptional()
  @IsBoolean()
  certificateReceived?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string;
}

export class WhtCreditsQueryDto {
  @ApiPropertyOptional({ example: '2026-07', description: 'Filter to one tax period YYYY-MM' })
  @IsOptional()
  @Matches(PERIOD_REGEX, { message: 'taxPeriod must be YYYY-MM' })
  taxPeriod?: string;

  @ApiPropertyOptional({ description: 'Only include credits without a received certificate' })
  @IsOptional()
  @IsIn(['true', 'false'])
  pendingCertificateOnly?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  entityId?: string;
}
