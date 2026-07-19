import { Module } from '@nestjs/common';
import { FinancialModule } from '../financial/financial.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ReferenceModule } from '../reference/reference.module';
import { DangerModule } from './danger/danger.module';
import { CommandCentreController } from './command-centre.controller';
import { CashPositionService } from './panels/cash-position.service';
import { CoverageService } from './panels/coverage.service';
import { DebtInterestWatchService } from './panels/debt-interest-watch.service';
import { HealthVerdictPanelService } from './panels/health-verdict.service';
import { MoneyInOutService } from './panels/money-in-out.service';
import { PendingObligationsService } from './panels/pending-obligations.service';
import { ReceivablesAgeingService } from './panels/receivables-ageing.service';
import { TaxExposureService } from './panels/tax-exposure.service';

/**
 * Command Centre (spec §14 / Prompt 8). Assembles the 8 read-only executive
 * panels plus the Danger Engine (re-exported via DangerModule).
 *
 * PrismaModule, LedgerModule and the notification/audit services are global;
 * FinancialModule (Appendix A domain services) and ReferenceModule (FX rates,
 * thresholds, statutory rates) are imported explicitly for the panel injections.
 */
@Module({
  imports: [DangerModule, LedgerModule, FinancialModule, ReferenceModule],
  controllers: [CommandCentreController],
  providers: [
    CashPositionService,
    MoneyInOutService,
    DebtInterestWatchService,
    CoverageService,
    ReceivablesAgeingService,
    TaxExposureService,
    PendingObligationsService,
    HealthVerdictPanelService,
  ],
})
export class CommandCentreModule {}
