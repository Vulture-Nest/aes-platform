import { Card, Col, Row, Statistic, Tag, Typography } from 'antd';
import { useGetSitesQuery, useGetUsersQuery, useGetExchangeRatesQuery } from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { ROLE_LABELS } from '../../rbac/roles';

export function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);
  const users = useGetUsersQuery();
  const sites = useGetSitesQuery();
  const rates = useGetExchangeRatesQuery();

  return (
    <>
      <Typography.Title level={3}>Configuration overview</Typography.Title>
      <Typography.Paragraph type="secondary">
        Signed in as <strong>{user?.email}</strong> —{' '}
        {user?.roles.map((r) => (
          <Tag key={`${r.siteId}-${r.role}`} color="blue">
            {ROLE_LABELS[r.role]}
            {r.siteId ? '' : ' (global)'}
          </Tag>
        ))}
      </Typography.Paragraph>
      <Row gutter={16}>
        <Col span={8}>
          <Card>
            <Statistic title="Users" value={users.data?.length ?? 0} loading={users.isLoading} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic title="Sites" value={sites.data?.length ?? 0} loading={sites.isLoading} />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="FX rate entries"
              value={rates.data?.length ?? 0}
              loading={rates.isLoading}
            />
          </Card>
        </Col>
      </Row>
    </>
  );
}
