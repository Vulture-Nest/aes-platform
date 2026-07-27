import { Notification } from '@prisma/client';

/**
 * A resolved recipient for external delivery. The in-app record already carries the
 * userId; transports need contactable identifiers (email address, device tokens, etc.).
 * Fields are optional so a transport can gracefully skip when it lacks what it needs.
 */
export interface NotificationRecipient {
  userId: string;
  /** Destination email address (EmailTransport). */
  email?: string | null;
  /** FCM registration tokens for this user's devices (PushTransport). */
  deviceTokens?: string[];
}

/**
 * Pluggable external delivery channel (email / Teams / push). Implementations MUST be
 * config-driven: when unconfigured, isEnabled() returns false and send() no-ops without
 * throwing, preserving the original stub behaviour so dev/CI run with no creds.
 */
export interface NotificationTransport {
  /** Stable channel label used in logs, e.g. 'EMAIL'. */
  readonly channel: string;
  /** True only when the required credentials/config are present. */
  isEnabled(): boolean;
  /**
   * Deliver a single notification to one recipient. Resolves whether or not delivery
   * happened; when disabled it logs a debug line and returns without side effects.
   * Errors are caught and logged rather than thrown, so one bad channel can't break fan-out.
   */
  send(notification: Notification, recipient: NotificationRecipient): Promise<void>;
}
