import { Card, Col, Empty, Row, Statistic, Table, Typography } from 'antd';
import {
  useGetCrmAnalyticsQuery,
  useGetUsersQuery,
  type CrmConversionMetrics,
} from '../../api/api';

export function AnalyticsTab() {
  const { data, isLoading } = useGetCrmAnalyticsQuery();
  const { data: users } = useGetUsersQuery();

  const ownerEmail = (id: string | null) =>
    id ? (users?.find((u) => u.id === id)?.email ?? id.slice(0, 8)) : 'Unassigned';
  const pctRate = (r: number) => `${(r * 100).toFixed(0)}%`;

  if (isLoading) return <Card loading />;
  if (!data) return <Empty description="No analytics yet" />;

  const o = data.overall;
  return (
    <>
      <Typography.Paragraph type="secondary">
        Business-development conversion funnel — created records, won/lost deals and win rate.
      </Typography.Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Organisations" value={o.organisations} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Opportunities" value={o.opportunities} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Won" value={o.won} suffix={`/ ${o.won + o.lost} closed`} />
          </Card>
        </Col>
        <Col xs={12} md={6}>
          <Card>
            <Statistic title="Win rate" value={pctRate(o.conversionRate)} />
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              Value won: {o.valueWon.toLocaleString()}
            </Typography.Text>
          </Card>
        </Col>
      </Row>

      <Typography.Title level={5} style={{ marginTop: 20 }}>
        By owner
      </Typography.Title>
      <Table
        rowKey={(r) => r.ownerUserId ?? 'unassigned'}
        pagination={false}
        dataSource={data.owners}
        columns={[
          {
            title: 'Owner',
            dataIndex: 'ownerUserId',
            render: (id: string | null) => ownerEmail(id),
          },
          { title: 'Organisations', dataIndex: 'organisations' },
          { title: 'Opportunities', dataIndex: 'opportunities' },
          { title: 'Won', dataIndex: 'won' },
          { title: 'Lost', dataIndex: 'lost' },
          {
            title: 'Value won',
            dataIndex: 'valueWon',
            render: (v: number) => v.toLocaleString(),
          },
          {
            title: 'Win rate',
            render: (_: unknown, r: CrmConversionMetrics) => pctRate(r.conversionRate),
          },
        ]}
      />
    </>
  );
}
