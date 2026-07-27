import type { NotificationChannel, NotificationSeverity } from './notificationSettingsApi';

/**
 * Mirror of the backend `channelsFor(severity)` in
 * apps/api/src/notifications/notification.service.ts — kept in sync so the admin UI
 * displays the real severity→channel fan-out. In-app is always on; push+email start
 * at WATCH; Teams is DANGER-only.
 */
export function channelsFor(severity: NotificationSeverity): NotificationChannel[] {
  const channels: NotificationChannel[] = ['IN_APP'];
  if (severity === 'WATCH' || severity === 'DANGER') {
    channels.push('PUSH', 'EMAIL');
  }
  if (severity === 'DANGER') {
    channels.push('TEAMS');
  }
  return channels;
}

export const SEVERITIES: NotificationSeverity[] = ['INFO', 'WATCH', 'DANGER'];

/** Display order for the channels (in-app first, external transports after). */
export const CHANNELS: NotificationChannel[] = ['IN_APP', 'PUSH', 'EMAIL', 'TEAMS'];

export const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  IN_APP: 'In-app',
  PUSH: 'Push',
  EMAIL: 'Email',
  TEAMS: 'Microsoft Teams',
};

export const SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  INFO: 'Info',
  WATCH: 'Watch',
  DANGER: 'Danger',
};

export const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  INFO: 'blue',
  WATCH: 'gold',
  DANGER: 'red',
};

/** True when this channel is ever used at the given severity (per channelsFor). */
export function isChannelUsedAt(
  channel: NotificationChannel,
  severity: NotificationSeverity,
): boolean {
  return channelsFor(severity).includes(channel);
}

/**
 * In-app notifications always persist to the DB and cannot be turned off; the
 * per-user preference toggle only governs the external transports.
 */
export function isChannelToggleable(channel: NotificationChannel): boolean {
  return channel !== 'IN_APP';
}
