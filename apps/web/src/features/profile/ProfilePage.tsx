import { Descriptions, Tag, Typography } from 'antd';
import { useAppSelector } from '../../app/hooks';
import { ROLE_LABELS } from '../../rbac/roles';

export function ProfilePage() {
  const user = useAppSelector((s) => s.auth.user);
  if (!user) return null;

  return (
    <>
      <Typography.Title level={3}>My Profile</Typography.Title>
      <Descriptions bordered column={1} styles={{ label: { width: 200 } }}>
        <Descriptions.Item label="Email">{user.email}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag color={user.status === 'ACTIVE' ? 'green' : 'default'}>{user.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Roles">
          {user.roles.map((r) => (
            <Tag key={`${r.siteId}-${r.role}`} color="blue">
              {ROLE_LABELS[r.role]}
              {r.siteId ? ` @ site ${r.siteId.slice(0, 8)}` : ' (global)'}
            </Tag>
          ))}
        </Descriptions.Item>
      </Descriptions>
    </>
  );
}
