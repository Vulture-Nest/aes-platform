import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationChannel, NotificationSeverity, Prisma, Notification } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface SendNotificationParams {
  userIds: string[];
  template: string;
  payload?: Record<string, unknown>;
  severity?: NotificationSeverity;
  subjectTable?: string;
  subjectId?: string;
}

/** Channels to fan out to for a severity (in-app always; push+email from Watch; Teams for Danger). */
function channelsFor(severity: NotificationSeverity): NotificationChannel[] {
  const channels: NotificationChannel[] = [NotificationChannel.IN_APP];
  if (severity === NotificationSeverity.WATCH || severity === NotificationSeverity.DANGER) {
    channels.push(NotificationChannel.PUSH, NotificationChannel.EMAIL);
  }
  if (severity === NotificationSeverity.DANGER) {
    channels.push(NotificationChannel.TEAMS);
  }
  return channels;
}

/**
 * Notification fan-out with per-user channel preferences. In-app notifications persist
 * to the DB; push/email/Teams are stubbed (logged) until FCM + Microsoft Graph land.
 * Danger repeat-until-acknowledged (BullMQ) is wired with the danger engine (S6).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async send(params: SendNotificationParams): Promise<Notification[]> {
    const severity = params.severity ?? NotificationSeverity.INFO;
    const channels = channelsFor(severity);

    const created: Notification[] = [];
    for (const userId of params.userIds) {
      const notification = await this.prisma.notification.create({
        data: {
          userId,
          template: params.template,
          payload: (params.payload as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          severity,
          subjectTable: params.subjectTable ?? null,
          subjectId: params.subjectId ?? null,
        },
      });
      created.push(notification);

      // External channels honour per-user preferences (default: enabled).
      const external = channels.filter((c) => c !== NotificationChannel.IN_APP);
      for (const channel of external) {
        if (await this.channelEnabled(userId, channel)) {
          this.logger.log(`[${channel}] → ${userId}: ${params.template} (${severity})`);
          // TODO(S1+): FCM push / Graph email + Teams dispatch.
        }
      }
    }
    return created;
  }

  private async channelEnabled(userId: string, channel: NotificationChannel): Promise<boolean> {
    const pref = await this.prisma.notificationPreference.findUnique({
      where: { userId_channel: { userId, channel } },
    });
    return pref?.enabled ?? true;
  }

  listForUser(userId: string, unreadOnly = false, take = 50, skip = 0): Promise<Notification[]> {
    return this.prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    });
  }

  unreadCount(userId: string): Promise<number> {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }

  async markRead(id: string, userId: string): Promise<Notification> {
    const existing = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!existing) {
      throw new NotFoundException('Notification not found');
    }
    return this.prisma.notification.update({
      where: { id },
      data: { readAt: existing.readAt ?? new Date() },
    });
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const res = await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: res.count };
  }

  getPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({ where: { userId } });
  }

  setPreference(userId: string, channel: NotificationChannel, enabled: boolean) {
    return this.prisma.notificationPreference.upsert({
      where: { userId_channel: { userId, channel } },
      update: { enabled },
      create: { userId, channel, enabled },
    });
  }
}
