import { App, Button, Descriptions, Empty, List, Modal, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  useGetNotificationsQuery,
  useMarkAllReadMutation,
  useMarkReadMutation,
  type NotificationRecord,
} from '../../api/api';

const SEVERITY_COLOR: Record<string, string> = { INFO: 'blue', WATCH: 'gold', DANGER: 'red' };
const SEVERITY_LABEL: Record<string, string> = { INFO: 'Info', WATCH: 'Attention', DANGER: 'Urgent' };

const MONEY_KEYS = /(amount|shortfall|total|balance|value|sum|due|paid|limit)/i;

/** Turn a template/field key like "requisition.pending_funds" into readable text. */
const humanize = (s: string) =>
  s
    .replace(/[._]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\bid\b/gi, '')
    .trim()
    .replace(/^./, (c) => c.toUpperCase());

const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/i.test(v);

/** Render a notification payload as friendly label/value rows — never raw JSON. */
function friendlyRows(payload: Record<string, unknown>): { label: string; value: string }[] {
  const currency = typeof payload.currency === 'string' ? payload.currency : undefined;
  const rows: { label: string; value: string }[] = [];
  let currencyShown = false;
  for (const [key, raw] of Object.entries(payload)) {
    if (key === 'currency') continue;
    let value: string;
    if (typeof raw === 'number') {
      const n = raw.toLocaleString(undefined, { maximumFractionDigits: 2 });
      if (MONEY_KEYS.test(key) && currency) {
        value = `${n} ${currency}`;
        currencyShown = true;
      } else {
        value = n;
      }
    } else if (typeof raw === 'boolean') {
      value = raw ? 'Yes' : 'No';
    } else if (raw == null) {
      continue;
    } else {
      const s = String(raw);
      value = isUuid(s) ? `#${s.slice(0, 8)}` : s;
    }
    rows.push({ label: humanize(key), value });
  }
  if (currency && !currencyShown) rows.push({ label: 'Currency', value: currency });
  return rows;
}

export function NotificationsPage() {
  const { data, isLoading } = useGetNotificationsQuery();
  const [markRead] = useMarkReadMutation();
  const [markAllRead, allState] = useMarkAllReadMutation();
  const { message } = App.useApp();
  const [selected, setSelected] = useState<NotificationRecord | null>(null);

  const onAll = async () => {
    const res = await markAllRead().unwrap();
    message.success(`Marked ${res.updated} read`);
  };

  // Opening a notification to read it is what marks it read — no separate button.
  const openDetail = (n: NotificationRecord) => {
    setSelected(n);
    if (!n.readAt) markRead(n.id);
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Notifications
        </Typography.Title>
        <Button onClick={onAll} loading={allState.isLoading} disabled={!data?.some((n) => !n.readAt)}>
          Mark all read
        </Button>
      </Space>
      {data && data.length === 0 ? (
        <Empty description="You're all caught up" />
      ) : (
        <List
          loading={isLoading}
          dataSource={data}
          renderItem={(n) => (
            <List.Item
              onClick={() => openDetail(n)}
              style={{ cursor: 'pointer', opacity: n.readAt ? 0.55 : 1, paddingInline: 8 }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f6faf8')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <List.Item.Meta
                title={
                  <Space>
                    {!n.readAt && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: '50%',
                          background: '#6DBE45',
                          display: 'inline-block',
                        }}
                      />
                    )}
                    <Tag color={SEVERITY_COLOR[n.severity]}>
                      {SEVERITY_LABEL[n.severity] ?? n.severity}
                    </Tag>
                    <span style={{ fontWeight: n.readAt ? 400 : 600 }}>{humanize(n.template)}</span>
                  </Space>
                }
                description={dayjs(n.createdAt).format('YYYY-MM-DD HH:mm')}
              />
            </List.Item>
          )}
        />
      )}
      <Modal
        title={selected ? humanize(selected.template) : 'Notification'}
        open={!!selected}
        onCancel={() => setSelected(null)}
        footer={
          <Button type="primary" onClick={() => setSelected(null)}>
            Close
          </Button>
        }
      >
        {selected && (
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Priority">
              <Tag color={SEVERITY_COLOR[selected.severity]}>
                {SEVERITY_LABEL[selected.severity] ?? selected.severity}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="When">
              {dayjs(selected.createdAt).format('DD MMM YYYY, HH:mm')}
            </Descriptions.Item>
            {friendlyRows((selected.payload ?? {}) as Record<string, unknown>).map((r) => (
              <Descriptions.Item key={r.label} label={r.label}>
                {r.value}
              </Descriptions.Item>
            ))}
          </Descriptions>
        )}
      </Modal>
    </>
  );
}
