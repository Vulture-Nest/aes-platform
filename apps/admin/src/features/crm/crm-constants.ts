// Engine-defined pipeline stages & interaction types (the CRM engine validates
// these server-side), so the fixed vocabulary lives with the code.
export const STAGES = ['CONTACT', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST'] as const;

export const STAGE_LABEL: Record<string, string> = {
  CONTACT: 'Contact',
  QUALIFIED: 'Qualified',
  PROPOSAL: 'Proposal',
  NEGOTIATION: 'Negotiation',
  WON: 'Won',
  LOST: 'Lost',
};

export const STAGE_COLOR: Record<string, string> = {
  CONTACT: 'default',
  QUALIFIED: 'blue',
  PROPOSAL: 'cyan',
  NEGOTIATION: 'gold',
  WON: 'green',
  LOST: 'red',
};

export const INTERACTION_TYPES = ['CALL', 'VISIT', 'EMAIL', 'TENDER', 'MEETING'];

export const money = (value: string | number | null, currency?: string | null) => {
  if (value === null || value === undefined || value === '') return '—';
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  return `${currency ? `${currency} ` : ''}${n.toLocaleString()}`;
};
