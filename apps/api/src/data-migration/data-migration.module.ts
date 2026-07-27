import { Module } from '@nestjs/common';
import { FinancialModule } from '../financial/financial.module';
import { ReferenceModule } from '../reference/reference.module';
import { HealthVerdictPanelService } from '../command-centre/panels/health-verdict.service';
import { PerformancePanelService } from '../command-centre/panels/performance-panel.service';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { ParityService } from './parity.service';

/**
 * Workbook importer / migration-parity module (spec Appendix A.10). Parses the
 * operational workbooks shipped in `docs/` into the existing financial + HR tables,
 * then rehearses migration parity by recomputing the FinancialSummary figures through
 * the SAME Command Centre panels the executive dashboard uses.
 *
 * PrismaService is global. FinancialModule (Appendix A domain services) and
 * ReferenceModule (FX rates) are imported so the two Command Centre panel services —
 * declared here as local providers for the parity check — can resolve their deps.
 */
@Module({
  imports: [FinancialModule, ReferenceModule],
  controllers: [ImportController],
  providers: [ImportService, ParityService, HealthVerdictPanelService, PerformancePanelService],
  exports: [ImportService, ParityService],
})
export class DataMigrationModule {}
