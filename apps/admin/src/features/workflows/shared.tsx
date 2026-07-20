/* eslint-disable react-refresh/only-export-components -- shared workflow helpers colocated with the StatusTag component */
import { Tag } from 'antd';

/** Status → colour across every workflow lifecycle (draft/approval/disbursement/terminal). */
const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'blue',
  PENDING: 'blue',
  APPROVED: 'green',
  APPROVED_READY_TO_PAY: 'green',
  APPROVED_PENDING_FUNDS: 'orange',
  POSTED_AWAITING_TRANSFER: 'geekblue',
  ACTIVE: 'green',
  DISBURSED: 'cyan',
  RETIRED: 'purple',
  COMPLETED: 'green',
  CLOSED: 'default',
  POSTED: 'cyan',
  REJECTED: 'red',
  RETURNED: 'volcano',
  SUPERSEDED: 'default',
};

export function StatusTag({ status }: { status: string }) {
  return <Tag color={STATUS_COLOR[status] ?? 'default'}>{status.replace(/_/g, ' ')}</Tag>;
}

/** Pull a human message out of an RTK-Query error (Nest returns { message }). */
export function errorMessage(e: unknown, fallback = 'Action failed'): string {
  const err = e as { data?: { message?: string | string[] } };
  const msg = err?.data?.message;
  if (Array.isArray(msg)) return msg.join('; ');
  return msg ?? fallback;
}

export const money = (v: string | number | null | undefined, currency?: string) => {
  if (v === null || v === undefined) return '—';
  const n = Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 });
  return currency ? `${currency} ${n}` : n;
};
