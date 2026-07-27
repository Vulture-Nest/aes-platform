import { App, List, Switch, Typography } from 'antd';
import {
  useGetNotificationPreferencesQuery,
  useSetNotificationPreferenceMutation,
  type NotificationChannel,
} from './notificationPrefsApi';

// End users manage their personal delivery channels here. In-app is always kept
// (notifications persist regardless), so it's shown as a locked "always on" row;
// push + email are the opt-out toggles. Teams is an org channel, not a personal one.
const ROWS: { channel: NotificationChannel; label: string; description: string }[] = [
  {
    channel: 'IN_APP',
    label: 'In-app',
    description: 'Always shown in your notifications list.',
  },
  {
    channel: 'PUSH',
    label: 'Push',
    description: 'Alerts pushed to your registered devices.',
  },
  {
    channel: 'EMAIL',
    label: 'Email',
    description: 'A copy of higher-priority alerts sent to your email.',
  },
];

export function NotificationPreferences() {
  const { data: prefs, isLoading } = useGetNotificationPreferencesQuery();
  const [setPreference, setState] = useSetNotificationPreferenceMutation();
  const { message } = App.useApp();

  // Missing row means "not yet set" — the server defaults such channels to enabled.
  const enabledFor = (channel: NotificationChannel): boolean =>
    prefs?.find((p) => p.channel === channel)?.enabled ?? true;

  const toggle = async (channel: NotificationChannel, label: string, enabled: boolean) => {
    try {
      await setPreference({ channel, enabled }).unwrap();
      message.success(`${label} notifications ${enabled ? 'enabled' : 'disabled'}`);
    } catch {
      message.error('Could not update notification preference');
    }
  };

  return (
    <>
      <Typography.Title level={4} style={{ marginTop: 32 }}>
        Notification preferences
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Choose how you'd like to be notified. In-app notifications are always kept.
      </Typography.Paragraph>
      <List
        loading={isLoading}
        dataSource={ROWS}
        renderItem={(row) => {
          const locked = row.channel === 'IN_APP';
          return (
            <List.Item
              actions={[
                <Switch
                  key="toggle"
                  checked={locked ? true : enabledFor(row.channel)}
                  disabled={locked}
                  loading={!locked && setState.isLoading}
                  aria-label={`${row.label} notifications`}
                  onChange={
                    locked ? undefined : (checked) => toggle(row.channel, row.label, checked)
                  }
                />,
              ]}
            >
              <List.Item.Meta title={row.label} description={row.description} />
            </List.Item>
          );
        }}
      />
    </>
  );
}
