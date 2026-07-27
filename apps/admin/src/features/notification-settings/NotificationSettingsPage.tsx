import { CheckOutlined, MinusOutlined } from '@ant-design/icons';
import { App, Card, Space, Switch, Table, Tag, Tooltip, Typography } from 'antd';
import {
  CHANNEL_LABELS,
  CHANNELS,
  isChannelToggleable,
  isChannelUsedAt,
  SEVERITIES,
  SEVERITY_COLORS,
  SEVERITY_LABELS,
} from './channels';
import {
  useGetNotificationPreferencesQuery,
  useSetNotificationPreferenceMutation,
  type NotificationChannel,
} from './notificationSettingsApi';

/**
 * Notification channel configuration (spec §4.1, gap G24). Two parts:
 *  1. A read-only severity→channel matrix mirroring the backend `channelsFor` fan-out
 *     (in-app always; push+email from Watch; Teams for Danger).
 *  2. Per-user channel toggles backed by the preferences API (GET current, PUT to
 *     enable/disable). In-app is always on and cannot be disabled.
 */
export function NotificationSettingsPage() {
  const { data: prefs, isLoading } = useGetNotificationPreferencesQuery();
  const [setPreference, setState] = useSetNotificationPreferenceMutation();
  const { message } = App.useApp();

  // Preferences default to enabled server-side when no row exists, so treat a missing
  // row as "on".
  const enabledFor = (channel: NotificationChannel): boolean => {
    const row = prefs?.find((p) => p.channel === channel);
    return row?.enabled ?? true;
  };

  const toggle = async (channel: NotificationChannel, enabled: boolean) => {
    try {
      await setPreference({ channel, enabled }).unwrap();
      message.success(
        `${CHANNEL_LABELS[channel]} notifications ${enabled ? 'enabled' : 'disabled'}`,
      );
    } catch {
      message.error('Could not update notification preference');
    }
  };

  return (
    <>
      <Typography.Title level={3} style={{ margin: 0, marginBottom: 4 }}>
        Notification settings
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Choose how alerts reach you. Notification urgency (severity) decides which channels
        are used; your preferences below let you opt out of external channels.
      </Typography.Paragraph>

      <Card
        title="Severity → channel routing"
        size="small"
        style={{ marginBottom: 24 }}
        styles={{ body: { paddingTop: 8 } }}
      >
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          How each severity fans out across channels. This routing is fixed in the platform.
        </Typography.Paragraph>
        <Table<{ channel: NotificationChannel }>
          rowKey="channel"
          size="small"
          pagination={false}
          dataSource={CHANNELS.map((channel) => ({ channel }))}
          columns={[
            {
              title: 'Channel',
              dataIndex: 'channel',
              render: (channel: NotificationChannel) => (
                <Space>
                  <span>{CHANNEL_LABELS[channel]}</span>
                  {!isChannelToggleable(channel) && <Tag color="green">always on</Tag>}
                </Space>
              ),
            },
            ...SEVERITIES.map((severity) => ({
              title: (
                <Tag color={SEVERITY_COLORS[severity]} style={{ marginInlineEnd: 0 }}>
                  {SEVERITY_LABELS[severity]}
                </Tag>
              ),
              key: severity,
              align: 'center' as const,
              render: (_: unknown, row: { channel: NotificationChannel }) =>
                isChannelUsedAt(row.channel, severity) ? (
                  <CheckOutlined style={{ color: '#52c41a' }} aria-label="used" />
                ) : (
                  <MinusOutlined style={{ color: '#bfbfbf' }} aria-label="not used" />
                ),
            })),
          ]}
        />
      </Card>

      <Card title="My channel preferences" size="small" styles={{ body: { paddingTop: 8 } }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 12 }}>
          Turn external delivery channels on or off for your account. In-app notifications
          are always kept.
        </Typography.Paragraph>
        <Table<{ channel: NotificationChannel }>
          rowKey="channel"
          size="small"
          loading={isLoading}
          pagination={false}
          dataSource={CHANNELS.map((channel) => ({ channel }))}
          columns={[
            {
              title: 'Channel',
              dataIndex: 'channel',
              render: (channel: NotificationChannel) => CHANNEL_LABELS[channel],
            },
            {
              title: 'Enabled',
              key: 'enabled',
              align: 'right',
              render: (_: unknown, { channel }: { channel: NotificationChannel }) => {
                if (!isChannelToggleable(channel)) {
                  return (
                    <Tooltip title="In-app notifications cannot be turned off">
                      <Switch checked disabled aria-label={`${CHANNEL_LABELS[channel]} enabled`} />
                    </Tooltip>
                  );
                }
                return (
                  <Switch
                    checked={enabledFor(channel)}
                    loading={setState.isLoading}
                    aria-label={`${CHANNEL_LABELS[channel]} enabled`}
                    onChange={(checked) => toggle(channel, checked)}
                  />
                );
              },
            },
          ]}
        />
      </Card>
    </>
  );
}
