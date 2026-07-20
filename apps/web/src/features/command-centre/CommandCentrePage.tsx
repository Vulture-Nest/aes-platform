import { RiseOutlined } from '@ant-design/icons';
import { Alert, Card, Col, Descriptions, Row, Spin, Statistic, Tag, Typography } from 'antd';
import { useGetCommandCentreQuery } from '../../api/api';

const PANEL_TITLES: Record<string, string> = {
  cashPosition: 'Cash Position',
  moneyInOut: 'Money In vs Out',
  debtInterest: 'Debt & Interest Watch',
  coverage: 'Coverage Ratio',
  receivablesAgeing: 'Receivables Ageing',
  taxExposure: 'Tax Exposure',
  pendingObligations: 'Pending Obligations',
  healthVerdict: 'Health Verdict',
};

const VERDICT_COLOR: Record<string, string> = { HEALTHY: 'green', WATCH: 'gold', ACT: 'red' };

interface Perf {
  currency: string;
  bookedOrderValue: number;
  income: number;
  expenses: number;
  operatingProfit: number;
  margin: number | null;
  servicedOrderCount: number;
  orderCount: number;
}

const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString()}`;
const pct = (m: number | null) => (m === null ? '—' : `${(m * 100).toFixed(1)}%`);

/** Prominent revenue/profit card (Appendix A operating-profit model). */
function RevenueProfitCard({ perf }: { perf: Perf }) {
  const positive = perf.operatingProfit >= 0;
  return (
    <Card
      title="Revenue & Profit"
      style={{ marginBottom: 16 }}
      extra={
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {perf.currency} · revenue recognised when an order is serviced
        </Typography.Text>
      }
    >
      <Row gutter={[16, 16]} align="middle">
        <Col xs={24} md={7}>
          <div
            style={{
              background: positive ? '#f4faf0' : '#fdf1f0',
              border: `1px solid ${positive ? '#dcefcf' : '#f3d4d0'}`,
              borderRadius: 10,
              padding: '14px 16px',
            }}
          >
            <div style={{ fontSize: 13, color: '#6b7280' }}>Operating profit</div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: positive ? '#6DBE45' : '#e5636b',
                lineHeight: 1.2,
              }}
            >
              {fmtUsd(perf.operatingProfit)}
            </div>
            <Tag color={positive ? 'green' : 'red'} style={{ marginTop: 4 }}>
              <RiseOutlined /> {pct(perf.margin)} margin
            </Tag>
          </div>
        </Col>
        <Col xs={12} md={5}>
          <Statistic title="Recognised revenue" value={fmtUsd(perf.income)} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {perf.servicedOrderCount} serviced
          </Typography.Text>
        </Col>
        <Col xs={12} md={5}>
          <Statistic title="Expenses" value={fmtUsd(perf.expenses)} />
        </Col>
        <Col xs={12} md={7}>
          <Statistic title="Booked order value" value={fmtUsd(perf.bookedOrderValue)} />
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {perf.orderCount} orders (pipeline)
          </Typography.Text>
        </Col>
      </Row>
    </Card>
  );
}

/** Render the primitive (scalar) fields of a panel object as a description list. */
function Scalars({ data }: { data: unknown }) {
  if (data == null || typeof data !== 'object') {
    return <Typography.Text type="secondary">{String(data)}</Typography.Text>;
  }
  const entries = Object.entries(data as Record<string, unknown>).filter(
    ([, v]) => v == null || typeof v !== 'object',
  );
  const nested = Object.entries(data as Record<string, unknown>).filter(
    ([, v]) => v != null && typeof v === 'object',
  );
  return (
    <>
      {entries.length > 0 && (
        <Descriptions size="small" column={1}>
          {entries.map(([k, v]) => (
            <Descriptions.Item key={k} label={k}>
              {String(v)}
            </Descriptions.Item>
          ))}
        </Descriptions>
      )}
      {nested.map(([k, v]) => (
        <Typography.Text key={k} type="secondary" style={{ display: 'block' }}>
          {k}: {Array.isArray(v) ? `${(v as unknown[]).length} item(s)` : 'details'}
        </Typography.Text>
      ))}
    </>
  );
}

export function CommandCentrePage() {
  const { data, isLoading, isError } = useGetCommandCentreQuery();

  if (isLoading) return <Spin size="large" />;
  if (isError || !data) return <Alert type="error" message="Could not load the command centre" />;

  const verdict = (data.healthVerdict as { verdict?: string })?.verdict;
  const performance = data.performance as (Perf & { error?: boolean }) | undefined;

  return (
    <>
      <Typography.Title level={3}>
        Business Health Command Centre{' '}
        {verdict && <Tag color={VERDICT_COLOR[verdict] ?? 'default'}>{verdict}</Tag>}
      </Typography.Title>
      {performance && !performance.error && <RevenueProfitCard perf={performance} />}
      <Row gutter={[16, 16]}>
        {Object.entries(data)
          .filter(([key]) => key !== 'performance')
          .map(([key, panel]) => (
          <Col key={key} xs={24} md={12} lg={8}>
            <Card
              size="small"
              title={PANEL_TITLES[key] ?? key}
              styles={{ body: { minHeight: 120 } }}
            >
              {(panel as { error?: string })?.error ? (
                <Typography.Text type="warning">Panel unavailable</Typography.Text>
              ) : (
                <Scalars data={panel} />
              )}
            </Card>
          </Col>
        ))}
      </Row>
    </>
  );
}
