import { RiseOutlined } from '@ant-design/icons';
import { Alert, Card, Col, Descriptions, Row, Spin, Statistic, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useGetCommandCentreQuery } from '../../api/api';

const MONEY_KEYS =
  /(amount|value|total|expected|exposure|outstanding|position|due|paid|balance|income|profit|expense|obligation|cash|overhead|requisition|payroll|receivable|shortfall|interest|principal|inflow|outflow|\bnet\b|burn|accrued)/i;
const RATIO_KEYS = /(ratio|margin|coverage)/i;
// Counts are never money, even when the key also contains a money-ish word.
const COUNT_KEYS = /(count|items|number)/i;

const humanizeKey = (k: string) =>
  k
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b(usd|zwg|zar|vat|paye)\b/gi, (m) => m.toUpperCase())
    .replace(/^./, (c) => c.toUpperCase());

const isIsoDate = (s: string) => /^\d{4}-\d{2}-\d{2}T/.test(s);

/** Format a scalar for display: money with $, ratios raw, dates friendly, booleans Yes/No. */
function fmtScalar(key: string, v: unknown): string {
  if (v == null) return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'number') {
    if (COUNT_KEYS.test(key)) return v.toLocaleString();
    if (RATIO_KEYS.test(key)) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
    if (MONEY_KEYS.test(key)) return `$${Math.round(v).toLocaleString()}`;
    return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  }
  if (typeof v === 'string') return isIsoDate(v) ? dayjs(v).format('DD MMM, HH:mm') : v;
  return String(v);
}

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

/**
 * Friendly render of any panel: humanised labels, formatted values, and nested
 * objects inlined (e.g. "Overheads $120 · Requisitions $500") — no raw dumps.
 */
function PanelBody({ data }: { data: unknown }) {
  if (data == null || typeof data !== 'object') {
    return <Typography.Text type="secondary">{String(data)}</Typography.Text>;
  }
  const obj = data as Record<string, unknown>;
  const rows: { label: string; value: string }[] = [];
  let asOf: string | undefined;

  for (const [k, v] of Object.entries(obj)) {
    if (k === 'panel') continue;
    if (k === 'asOf' && typeof v === 'string') {
      asOf = v;
      continue;
    }
    if (Array.isArray(v)) {
      rows.push({ label: humanizeKey(k), value: `${v.length} item${v.length === 1 ? '' : 's'}` });
    } else if (v != null && typeof v === 'object') {
      const inner = Object.entries(v as Record<string, unknown>)
        .filter(([, iv]) => iv == null || typeof iv !== 'object')
        .map(([ik, iv]) => `${humanizeKey(ik)} ${fmtScalar(ik, iv)}`)
        .join(' · ');
      if (inner) rows.push({ label: humanizeKey(k), value: inner });
    } else {
      rows.push({ label: humanizeKey(k), value: fmtScalar(k, v) });
    }
  }

  return (
    <>
      <Descriptions size="small" column={1}>
        {rows.map((r) => (
          <Descriptions.Item key={r.label} label={r.label}>
            {r.value}
          </Descriptions.Item>
        ))}
      </Descriptions>
      {asOf && (
        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
          as of {dayjs(asOf).format('DD MMM, HH:mm')}
        </Typography.Text>
      )}
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
                <PanelBody data={panel} />
              )}
            </Card>
          </Col>
        ))}
      </Row>
    </>
  );
}
