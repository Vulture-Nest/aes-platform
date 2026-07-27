import { describe, expect, it } from 'vitest';
import {
  channelsFor,
  CHANNELS,
  isChannelToggleable,
  isChannelUsedAt,
  SEVERITIES,
} from './channels';

// Mirrors the backend channelsFor in apps/api/src/notifications/notification.service.ts.
describe('channelsFor', () => {
  it('INFO fans out to in-app only', () => {
    expect(channelsFor('INFO')).toEqual(['IN_APP']);
  });
  it('WATCH adds push + email', () => {
    expect(channelsFor('WATCH')).toEqual(['IN_APP', 'PUSH', 'EMAIL']);
  });
  it('DANGER adds Teams on top of push + email', () => {
    expect(channelsFor('DANGER')).toEqual(['IN_APP', 'PUSH', 'EMAIL', 'TEAMS']);
  });
  it('always includes in-app for every severity', () => {
    for (const severity of SEVERITIES) {
      expect(channelsFor(severity)).toContain('IN_APP');
    }
  });
});

describe('isChannelUsedAt', () => {
  it('is true for in-app at INFO but false for email', () => {
    expect(isChannelUsedAt('IN_APP', 'INFO')).toBe(true);
    expect(isChannelUsedAt('EMAIL', 'INFO')).toBe(false);
  });
  it('is true for Teams only at DANGER', () => {
    expect(isChannelUsedAt('TEAMS', 'WATCH')).toBe(false);
    expect(isChannelUsedAt('TEAMS', 'DANGER')).toBe(true);
  });
});

describe('isChannelToggleable', () => {
  it('locks in-app and allows external channels', () => {
    expect(isChannelToggleable('IN_APP')).toBe(false);
    expect(CHANNELS.filter(isChannelToggleable)).toEqual(['PUSH', 'EMAIL', 'TEAMS']);
  });
});
