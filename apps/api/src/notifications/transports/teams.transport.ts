import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notification } from '@prisma/client';
import type { AppConfig } from '../../config/configuration';
import { NotificationRecipient, NotificationTransport } from './notification-transport';

/** Theme colour by severity for the Teams MessageCard side stripe. */
const SEVERITY_COLOUR: Record<string, string> = {
  DANGER: 'D13438',
  WATCH: 'FFAA44',
  INFO: '0078D4',
};

/**
 * Microsoft Teams delivery via an Incoming Webhook (G7). POSTs a legacy MessageCard
 * (widely supported by connectors) using the global fetch/undici — no extra dependency.
 * Config-driven and graceful: unconfigured (no TEAMS_WEBHOOK_URL) → isEnabled() is false
 * and send() no-ops.
 *
 * To activate: set TEAMS_WEBHOOK_URL to an Incoming Webhook connector URL for the target
 * Teams channel. Teams is a channel-level (not per-user) sink, so recipient is only logged.
 */
@Injectable()
export class TeamsTransport implements NotificationTransport {
  readonly channel = 'TEAMS';
  private readonly logger = new Logger(TeamsTransport.name);
  private readonly webhookUrl: string | null;

  constructor(config: ConfigService<AppConfig, true>) {
    this.webhookUrl = config.get('notifications', { infer: true }).teamsWebhookUrl;
    if (!this.isEnabled()) {
      this.logger.debug('TeamsTransport disabled — no TEAMS_WEBHOOK_URL configured');
    }
  }

  isEnabled(): boolean {
    return Boolean(this.webhookUrl);
  }

  async send(notification: Notification, recipient: NotificationRecipient): Promise<void> {
    if (!this.isEnabled() || !this.webhookUrl) {
      this.logger.debug(
        `TEAMS skipped (unconfigured) → ${recipient.userId}: ${notification.template}`,
      );
      return;
    }
    try {
      const card = this.buildCard(notification, recipient);
      const res = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(card),
      });
      if (!res.ok) {
        this.logger.error(
          `TEAMS failed → ${notification.template}: HTTP ${res.status} ${res.statusText}`,
        );
        return;
      }
      this.logger.log(`TEAMS delivered → ${notification.template} (${notification.severity})`);
    } catch (err) {
      this.logger.error(
        `TEAMS failed → ${notification.template} — ${(err as Error).message}`,
      );
    }
  }

  private buildCard(notification: Notification, recipient: NotificationRecipient) {
    const facts: { name: string; value: string }[] = [
      { name: 'Severity', value: String(notification.severity) },
      { name: 'User', value: recipient.userId },
    ];
    if (notification.subjectTable) {
      facts.push({
        name: 'Subject',
        value: `${notification.subjectTable}${notification.subjectId ? `/${notification.subjectId}` : ''}`,
      });
    }
    return {
      '@type': 'MessageCard',
      '@context': 'https://schema.org/extensions',
      themeColor: SEVERITY_COLOUR[String(notification.severity)] ?? SEVERITY_COLOUR.INFO,
      summary: `AES ${notification.severity}: ${notification.template}`,
      title: `AES ${notification.severity}`,
      sections: [
        {
          activityTitle: notification.template,
          facts,
          text:
            notification.payload && notification.payload !== null
              ? `\`\`\`\n${JSON.stringify(notification.payload, null, 2)}\n\`\`\``
              : undefined,
        },
      ],
    };
  }
}
