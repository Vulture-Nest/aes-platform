import type { ResponseStatus } from './marketingApi';

export const CAMPAIGN_STATUSES = ['PLANNED', 'ACTIVE', 'CLOSED'] as const;

export const CAMPAIGN_STATUS_COLOR: Record<string, string> = {
  PLANNED: 'default',
  ACTIVE: 'green',
  CLOSED: 'red',
};

export const CHANNEL_TYPES = [
  'Facebook',
  'LinkedIn',
  'WhatsApp',
  'X',
  'Instagram',
  'Expo',
  'Flier',
] as const;

export const RESPONSE_STATUS_COLOR: Record<ResponseStatus, string> = {
  NEW: 'blue',
  CONTACTED: 'gold',
  QUALIFIED: 'green',
  DEAD: 'red',
};

export const money = (value: string | number | null | undefined, currency?: string | null) => {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `${currency ? `${currency} ` : ''}${n.toLocaleString()}`;
};

export const num = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : value.toLocaleString();
