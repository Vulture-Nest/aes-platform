import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

/** Which workbook(s) to run through the importer. */
export type ImportWhich = 'cashflow' | 'payroll' | 'manhours' | 'all';

/**
 * Body for POST /import/workbook. The importer runs server-side against the
 * workbooks shipped in `docs/`, so the only input is which set to run. Defaults
 * to 'all' (cashflow → payroll → manhours) when omitted.
 */
export class ImportWorkbookDto {
  @ApiPropertyOptional({
    enum: ['cashflow', 'payroll', 'manhours', 'all'],
    default: 'all',
    description: 'Which workbook(s) to import. Defaults to "all".',
  })
  @IsOptional()
  @IsIn(['cashflow', 'payroll', 'manhours', 'all'])
  which?: ImportWhich;
}
