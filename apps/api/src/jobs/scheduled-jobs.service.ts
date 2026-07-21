import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ApprovalService } from '../approvals/approval.service';
import { DangerEngineService } from '../command-centre/danger/danger-engine.service';
import { AppConfig } from '../config/configuration';
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
    private readonly requisitions: RequisitionsService,
    private readonly travel: TravelService,
    private readonly approvals: ApprovalService,
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
}
