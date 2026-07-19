import { Controller, Get, Logger } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Roles } from '../rbac/roles.decorator';
import { CashPositionService } from './panels/cash-position.service';
import { CoverageService } from './panels/coverage.service';
import { DebtInterestWatchService } from './panels/debt-interest-watch.service';
import { HealthVerdictPanelService } from './panels/health-verdict.service';
import { MoneyInOutService } from './panels/money-in-out.service';
import { PendingObligationsService } from './panels/pending-obligations.service';
import { ReceivablesAgeingService } from './panels/receivables-ageing.service';
import { TaxExposureService } from './panels/tax-exposure.service';

interface PanelErrorStub {
  error: true;
  panel: string;
  message: string;
}

/**
 * Command Centre (spec §14 / Prompt 8). Read-only executive dashboard: a composite
 * endpoint aggregating all 8 panels plus one endpoint per panel. Restricted to
 * finance/ops leadership and SYS_ADMIN.
 */
@ApiTags('command-centre')
@ApiBearerAuth()
@Roles('FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN')
@Controller({ path: 'command-centre', version: '1' })
export class CommandCentreController {
  private readonly logger = new Logger(CommandCentreController.name);

  constructor(
    private readonly cashPosition: CashPositionService,
    private readonly moneyInOut: MoneyInOutService,
    private readonly debtInterest: DebtInterestWatchService,
    private readonly coverage: CoverageService,
    private readonly receivablesAgeing: ReceivablesAgeingService,
    private readonly taxExposure: TaxExposureService,
    private readonly pendingObligations: PendingObligationsService,
    private readonly healthVerdict: HealthVerdictPanelService,
  ) {}

  /**
   * Runs a single panel and converts any failure into an inline error stub so
   * one broken panel never fails the whole composite dashboard.
   */
  private async safe<T>(panel: string, fn: () => Promise<T>): Promise<T | PanelErrorStub> {
    try {
      return await fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Command Centre panel "${panel}" failed: ${message}`);
      return { error: true, panel, message };
    }
  }

  @Get()
  @ApiOperation({ summary: 'Composite Command Centre dashboard (all 8 panels)' })
  async overview() {
    const [
      cashPosition,
      moneyInOut,
      debtInterest,
      coverage,
      receivablesAgeing,
      taxExposure,
      pendingObligations,
      healthVerdict,
    ] = await Promise.all([
      this.safe('cashPosition', () => this.cashPosition.compute()),
      this.safe('moneyInOut', () => this.moneyInOut.compute()),
      this.safe('debtInterest', () => this.debtInterest.compute()),
      this.safe('coverage', () => this.coverage.compute()),
      this.safe('receivablesAgeing', () => this.receivablesAgeing.compute()),
      this.safe('taxExposure', () => this.taxExposure.compute()),
      this.safe('pendingObligations', () => this.pendingObligations.compute()),
      this.safe('healthVerdict', () => this.healthVerdict.compute()),
    ]);

    return {
      cashPosition,
      moneyInOut,
      debtInterest,
      coverage,
      receivablesAgeing,
      taxExposure,
      pendingObligations,
      healthVerdict,
    };
  }

  @Get('cash-position')
  @ApiOperation({ summary: 'Cash position panel' })
  cashPositionPanel() {
    return this.cashPosition.compute();
  }

  @Get('money-in-out')
  @ApiOperation({ summary: 'Money in / out panel' })
  moneyInOutPanel() {
    return this.moneyInOut.compute();
  }

  @Get('debt-interest-watch')
  @ApiOperation({ summary: 'Debt & interest watch panel' })
  debtInterestWatchPanel() {
    return this.debtInterest.compute();
  }

  @Get('coverage')
  @ApiOperation({ summary: 'Coverage panel' })
  coveragePanel() {
    return this.coverage.compute();
  }

  @Get('receivables-ageing')
  @ApiOperation({ summary: 'Receivables ageing panel' })
  receivablesAgeingPanel() {
    return this.receivablesAgeing.compute();
  }

  @Get('tax-exposure')
  @ApiOperation({ summary: 'Tax exposure panel' })
  taxExposurePanel() {
    return this.taxExposure.compute();
  }

  @Get('pending-obligations')
  @ApiOperation({ summary: 'Pending obligations panel' })
  pendingObligationsPanel() {
    return this.pendingObligations.compute();
  }

  @Get('health-verdict')
  @ApiOperation({ summary: 'Health verdict panel' })
  healthVerdictPanel() {
    return this.healthVerdict.compute();
  }
}
