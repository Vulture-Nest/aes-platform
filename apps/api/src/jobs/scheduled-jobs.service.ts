import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApprovalService } from '../approvals/approval.service';
import { AlertService } from '../command-centre/danger/alert.service';
import { DangerEngineService } from '../command-centre/danger/danger-engine.service';
import { ComplianceService } from '../compliance/compliance.service';
import { AppConfig } from '../config/configuration';
import { LoanInterestAccrualService } from '../financial/domain/loan-interest-accrual.service';
import { OrderHealthRecalcService } from '../financial/domain/order-health-recalc.service';
import { ZimraInterestAccrualService } from '../financial/domain/zimra-interest-accrual.service';
import { DirectorWithdrawalsService } from '../workflows/director-withdrawals/director-withdrawals.service';
import { RequisitionsService } from '../workflows/requisitions/requisitions.service';
import { TravelService } from '../workflows/travel/travel.service';

const TZ = 'Africa/Harare';

/**
 * In-process cron jobs. The domain logic already exists as callable methods on the
 * feature services; this just triggers them on a schedule. Every handler is a no-op
 * when SCHEDULER_ENABLED=false (tests/CI, or non-leader instances), and any failure
 * is logged rather than allowed to crash the scheduler.
 */
@Injectable()
export class ScheduledJobsService {
  private readonly logger = new Logger('Scheduler');

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly danger: DangerEngineService,
    private readonly alerts: AlertService,
    private readonly requisitions: RequisitionsService,
    private readonly travel: TravelService,
    private readonly approvals: ApprovalService,
    private readonly compliance: ComplianceService,
    private readonly loanInterestAccrual: LoanInterestAccrualService,
    private readonly zimraInterestAccrual: ZimraInterestAccrualService,
    private readonly orderHealthRecalc: OrderHealthRecalcService,
    private readonly directorWithdrawals: DirectorWithdrawalsService,
  ) {}

  private get enabled(): boolean {
    return this.config.get('scheduler', { infer: true }).enabled;
  }

  private async run(name: string, fn: () => Promise<unknown>): Promise<void> {
    if (!this.enabled) {
      return;
    }
    try {
      const result = await fn();
      this.logger.log(`${name}: ${JSON.stringify(result)}`);
    } catch (e) {
      this.logger.error(`${name} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Danger engine. Cash rules want frequent evaluation, the rest at least daily —
   * running the whole evaluation hourly satisfies both, and AlertService.raiseOrRefresh
   * de-dupes active alerts so an unchanged condition never re-notifies.
   */
  @Cron(CronExpression.EVERY_HOUR, { name: 'danger-eval' })
  dangerEvaluation(): Promise<void> {
    return this.run('danger.evaluate', () => this.danger.evaluate());
  }

  /**
   * Repeat-until-acknowledged: re-ping the directors about every still-active DANGER
   * alert every 4 hours until someone acknowledges it (or the condition resolves).
   */
  @Cron('0 */4 * * *', { name: 'danger-alert-repeat', timeZone: TZ })
  dangerAlertRepeat(): Promise<void> {
    return this.run('alerts.reNotifyUnacknowledged', () => this.alerts.reNotifyUnacknowledged());
  }

  /** Re-test approved-pending-funds items: promote now-funded ones, escalate near-deadline ones. */
  @Cron('0 6 * * *', { name: 'pending-funds-retest', timeZone: TZ })
  pendingFundsReTest(): Promise<void> {
    return this.run('pendingFunds.reTest', async () => ({
      requisitions: await this.requisitions.reTestPendingFunds(),
      travel: await this.travel.reTestPendingFunds(),
    }));
  }

  /** Remind on travel advances that were disbursed but not yet retired. */
  @Cron('0 7 * * *', { name: 'travel-unretired', timeZone: TZ })
  travelUnretiredReminders(): Promise<void> {
    return this.run('travel.remindUnretired', () => this.travel.remindUnretired());
  }

  /** Approval SLA sweep: remind approvers past T1, escalate to directors past T2. */
  @Cron(CronExpression.EVERY_HOUR, { name: 'approval-sla' })
  approvalSlaTimers(): Promise<void> {
    const sched = this.config.get('scheduler', { infer: true });
    return this.run('approvals.slaTimers', () =>
      this.approvals.runSlaTimers(new Date(), sched.approvalT1Hours, sched.approvalT2Hours),
    );
  }

  /**
   * Statutory compliance calendar: raise DANGER on overdue remittances and WATCH on anything
   * due within a week. Runs each morning; DANGER alerts inherit the repeat-until-ack treatment.
   */
  @Cron('0 8 * * *', { name: 'compliance-due', timeZone: TZ })
  complianceDueCheck(): Promise<void> {
    return this.run('compliance.checkDueAndOverdue', () =>
      this.compliance.checkDueAndOverdue(new Date()),
    );
  }

  /**
   * G9a — nightly loan interest accrual. Writes one idempotent per-day LoanInterest row
   * per active loan up to yesterday; re-runs never double-accrue (unique loan+date +
   * skipDuplicates). Balance/total-due stay derived on read.
   */
  @Cron('0 1 * * *', { name: 'loan-interest-accrual', timeZone: TZ })
  runLoanInterestAccrual(): Promise<void> {
    return this.run('loanInterest.accrueAll', () => this.loanInterestAccrual.accrueAll(new Date()));
  }

  /**
   * G9b — nightly ZIMRA/other-tax overdue-interest accrual. Refreshes the persisted
   * accruedInterest snapshot on each debt (A.5/A.6) so it isn't only computed on-read;
   * the refresh is idempotent (each run overwrites with the value for today).
   */
  @Cron('0 1 * * *', { name: 'zimra-interest-accrual', timeZone: TZ })
  runZimraInterestAccrual(): Promise<void> {
    return this.run('zimraInterest.accrueAll', () =>
      this.zimraInterestAccrual.accrueAll(new Date()),
    );
  }

  /**
   * G9c — nightly order-health recalc. Recomputes each open order's health, persists it,
   * and raises a WATCH alert the first time an order transitions from a non-red state into
   * a red one (OVERDUE_PAYMENT / OVERDUE_SERVICE). No duplicate alert if already red.
   */
  @Cron('0 2 * * *', { name: 'order-health-recalc', timeZone: TZ })
  runOrderHealthRecalc(): Promise<void> {
    return this.run('orderHealth.recalcAll', () => this.orderHealthRecalc.recalcAll(new Date()));
  }

  /**
   * G10 — daily director-withdrawal stale-posted nudge. Reminds directors of every
   * POSTED_AWAITING_TRANSFER withdrawal whose human transfer is still unrecorded past
   * the stale window. Mirrors the travel-unretired wiring.
   */
  @Cron('0 7 * * *', { name: 'director-withdrawal-nudge', timeZone: TZ })
  directorWithdrawalNudge(): Promise<void> {
    return this.run('directorWithdrawals.nudgeStalePosted', () =>
      this.directorWithdrawals.nudgeStalePosted(new Date()),
    );
  }
}
