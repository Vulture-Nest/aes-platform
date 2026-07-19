import { App, Button, Empty, List, Space, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import {
  useGetNotificationsQuery,
  useMarkAllReadMutation,
  useMarkReadMutation,
} from '../../api/api';

const SEVERITY_COLOR: Record<string, string> = { INFO: 'blue', WATCH: 'gold', DANGER: 'red' };

export function NotificationsPage() {
  const { data, isLoading } = useGetNotificationsQuery();
  const [markRead] = useMarkReadMutation();
  const [markAllRead, allState] = useMarkAllReadMutation();
  const { message } = App.useApp();

  const onAll = async () => {
    const res = await markAllRead().unwrap();
    message.success(`Marked ${res.updated} read`);
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
              style={{ opacity: n.readAt ? 0.55 : 1 }}
              actions={
                n.readAt
                  ? [<Tag key="r">read</Tag>]
                  : [
                      <Button key="m" size="small" onClick={() => markRead(n.id)}>
                        Mark read
                      </Button>,
                    ]
              }
            >
              <List.Item.Meta
                title={
                  <Space>
                    <Tag color={SEVERITY_COLOR[n.severity]}>{n.severity}</Tag>
                    {n.template}
                  </Space>
                }
                description={dayjs(n.createdAt).format('YYYY-MM-DD HH:mm')}
              />
            </List.Item>
          )}
        />
      )}
    </>
  );
}
