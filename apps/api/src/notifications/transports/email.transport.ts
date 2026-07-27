import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Notification } from '@prisma/client';
import type { AppConfig } from '../../config/configuration';
import { NotificationRecipient, NotificationTransport } from './notification-transport';

/**
 * Minimal structural type for the bits of nodemailer we use. Declared locally so this
 * file type-checks even before `nodemailer` / `@types/nodemailer` are installed; the real
 * module is pulled in lazily at first send via dynamic import.
 */
interface MailTransporter {
  sendMail(options: {
    from?: string;
    to: string;
    subject: string;
    text?: string;
    html?: string;
  }): Promise<{ messageId?: string }>;
}
interface NodemailerModule {
  createTransport(options: unknown): MailTransporter;
}

/**
 * SMTP email delivery via nodemailer (G7). Config-driven and graceful:
 *  - Enabled only when a transport target (MAIL_SMTP_URL or MAIL_HOST) AND MAIL_FROM are set.
 *  - Unconfigured → isEnabled() is false, send() logs a debug line and no-ops.
 *  - nodemailer is imported lazily on first send so the app boots without the dependency.
 *
 * To activate: set MAIL_FROM plus either MAIL_SMTP_URL (smtp://user:pass@host:port) or
 * MAIL_HOST/MAIL_PORT/MAIL_USER/MAIL_PASS/MAIL_SECURE, then `npm install` (adds nodemailer).
 */
@Injectable()
export class EmailTransport implements NotificationTransport {
  readonly channel = 'EMAIL';
  private readonly logger = new Logger(EmailTransport.name);
  private readonly mail: AppConfig['notifications']['mail'];
  private transporter: MailTransporter | null = null;

  constructor(config: ConfigService<AppConfig, true>) {
    this.mail = config.get('notifications', { infer: true }).mail;
    if (!this.isEnabled()) {
      this.logger.debug('EmailTransport disabled — no SMTP target / MAIL_FROM configured');
    }
  }

  isEnabled(): boolean {
    return Boolean((this.mail.smtpUrl || this.mail.host) && this.mail.from);
  }

  async send(notification: Notification, recipient: NotificationRecipient): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.debug(
        `EMAIL skipped (unconfigured) → ${recipient.userId}: ${notification.template}`,
      );
      return;
    }
    if (!recipient.email) {
      this.logger.debug(
        `EMAIL skipped (no address) → ${recipient.userId}: ${notification.template}`,
      );
      return;
    }
    try {
      const transporter = await this.getTransporter();
      const subject = `[AES ${notification.severity}] ${notification.template}`;
      const body = this.renderBody(notification);
      const result = await transporter.sendMail({
        from: this.mail.from ?? undefined,
        to: recipient.email,
        subject,
        text: body,
      });
      this.logger.log(
        `EMAIL delivered → ${recipient.email}: ${notification.template} (id=${result.messageId ?? 'n/a'})`,
      );
    } catch (err) {
      this.logger.error(
        `EMAIL failed → ${recipient.email}: ${notification.template} — ${(err as Error).message}`,
      );
    }
  }

  private renderBody(notification: Notification): string {
    const lines = [
      `Template: ${notification.template}`,
      `Severity: ${notification.severity}`,
    ];
    if (notification.payload && notification.payload !== null) {
      lines.push('', JSON.stringify(notification.payload, null, 2));
    }
    return lines.join('\n');
  }

  /** Lazily create (and cache) the nodemailer transporter from config. */
  private async getTransporter(): Promise<MailTransporter> {
    if (this.transporter) {
      return this.transporter;
    }
    // Indirect specifier so tsc doesn't require nodemailer's types at build time; the
    // package is a runtime dependency resolved on first send.
    const nodemailer = (await import(/* webpackIgnore: true */ 'nodemailer' as string)) as unknown as NodemailerModule;
    const options = this.mail.smtpUrl
      ? this.mail.smtpUrl
      : {
          host: this.mail.host,
          port: this.mail.port ?? 587,
          secure: this.mail.secure,
          auth:
            this.mail.user && this.mail.pass
              ? { user: this.mail.user, pass: this.mail.pass }
              : undefined,
        };
    this.transporter = nodemailer.createTransport(options);
    return this.transporter;
  }
}
