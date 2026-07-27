import { ConfigService } from '@nestjs/config';
import { Notification, NotificationSeverity } from '@prisma/client';
import { EmailTransport } from './email.transport';
import { PushTransport } from './push.transport';
import { TeamsTransport } from './teams.transport';
import type { AppConfig } from '../../config/configuration';

/** A ConfigService stub returning the given notifications sub-config. */
function configWith(notifications: AppConfig['notifications']): ConfigService<AppConfig, true> {
  return { get: () => notifications } as unknown as ConfigService<AppConfig, true>;
}

const EMPTY_NOTIFICATIONS: AppConfig['notifications'] = {
  mail: { smtpUrl: null, host: null, port: null, secure: false, user: null, pass: null, from: null },
  teamsWebhookUrl: null,
  fcmServiceAccountJson: null,
};

const notification = {
  id: 'n1',
  template: 'approval.pending',
  severity: NotificationSeverity.WATCH,
  payload: null,
  subjectTable: null,
  subjectId: null,
} as unknown as Notification;

describe('Notification transports — graceful no-op when unconfigured', () => {
  const recipient = { userId: 'u1', email: 'user@aes.local', deviceTokens: ['tok'] };

  it('EmailTransport is disabled and no-ops without SMTP/MAIL_FROM', async () => {
    const t = new EmailTransport(configWith(EMPTY_NOTIFICATIONS));
    expect(t.isEnabled()).toBe(false);
    await expect(t.send(notification, recipient)).resolves.toBeUndefined();
  });

  it('EmailTransport is enabled once a target and MAIL_FROM are set', () => {
    const t = new EmailTransport(
      configWith({
        ...EMPTY_NOTIFICATIONS,
        mail: { ...EMPTY_NOTIFICATIONS.mail, host: 'smtp.example.com', from: 'AES <no-reply@aes.local>' },
      }),
    );
    expect(t.isEnabled()).toBe(true);
  });

  it('TeamsTransport is disabled and no-ops without a webhook URL', async () => {
    const t = new TeamsTransport(configWith(EMPTY_NOTIFICATIONS));
    expect(t.isEnabled()).toBe(false);
    await expect(t.send(notification, recipient)).resolves.toBeUndefined();
  });

  it('TeamsTransport is enabled once TEAMS_WEBHOOK_URL is set', () => {
    const t = new TeamsTransport(
      configWith({ ...EMPTY_NOTIFICATIONS, teamsWebhookUrl: 'https://outlook.office.com/webhook/x' }),
    );
    expect(t.isEnabled()).toBe(true);
  });

  it('PushTransport is disabled and no-ops without a service account', async () => {
    const t = new PushTransport(configWith(EMPTY_NOTIFICATIONS));
    expect(t.isEnabled()).toBe(false);
    await expect(t.send(notification, recipient)).resolves.toBeUndefined();
  });

  it('PushTransport no-ops (does not throw) when configured but tokens are absent', async () => {
    const t = new PushTransport(
      configWith({ ...EMPTY_NOTIFICATIONS, fcmServiceAccountJson: '{"invalid":true}' }),
    );
    expect(t.isEnabled()).toBe(true);
    // No device tokens → skipped before firebase-admin is ever touched.
    await expect(t.send(notification, { userId: 'u1', deviceTokens: [] })).resolves.toBeUndefined();
  });
});
