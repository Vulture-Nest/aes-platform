import { Card, Col, Row, Statistic, Table, Tag, Typography } from 'antd';
import { RESPONSE_STATUS_COLOR, money, num } from './marketing-constants';
import {
  RESPONSE_STATUSES,
  useGetMarketingAnalyticsQuery,
  type CampaignFunnel,
  type ChannelComparisonEntry,
  type LeaderboardEntry,
} from './marketingApi';

export function AnalyticsTab() {
  const { data, isLoading } = useGetMarketingAnalyticsQuery();

  const totalResponses = (data?.leaderboard ?? []).reduce((s, e) => s + e.totalResponses, 0);
  const totalSpend = (data?.leaderboard ?? []).reduce((s, e) => s + e.totalChannelCost, 0);
  const totalWon = (data?.leaderboard ?? []).reduce((s, e) => s + e.valueWon, 0);

  return (
    <>
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card size="small">
            <Statistic title="Total leads" value={totalResponses} loading={isLoading} />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic
              title="Total channel spend"
              value={totalSpend}
              precision={2}
              loading={isLoading}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small">
            <Statistic title="Value won" value={totalWon} precision={2} loading={isLoading} />
          </Card>
        </Col>
      </Row>

      <Card size="small" title="Funnel per campaign" style={{ marginBottom: 16 }}>
        <Table<CampaignFunnel>
          rowKey="campaignId"
          size="small"
          loading={isLoading}
          pagination={false}
          dataSource={data?.funnel}
          locale={{ emptyText: 'No campaigns' }}
          columns={[
            { title: 'Campaign', dataIndex: 'name' },
            ...RESPONSE_STATUSES.map((s) => ({
              title: (
                <Tag color={RESPONSE_STATUS_COLOR[s]} style={{ marginInlineEnd: 0 }}>
                  {s}
                </Tag>
              ),
              key: s,
              render: (_: unknown, r: CampaignFunnel) => r.byStatus[s] ?? 0,
            })),
            {
              title: 'Total',
              dataIndex: 'totalResponses',
              render: (v: number) => <strong>{v}</strong>,
            },
          ]}
        />
      </Card>

      <Card size="small" title="Leaderboard" style={{ marginBottom: 16 }}>
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          Cost per lead = total channel cost / leads. Value won = attributed WON opportunities.
        </Typography.Text>
        <Table<LeaderboardEntry>
          rowKey="campaignId"
          size="small"
          loading={isLoading}
          pagination={false}
          style={{ marginTop: 8 }}
          dataSource={data?.leaderboard}
          locale={{ emptyText: 'No campaigns' }}
          columns={[
            { title: 'Campaign', dataIndex: 'name' },
            {
              title: 'Channel cost',
              dataIndex: 'totalChannelCost',
              render: (v: number) => money(v),
            },
            { title: 'Leads', dataIndex: 'totalResponses' },
            {
              title: 'Cost per lead',
              dataIndex: 'costPerLead',
              render: (v: number | null) => (v === null ? '—' : money(v)),
            },
            { title: 'Value won', dataIndex: 'valueWon', render: (v: number) => money(v) },
          ]}
        />
      </Card>

      <Card size="small" title="Channel comparison (flier vs social)">
        <Table<ChannelComparisonEntry>
          rowKey="channelType"
          size="small"
          loading={isLoading}
          pagination={false}
          dataSource={data?.channelComparison}
          locale={{ emptyText: 'No channels' }}
          columns={[
            { title: 'Channel', dataIndex: 'channelType', render: (v: string) => <Tag>{v}</Tag> },
            { title: 'Total cost', dataIndex: 'totalCost', render: (v: number) => money(v) },
            { title: 'Responses', dataIndex: 'responses', render: (v: number) => num(v) },
            {
              title: 'Cost per response',
              dataIndex: 'costPerResponse',
              render: (v: number | null) => (v === null ? '—' : money(v)),
            },
          ]}
        />
      </Card>
    </>
  );
}
