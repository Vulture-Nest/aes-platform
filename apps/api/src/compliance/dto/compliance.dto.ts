import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

/** Capture a statutory remittance against an obligation. */
export class RemitObligationDto {
  @ApiProperty({ example: 'ZIMRA-EFT-4471', description: 'Bank/authority remittance reference' })
  @IsString()
  @MinLength(1)
  reference!: string;
}
