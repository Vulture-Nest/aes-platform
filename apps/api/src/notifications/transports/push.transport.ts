import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync } from 'node:fs';
import { Notification } from '@prisma/client';
import type { AppConfig } from '../../config/configuration';
import { NotificationRecipient, NotificationTransport } from './notification-transport';

/**
 * Minimal structural types for the slice of firebase-admin we use. Declared locally so
 * this file type-checks without firebase-admin installed; the real module is loaded
 * lazily (dynamic import) only when a service account is configured — it is NOT a boot
 * dependency, so the app runs and tests pass without it.
 */
interface FirebaseMessaging {
  sendEachForMulticast(message: {
    tokens: string[];
    notification: { title: string; body: string };
    data?: Record<string, string>;
  }): Promise<{ successCount: number; failureCount: number }>;
}
interface FirebaseApp {
  messaging(): FirebaseMessaging;
}
interface FirebaseAdminModule {
  initializeApp(options: { credential: unknown }): FirebaseApp;
  credential: { cert(serviceAccount: unknown): unknown };
}

/**
 * FCM push delivery via firebase-admin (G7). Config-driven and graceful:
 *  - Enabled only when FCM_SERVICE_ACCOUNT_JSON resolves to valid credentials (a file
 *    path or an inline JSON string).
 *  - Unconfigured → isEnabled() is false and send() no-ops.
 *  - firebase-admin is imported lazily on first send (dynamic import); it is intentionally
 *    NOT a package.json dependency, so the app boots and tests run without it. If the config
 *    is set but the module isn't installed, send() logs an error and no-ops (never throws).
 *
 * Device-token storage: the User model has no device-token column yet, so recipients
 * currently carry no tokens and every push is skipped as "no device tokens". Wiring a
 * device-token table/lookup is the remaining step to make push deliver (TODO).
 *
 * To activate: install firebase-admin, set FCM_SERVICE_ACCOUNT_JSON (path or inline JSON),
 * and populate recipient.deviceTokens from a device-registration store.
 */
@Injectable()
export class PushTransport implements NotificationTransport {
  readonly channel = 'PUSH';
  private readonly logger = new Logger(PushTransport.name);
  private readonly serviceAccountConfig: string | null;
  private messaging: FirebaseMessaging | null = null;
  private initFailed = false;

  constructor(config: ConfigService<AppConfig, true>) {
    this.serviceAccountConfig = config.get('notifications', { infer: true }).fcmServiceAccountJson;
    if (!this.isEnabled()) {
      this.logger.debug('PushTransport disabled — no FCM_SERVICE_ACCOUNT_JSON configured');
    }
  }

  isEnabled(): boolean {
    return Boolean(this.serviceAccountConfig) && !this.initFailed;
  }

  async send(notification: Notification, recipient: NotificationRecipient): Promise<void> {
    if (!this.isEnabled()) {
      this.logger.debug(
        `PUSH skipped (unconfigured) → ${recipient.userId}: ${notification.template}`,
      );
      return;
    }
    const tokens = recipient.deviceTokens ?? [];
    if (tokens.length === 0) {
      this.logger.debug(
        `PUSH skipped (no device tokens) → ${recipient.userId}: ${notification.template}`,
      );
      return;
    }
    try {
      const messaging = await this.getMessaging();
      if (!messaging) {
        return;
      }
      const res = await messaging.sendEachForMulticast({
        tokens,
        notification: {
          title: `AES ${notification.severity}`,
          body: notification.template,
        },
        data: {
          template: notification.template,
          severity: String(notification.severity),
          notificationId: notification.id,
        },
      });
      this.logger.log(
        `PUSH delivered → ${recipient.userId}: ${notification.template} ` +
          `(ok=${res.successCount}, fail=${res.failureCount})`,
      );
    } catch (err) {
      this.logger.error(
        `PUSH failed → ${recipient.userId}: ${notification.template} — ${(err as Error).message}`,
      );
    }
  }

  /** Lazily initialise firebase-admin from the configured service account. */
  private async getMessaging(): Promise<FirebaseMessaging | null> {
    if (this.messaging) {
      return this.messaging;
    }
    try {
      // Indirect specifier so tsc doesn't require firebase-admin's types at build time;
      // it is intentionally NOT a package.json dependency and is optional at runtime.
      const admin = (await import('firebase-admin' as string)) as unknown as FirebaseAdminModule;
      const serviceAccount = this.loadServiceAccount();
      const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      this.messaging = app.messaging();
      return this.messaging;
    } catch (err) {
      // firebase-admin missing or bad credentials — disable so we stop retrying + no-op.
      this.initFailed = true;
      this.logger.error(
        `PUSH init failed (firebase-admin unavailable or bad service account) — ${(err as Error).message}`,
      );
      return null;
    }
  }

  /** Resolve FCM_SERVICE_ACCOUNT_JSON as an existing file path, else parse as inline JSON. */
  private loadServiceAccount(): unknown {
    const raw = this.serviceAccountConfig as string;
    const json = existsSync(raw) ? readFileSync(raw, 'utf8') : raw;
    return JSON.parse(json);
  }
}
