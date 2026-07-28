import {
  ApartmentOutlined,
  BankOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
  FileDoneOutlined,
  IdcardOutlined,
  RiseOutlined,
  ShoppingOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Card, Col, Empty, List, Row, Space, Statistic, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import {
  useGetAccountsQuery,
  useGetActiveAlertsQuery,
  useGetApprovalMatrixQuery,
  useGetAuditQuery,
  useGetCashPositionQuery,
  useGetContractsQuery,
  useGetDangerRulesQuery,
  useGetEmployeesQuery,
  useGetExchangeRatesQuery,
  useGetLookupsQuery,
  useGetOrdersQuery,
  useGetPerformanceQuery,
  useGetSitesQuery,
  useGetStatutoryRatesQuery,
  useGetThresholdsQuery,
  useGetUsersQuery,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { hasAnyRole, ROLE_LABELS, type Role } from '../../rbac/roles';
import { AES } from '../../theme';
import { PALETTE, type Segment } from './palette';
import { BarList, Donut, KpiCard, Legend, Sparkline } from './widgets';

const pretty = (s: string) =>
  s
    .replace(/[_-]+/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (m) => m.toUpperCase());

const countBy = <T,>(rows: T[], key: (r: T) => string): Segment[] => {
  const map = new Map<string, number>();
  rows.forEach((r) => {
    const k = key(r);
    map.set(k, (map.get(k) ?? 0) + 1);
  });
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: PALETTE[i % PALETTE.length] }));
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  LOGIN: 'default',
  APPROVE: 'green',
  REJECT: 'red',
};

const SEVERITY_COLOR: Record<string, string> = { DANGER: 'red', WATCH: 'gold', INFO: 'blue' };

// Roles the command-centre + alerts endpoints allow (see CommandCentreController).
const FINANCE_PULSE_ROLES: Role[] = [
  'FINANCE_OFFICER',
  'FINANCE_DIRECTOR',
  'OPS_DIRECTOR',
  'DIRECTOR',
  'SYS_ADMIN',
];

const fmtMoney = (n: number, ccy: string) => {
  const sign = n < 0 ? '-' : '';
  const symbol = ccy === 'USD' ? '$' : `${ccy} `;
  return `${sign}${symbol}${Math.abs(Math.round(n)).toLocaleString()}`;
};

export function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);
  const users = useGetUsersQuery();
  const sites = useGetSitesQuery();
  const rates = useGetExchangeRatesQuery();
  const statutory = useGetStatutoryRatesQuery();
  const thresholds = useGetThresholdsQuery();
  const accounts = useGetAccountsQuery();
  const employees = useGetEmployeesQuery();
  const matrix = useGetApprovalMatrixQuery();
  const dangerRules = useGetDangerRulesQuery();
  const lookups = useGetLookupsQuery('');
  const audit = useGetAuditQuery({ take: 8 });
  const orders = useGetOrdersQuery();
  const contracts = useGetContractsQuery();
  const performance = useGetPerformanceQuery();

  // Command-centre pulse (cash + danger alerts) — finance/director/admin only.
  const canSeeFinancePulse = hasAnyRole(user, FINANCE_PULSE_ROLES);
  const cashPosition = useGetCashPositionQuery(undefined, { skip: !canSeeFinancePulse });
  const activeAlerts = useGetActiveAlertsQuery(undefined, { skip: !canSeeFinancePulse });

  const userRows = users.data ?? [];
  const siteRows = sites.data ?? [];
  const accountRows = accounts.data ?? [];
  const employeeRows = employees.data ?? [];
  const orderRows = orders.data ?? [];
  const contractRows = contracts.data ?? [];
  const perf = performance.data;
  const servicedOrders = orderRows.filter((o) => o.serviced).length;
  const fmtUsd = (n: number) => `$${Math.round(n).toLocaleString()}`;
  const pct = (m: number | null) => (m === null ? '—' : `${(m * 100).toFixed(1)}%`);

  // Users by role (counts each role assignment).
  const roleSegments = countBy(
    userRows.flatMap((u) => u.siteRoles ?? u.roles ?? []),
    (sr) => ROLE_LABELS[sr.role as Role] ?? sr.role,
  );

  const sitesByType = countBy(siteRows, (s) => pretty(s.type));
  const employeesByType = countBy(employeeRows, (e) => pretty(e.employmentType));
  const accountsByCurrency = countBy(accountRows, (a) => a.currency);

  // Exchange-rate trend for the most-populated currency pair.
  const rateRows = rates.data ?? [];
  const pairFreq = countBy(rateRows, (r) => r.currencyPair);
  const mainPair = pairFreq[0]?.label ?? 'USD/ZWG';
  const pairSeries = rateRows
    .filter((r) => r.currencyPair === mainPair)
    .slice()
    .sort((a, b) => a.dateEffective.localeCompare(b.dateEffective));
  const ratePoints = pairSeries.map((r) => Number(r.officialRate)).filter((n) => !Number.isNaN(n));
  const latestRate = ratePoints[ratePoints.length - 1];
  const firstRate = ratePoints[0];
  const rateChange =
    latestRate && firstRate && firstRate !== 0 ? ((latestRate - firstRate) / firstRate) * 100 : 0;

  const dangerOn = (dangerRules.data ?? []).filter((r) => r.enabled).length;

  const configItems = [
    { label: 'Exchange rates', count: rateRows.length },
    { label: 'Statutory rates', count: statutory.data?.length ?? 0 },
    { label: 'Thresholds', count: thresholds.data?.length ?? 0 },
    { label: 'Approval rules', count: matrix.data?.length ?? 0 },
    { label: 'Ledger accounts', count: accountRows.length },
    { label: 'Danger rules enabled', count: dangerOn },
    { label: 'Configurable values', count: lookups.data?.length ?? 0 },
  ];

  const activeSites = siteRows.filter((s) => s.active).length;

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Configuration overview
        </Typography.Title>
        <Typography.Text type="secondary">
          Signed in as <strong>{user?.email}</strong>
          {user?.roles.map((r) => (
            <Tag key={`${r.siteId}-${r.role}`} color="green" style={{ marginLeft: 8 }}>
              {ROLE_LABELS[r.role]}
              {r.siteId ? '' : ' · global'}
            </Tag>
          ))}
        </Typography.Text>
      </div>

      {/* KPI row */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} xl={4}>
          <KpiCard
            icon={<TeamOutlined />}
            label="Users"
            value={userRows.length}
            accent={AES.green}
            loading={users.isLoading}
            sub={`${roleSegments.length} role${roleSegments.length === 1 ? '' : 's'} in use`}
          />
        </Col>
        <Col xs={24} sm={12} xl={4}>
          <KpiCard
            icon={<BankOutlined />}
            label="Sites"
            value={siteRows.length}
            accent="#2f7cb8"
            loading={sites.isLoading}
            sub={`${activeSites} active`}
          />
        </Col>
        <Col xs={24} sm={12} xl={4}>
          <KpiCard
            icon={<IdcardOutlined />}
            label="Employees"
            value={employeeRows.length}
            accent="#e9a13b"
            loading={employees.isLoading}
            sub={`${employeesByType.length} employment type${employeesByType.length === 1 ? '' : 's'}`}
          />
        </Col>
        <Col xs={24} sm={12} xl={4}>
          <KpiCard
            icon={<WalletOutlined />}
            label="Ledger accounts"
            value={accountRows.length}
            accent="#8b5cf6"
            loading={accounts.isLoading}
            sub={`${accountsByCurrency.length} currenc${accountsByCurrency.length === 1 ? 'y' : 'ies'}`}
          />
        </Col>
        <Col xs={24} sm={12} xl={4}>
          <KpiCard
            icon={<ShoppingOutlined />}
            label="Orders"
            value={orderRows.length}
            accent="#14b8a6"
            loading={orders.isLoading}
            sub={`${servicedOrders} serviced`}
          />
        </Col>
        <Col xs={24} sm={12} xl={4}>
          <KpiCard
            icon={<FileDoneOutlined />}
            label="Contracts"
            value={contractRows.length}
            accent="#e5636b"
            loading={contracts.isLoading}
            sub={perf ? `${fmtUsd(perf.bookedOrderValue)} order book` : 'client agreements'}
          />
        </Col>
      </Row>

      {/* Command-centre pulse: cash position + danger alerts (finance/admin only) */}
      {canSeeFinancePulse && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} lg={13}>
            <Card
              title={
                <>
                  <WalletOutlined /> Cash position
                </>
              }
              loading={cashPosition.isLoading}
              style={{ height: '100%' }}
              extra={
                cashPosition.data?.asOf ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    as of {dayjs(cashPosition.data.asOf).format('DD MMM HH:mm')}
                  </Typography.Text>
                ) : null
              }
            >
              <Space size={24} wrap style={{ marginBottom: 12 }}>
                {Object.entries(cashPosition.data?.totals ?? {}).map(([ccy, total]) => (
                  <Statistic
                    key={ccy}
                    title={`${ccy} cash on hand`}
                    value={fmtMoney(total, ccy)}
                    valueStyle={{ fontSize: 22, color: total < 0 ? '#e5636b' : AES.green }}
                  />
                ))}
              </Space>
              {cashPosition.data?.accounts?.length ? (
                <List
                  size="small"
                  dataSource={cashPosition.data.accounts}
                  renderItem={(a) => (
                    <List.Item style={{ paddingInline: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                        <span style={{ flex: 1, fontSize: 13 }}>{a.name}</span>
                        <Tag style={{ marginInlineEnd: 0 }}>{a.type}</Tag>
                        <span
                          style={{
                            width: 120,
                            textAlign: 'right',
                            fontWeight: 600,
                            color: a.balance < 0 ? '#e5636b' : '#1f2937',
                          }}
                        >
                          {fmtMoney(a.balance, a.currency)}
                        </span>
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="No cash accounts" />
              )}
            </Card>
          </Col>
          <Col xs={24} lg={11}>
            <Card
              title={
                <>
                  <ExclamationCircleFilled style={{ color: '#e9a13b' }} /> Danger alerts
                </>
              }
              loading={activeAlerts.isLoading}
              style={{ height: '100%' }}
              extra={
                <Tag color={(activeAlerts.data?.length ?? 0) > 0 ? 'red' : 'green'}>
                  {activeAlerts.data?.length ?? 0} active
                </Tag>
              }
            >
              {activeAlerts.data?.length ? (
                <List
                  size="small"
                  dataSource={[...activeAlerts.data].sort((a, b) => b.raisedAt.localeCompare(a.raisedAt))}
                  renderItem={(al) => (
                    <List.Item style={{ paddingInline: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%' }}>
                        <Tag color={SEVERITY_COLOR[al.severity] ?? 'default'} style={{ marginInlineEnd: 0 }}>
                          {al.severity}
                        </Tag>
                        <span style={{ flex: 1, fontSize: 13 }}>{al.message}</span>
                        <span style={{ fontSize: 12, color: '#9aa4af', whiteSpace: 'nowrap' }}>
                          {dayjs(al.raisedAt).format('DD MMM HH:mm')}
                        </span>
                      </div>
                    </List.Item>
                  )}
                />
              ) : (
                <Empty description="No active alerts" />
              )}
            </Card>
          </Col>
        </Row>
      )}

      {/* Revenue & profit */}
      <Card
        title="Revenue & profit"
        style={{ marginTop: 16 }}
        extra={
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            USD · revenue recognised when an order is serviced
          </Typography.Text>
        }
        loading={performance.isLoading}
      >
        {perf ? (
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} md={7}>
              <div
                style={{
                  background: perf.operatingProfit >= 0 ? '#f4faf0' : '#fdf1f0',
                  border: `1px solid ${perf.operatingProfit >= 0 ? '#dcefcf' : '#f3d4d0'}`,
                  borderRadius: 10,
                  padding: '14px 16px',
                }}
              >
                <div style={{ fontSize: 13, color: '#6b7280' }}>Operating profit</div>
                <div
                  style={{
                    fontSize: 30,
                    fontWeight: 700,
                    color: perf.operatingProfit >= 0 ? AES.green : '#e5636b',
                    lineHeight: 1.2,
                  }}
                >
                  {fmtUsd(perf.operatingProfit)}
                </div>
                <Tag color={perf.operatingProfit >= 0 ? 'green' : 'red'} style={{ marginTop: 4 }}>
                  <RiseOutlined /> {pct(perf.margin)} margin
                </Tag>
              </div>
            </Col>
            <Col xs={24} md={17}>
              <Row gutter={[16, 16]}>
                <Col xs={12} md={8}>
                  <Statistic
                    title="Recognised revenue"
                    value={fmtUsd(perf.income)}
                    valueStyle={{ fontSize: 22 }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {perf.servicedOrderCount} serviced · claims {fmtUsd(perf.claimsIncome)}
                  </Typography.Text>
                </Col>
                <Col xs={12} md={8}>
                  <Statistic
                    title="Expenses"
                    value={fmtUsd(perf.expenses)}
                    valueStyle={{ fontSize: 22 }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    order {fmtUsd(perf.expenseBreakdown.order)} · gen{' '}
                    {fmtUsd(perf.expenseBreakdown.general)} · o/h{' '}
                    {fmtUsd(perf.expenseBreakdown.overheads)} · loan{' '}
                    {fmtUsd(perf.expenseBreakdown.loanInterest)}
                  </Typography.Text>
                </Col>
                <Col xs={12} md={8}>
                  <Statistic
                    title="Booked order value"
                    value={fmtUsd(perf.bookedOrderValue)}
                    valueStyle={{ fontSize: 22 }}
                  />
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    {perf.orderCount} orders (pipeline)
                  </Typography.Text>
                </Col>
              </Row>
            </Col>
          </Row>
        ) : (
          <Empty description="No revenue data yet" />
        )}
      </Card>

      {/* Trend + role donut */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={15}>
          <Card
            title={`Exchange rate trend — ${mainPair}`}
            styles={{ body: { paddingTop: 12 } }}
          >
            {ratePoints.length >= 2 ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 4 }}>
                  <span style={{ fontSize: 30, fontWeight: 700 }}>{latestRate.toFixed(4)}</span>
                  <Tag
                    color={rateChange >= 0 ? 'red' : 'green'}
                    style={{ marginInlineEnd: 0 }}
                  >
                    <RiseOutlined /> {rateChange >= 0 ? '+' : ''}
                    {rateChange.toFixed(1)}% over period
                  </Tag>
                </div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  Official rate across {ratePoints.length} entries
                </Typography.Text>
                <div style={{ marginTop: 8 }}>
                  <Sparkline points={ratePoints} />
                </div>
              </>
            ) : latestRate ? (
              <div style={{ padding: '20px 0' }}>
                <span style={{ fontSize: 34, fontWeight: 700 }}>{latestRate.toFixed(4)}</span>
                <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                  Latest official rate for {mainPair}. Add more dated entries to see a trend line.
                </Typography.Paragraph>
              </div>
            ) : (
              <Empty description="No exchange rates recorded yet" />
            )}
          </Card>
        </Col>
        <Col xs={24} lg={9}>
          <Card title="Team by role">
            {roleSegments.length > 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
                <Donut segments={roleSegments} centerLabel="role assignments" />
                <div style={{ flex: 1, minWidth: 150 }}>
                  <Legend segments={roleSegments} />
                </div>
              </div>
            ) : (
              <Empty description="No users yet" />
            )}
          </Card>
        </Col>
      </Row>

      {/* Breakdown bars */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={8}>
          <Card title="Sites by type" style={{ height: '100%' }}>
            <BarList items={sitesByType} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Employees by type" style={{ height: '100%' }}>
            <BarList items={employeesByType} />
          </Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Ledger by currency" style={{ height: '100%' }}>
            <BarList items={accountsByCurrency} />
          </Card>
        </Col>
      </Row>

      {/* Config health + recent activity */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} lg={13}>
          <Card title="Configuration health" style={{ height: '100%' }}>
            <Row gutter={[12, 12]}>
              {configItems.map((it) => {
                const ok = it.count > 0;
                return (
                  <Col xs={24} sm={12} key={it.label}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '10px 12px',
                        borderRadius: 8,
                        background: ok ? '#f4faf0' : '#fbf7f0',
                        border: `1px solid ${ok ? '#dcefcf' : '#f0e3c9'}`,
                      }}
                    >
                      {ok ? (
                        <CheckCircleFilled style={{ color: AES.green, fontSize: 18 }} />
                      ) : (
                        <ExclamationCircleFilled style={{ color: '#e9a13b', fontSize: 18 }} />
                      )}
                      <span style={{ flex: 1, fontSize: 13, color: '#4b5563' }}>{it.label}</span>
                      <strong>{it.count}</strong>
                    </div>
                  </Col>
                );
              })}
            </Row>
          </Card>
        </Col>
        <Col xs={24} lg={11}>
          <Card
            title="Recent activity"
            styles={{ body: { padding: '8px 16px' } }}
            style={{ height: '100%' }}
          >
            {audit.data?.items?.length ? (
              <List
                size="small"
                dataSource={audit.data.items}
                renderItem={(a) => (
                  <List.Item style={{ paddingInline: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%' }}>
                      <Tag color={ACTION_COLORS[a.action] ?? 'default'} style={{ marginInlineEnd: 0 }}>
                        {a.action}
                      </Tag>
                      <ApartmentOutlined style={{ color: '#c0c8d0' }} />
                      <span style={{ flex: 1, fontSize: 13 }}>{pretty(a.tableName)}</span>
                      <span style={{ fontSize: 12, color: '#9aa4af' }}>
                        {dayjs(a.createdAt).format('DD MMM HH:mm')}
                      </span>
                    </div>
                  </List.Item>
                )}
              />
            ) : (
              <Empty description="No activity recorded yet" />
            )}
          </Card>
        </Col>
      </Row>
    </>
  );
}
