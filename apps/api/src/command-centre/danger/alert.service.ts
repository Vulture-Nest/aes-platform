import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Alert, AlertSeverity, NotificationSeverity, Prisma, Role } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { NotificationService } from '../../notifications/notification.service';
import { PrismaService } from '../../prisma/prisma.service';

/** Inputs for raising or refreshing an alert. */
export interface RaiseOrRefreshParams {
  ruleKey: string;
  severity: AlertSeverity;
  subjectTable?: string;
  subjectId?: string;
  message: string;
  payload?: Record<string, unknown>;
}

/** Filters for listing alerts. */
export interface ListAlertsParams {
  activeOnly?: boolean;
  severity?: AlertSeverity;
}

/** Map an alert severity onto the notification severity ladder (same names). */
function toNotificationSeverity(severity: AlertSeverity): NotificationSeverity {
  return NotificationSeverity[severity];
}

/**
 * AlertService — the persistence + fan-out layer for the danger engine.
 *
 * Dedupe rule: an alert is "active" while both `resolvedAt` and `acknowledgedAt` are null.
 * raiseOrRefresh() refreshes an existing active alert for the same (ruleKey, subjectId)
 * instead of creating a duplicate; only a genuinely new alert fans out notifications.
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Raise a new alert, or refresh the existing active one for (ruleKey, subjectId).
   * Refresh updates the message/payload/severity and bumps raisedAt (no new notification).
   * A brand-new alert fans out via NotificationService.
   */
  async raiseOrRefresh(params: RaiseOrRefreshParams): Promise<Alert> {
    const existing = await this.prisma.alert.findFirst({
      where: {
        ruleKey: params.ruleKey,
        subjectId: params.subjectId ?? null,
        resolvedAt: null,
        acknowledgedAt: null,
      },
      orderBy: { raisedAt: 'desc' },
    });

    if (existing) {
      // Refresh in place — keep the same alert row, do not re-notify.
      return this.prisma.alert.update({
        where: { id: existing.id },
        data: {
          severity: params.severity,
          message: params.message,
          payload: (params.payload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          raisedAt: new Date(),
        },
      });
    }

    const alert = await this.prisma.alert.create({
      data: {
        ruleKey: params.ruleKey,
        severity: params.severity,
        subjectTable: params.subjectTable ?? null,
        subjectId: params.subjectId ?? null,
        message: params.message,
        payload: (params.payload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
      },
    });

    await this.fanOut(alert);
    return alert;
  }

  /**
   * Fan out an alert to notification recipients. In-app always (via the notification
   * severity ladder); push+email kick in from WATCH; a DANGER alert additionally notifies
   * every DIRECTOR user. Recipients are the DANGER/WATCH audience: Directors + Finance
   * Directors (and, for DANGER, all Directors regardless of prior list).
   */
  private async fanOut(alert: Alert): Promise<void> {
    const recipientRoles: Role[] = [
      Role.FINANCE_DIRECTOR,
      Role.OPS_DIRECTOR,
      Role.DIRECTOR,
      Role.SYS_ADMIN,
    ];
    const userIds = new Set(await this.userIdsWithRoles(recipientRoles));

    if (alert.severity === AlertSeverity.DANGER) {
      // DANGER -> notify all DIRECTOR users (in addition to the standard audience).
      for (const id of await this.userIdsWithRoles([Role.DIRECTOR])) {
        userIds.add(id);
      }
    }

    if (userIds.size === 0) {
      this.logger.warn(
        `Alert ${alert.id} (${alert.ruleKey}) raised with no notification recipients`,
      );
      return;
    }

    await this.notifications.send({
      userIds: [...userIds],
      template: `alert.${alert.ruleKey}`,
      severity: toNotificationSeverity(alert.severity),
      subjectTable: 'alerts',
      subjectId: alert.id,
      payload: {
        ruleKey: alert.ruleKey,
        message: alert.message,
        severity: alert.severity,
        subjectTable: alert.subjectTable,
        subjectId: alert.subjectId,
      },
    });
  }

  /** Distinct user ids holding at least one of the given roles. */
  private async userIdsWithRoles(roles: Role[]): Promise<string[]> {
    const rows = await this.prisma.userSiteRole.findMany({
      where: { role: { in: roles } },
      select: { userId: true },
      distinct: ['userId'],
    });
    return rows.map((r) => r.userId);
  }

  /** Acknowledge an alert (audited). Idempotent: acknowledging twice keeps the first ack. */
  async ack(id: string, userId: string): Promise<Alert> {
    const existing = await this.prisma.alert.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Alert not found');
    }
    const updated = await this.prisma.alert.update({
      where: { id },
      data: {
        acknowledgedByUserId: existing.acknowledgedByUserId ?? userId,
        acknowledgedAt: existing.acknowledgedAt ?? new Date(),
      },
    });
    await this.audit.record({
      actorUserId: userId,
      action: 'STATUS_CHANGE',
      tableName: 'alerts',
      recordId: id,
      before: { acknowledgedAt: existing.acknowledgedAt },
      after: { acknowledgedAt: updated.acknowledgedAt, acknowledgedByUserId: userId },
    });
    return updated;
  }

  /**
   * Resolve the active alert(s) for (ruleKey, subjectId) — used when a rule re-evaluates
   * and the underlying condition has cleared. Returns the number resolved.
   */
  async resolve(ruleKey: string, subjectId?: string): Promise<{ resolved: number }> {
    const res = await this.prisma.alert.updateMany({
      where: { ruleKey, subjectId: subjectId ?? null, resolvedAt: null },
      data: { resolvedAt: new Date() },
    });
    return { resolved: res.count };
  }

  /** List alerts, newest first. activeOnly = not acknowledged and not resolved. */
  list(params: ListAlertsParams = {}): Promise<Alert[]> {
    return this.prisma.alert.findMany({
      where: {
        ...(params.activeOnly ? { acknowledgedAt: null, resolvedAt: null } : {}),
        ...(params.severity ? { severity: params.severity } : {}),
      },
      orderBy: { raisedAt: 'desc' },
    });
  }
}
