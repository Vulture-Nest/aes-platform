import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../rbac/roles.decorator';
import { ImportWorkbookDto } from './dto/import.dto';
import { ImportService } from './import.service';
import { ParityService } from './parity.service';

/**
 * Workbook importer / migration-parity endpoints (spec Appendix A.10). Restricted to
 * SYS_ADMIN + FINANCE_DIRECTOR — this is a privileged data-migration operation.
 */
@ApiTags('data-migration')
@ApiBearerAuth()
@Controller({ path: 'import', version: '1' })
export class ImportController {
  constructor(
    private readonly importer: ImportService,
    private readonly parity: ParityService,
  ) {}

  @Post('workbook')
  @Roles('SYS_ADMIN', 'FINANCE_DIRECTOR')
  @ApiOperation({
    summary: 'Import the operational workbooks from docs/ into the live tables',
    description:
      'Idempotent upsert of the cashflow (P1), payroll (P2) and manhours (P3) workbooks. ' +
      'Returns per-table created/updated counts. Payroll/manhours are best-effort.',
  })
  async importWorkbook(@Body() dto: ImportWorkbookDto, @CurrentUser('id') actorId: string) {
    return this.importer.run(dto.which ?? 'all', actorId ?? null);
  }

  @Get('parity')
  @Roles('SYS_ADMIN', 'FINANCE_DIRECTOR')
  @ApiOperation({
    summary: 'Migration-parity rehearsal (Appendix A.10)',
    description:
      'Recomputes the FinancialSummary figures via the same Command Centre panels the ' +
      'dashboard uses and asserts they match the expected workbook values within $1.',
  })
  async parityCheck() {
    return this.parity.check();
  }
}
