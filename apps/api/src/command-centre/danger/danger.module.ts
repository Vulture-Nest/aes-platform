import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { FinancialModule } from '../../financial/financial.module';
import { AlertService } from './alert.service';
import { AlertsController } from './alerts.controller';
import { DangerEngineController } from './danger-engine.controller';
import { DangerEngineService } from './danger-engine.service';
import { DangerRulesController } from './danger-rules.controller';
import { DangerRulesService } from './danger-rules.service';

/**
 * Command Centre — Danger Engine (spec §14.2 / Prompt 7).
 *
 * Imports FinancialModule for the pure Appendix A services (LoanInterestService).
 * Prisma, Audit, Notifications and Ledger are global. Default rules are seeded
 * idempotently on bootstrap so a fresh environment has the standard rule set.
 *
 * NOTE: evaluate() is not on a real cron here (@nestjs/schedule may be absent).
 * Wire a scheduled trigger to DangerEngineService.evaluate() when scheduling lands.
 */
@Module({
  imports: [FinancialModule],
  controllers: [AlertsController, DangerRulesController, DangerEngineController],
  providers: [AlertService, DangerRulesService, DangerEngineService],
  exports: [AlertService, DangerEngineService, DangerRulesService],
})
export class DangerModule implements OnModuleInit {
  private readonly logger = new Logger(DangerModule.name);

  constructor(private readonly rules: DangerRulesService) {}

  async onModuleInit(): Promise<void> {
    const { created } = await this.rules.seedDefaults();
    if (created.length > 0) {
      this.logger.log(`Seeded ${created.length} default danger rule(s): ${created.join(', ')}`);
    }
  }
}
