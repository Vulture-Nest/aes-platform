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
                    <Tag color={SEVERITY_COLOR[n.severity]}>{n.severity}</Tag>
                    <span style={{ fontWeight: n.readAt ? 400 : 600 }}>{n.template}</span>
                  </Space>
                }
                description={dayjs(n.createdAt).format('YYYY-MM-DD HH:mm')}
              />
            </List.Item>
          )}
        />
      )}
      <Modal
        title="Notification"
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
            <Descriptions.Item label="Severity">
              <Tag color={SEVERITY_COLOR[selected.severity]}>{selected.severity}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Event">{selected.template}</Descriptions.Item>
            <Descriptions.Item label="When">
              {dayjs(selected.createdAt).format('YYYY-MM-DD HH:mm')}
            </Descriptions.Item>
            {selected.subjectTable && (
              <Descriptions.Item label="Relates to">
                {selected.subjectTable}
                {selected.subjectId ? ` · ${selected.subjectId.slice(0, 8)}` : ''}
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Details">
              <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12 }}>
                {selected.payload ? JSON.stringify(selected.payload, null, 2) : '—'}
              </pre>
            </Descriptions.Item>
          </Descriptions>
        )}
      </Modal>
    </>
  );
}
