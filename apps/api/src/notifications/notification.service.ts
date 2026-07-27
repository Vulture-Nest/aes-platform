import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NotificationChannel, NotificationSeverity, Prisma, Notification } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmailTransport } from './transports/email.transport';
import { PushTransport } from './transports/push.transport';
import { TeamsTransport } from './transports/teams.transport';
import {
  NotificationRecipient,
  NotificationTransport,
} from './transports/notification-transport';

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
 * to the DB; push/email/Teams are delivered through pluggable, config-driven transports
 * (G7). Each transport no-ops gracefully when its credentials are absent, so dev/CI run
 * with zero mail/Teams/FCM env. Danger repeat-until-acknowledged (BullMQ) is wired with
 * the danger engine (S6).
 */
@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  /** Maps each external NotificationChannel to its delivery transport. */
  private readonly transports: Partial<Record<NotificationChannel, NotificationTransport>>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly email: EmailTransport,
    private readonly push: PushTransport,
    private readonly teams: TeamsTransport,
  ) {
    this.transports = {
      [NotificationChannel.EMAIL]: this.email,
      [NotificationChannel.PUSH]: this.push,
      [NotificationChannel.TEAMS]: this.teams,
    };
  }

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

      // External channels honour per-user preferences (default: enabled) and dispatch
      // through their transport. Resolve the recipient once and reuse across channels.
      const external = channels.filter((c) => c !== NotificationChannel.IN_APP);
      let recipient: NotificationRecipient | null = null;
      for (const channel of external) {
        const transport = this.transports[channel];
        if (!transport) {
          continue;
        }
        if (!(await this.channelEnabled(userId, channel))) {
          continue;
        }
        recipient ??= await this.resolveRecipient(userId);
        await transport.send(notification, recipient);
      }
    }
    return created;
  }

  /** Look up the contactable identifiers (email, device tokens) for external delivery. */
  private async resolveRecipient(userId: string): Promise<NotificationRecipient> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    // TODO(G7): source deviceTokens from a device-registration store once it exists.
    return { userId, email: user?.email ?? null, deviceTokens: [] };
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
