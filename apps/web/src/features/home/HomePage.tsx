import { BellOutlined, DollarOutlined, UserOutlined } from '@ant-design/icons';
import { Card, Col, Row, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { useUnreadCountQuery } from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { ROLE_LABELS } from '../../rbac/roles';

export function HomePage() {
  const user = useAppSelector((s) => s.auth.user);
  const navigate = useNavigate();
  const { data: unread } = useUnreadCountQuery();

  const tiles = [
    { title: 'Notifications', desc: `${unread?.count ?? 0} unread`, icon: <BellOutlined />, to: '/notifications' },
    { title: 'Exchange Rates', desc: 'Official & street rates', icon: <DollarOutlined />, to: '/rates' },
    { title: 'My Profile', desc: 'Account & roles', icon: <UserOutlined />, to: '/profile' },
  ];

  return (
    <>
      <Typography.Title level={3}>Welcome, {user?.email}</Typography.Title>
      <Typography.Paragraph type="secondary">
        {user?.roles.map((r) => (
          <Tag key={`${r.siteId}-${r.role}`} color="green">
            {ROLE_LABELS[r.role]}
            {r.siteId ? '' : ' (global)'}
          </Tag>
        ))}
      </Typography.Paragraph>
      <Row gutter={[16, 16]}>
        {tiles.map((t) => (
          <Col key={t.to} xs={24} sm={12} md={8}>
            <Card hoverable onClick={() => navigate(t.to)}>
              <Typography.Title level={4} style={{ marginTop: 0 }}>
                {t.icon} {t.title}
              </Typography.Title>
              <Typography.Text type="secondary">{t.desc}</Typography.Text>
            </Card>
          </Col>
        ))}
      </Row>
      <Typography.Paragraph type="secondary" style={{ marginTop: 24 }}>
        Raise requests, action approvals and watch the Command Centre.
      </Typography.Paragraph>
    </>
  );
}
