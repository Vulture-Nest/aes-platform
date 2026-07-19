import { Alert, Card, Col, Descriptions, Row, Spin, Tag, Typography } from 'antd';
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

  return (
    <>
      <Typography.Title level={3}>
        Business Health Command Centre{' '}
        {verdict && <Tag color={VERDICT_COLOR[verdict] ?? 'default'}>{verdict}</Tag>}
      </Typography.Title>
      <Row gutter={[16, 16]}>
        {Object.entries(data).map(([key, panel]) => (
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
