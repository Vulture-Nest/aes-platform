import {
  ApartmentOutlined,
  BankOutlined,
  CheckCircleFilled,
  ExclamationCircleFilled,
  IdcardOutlined,
  RiseOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Card, Col, Empty, List, Row, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import {
  useGetAccountsQuery,
  useGetApprovalMatrixQuery,
  useGetAuditQuery,
  useGetDangerRulesQuery,
  useGetEmployeesQuery,
  useGetExchangeRatesQuery,
  useGetLookupsQuery,
  useGetSitesQuery,
  useGetStatutoryRatesQuery,
  useGetThresholdsQuery,
  useGetUsersQuery,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { ROLE_LABELS, type Role } from '../../rbac/roles';
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

  const userRows = users.data ?? [];
  const siteRows = sites.data ?? [];
  const accountRows = accounts.data ?? [];
  const employeeRows = employees.data ?? [];

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
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            icon={<TeamOutlined />}
            label="Users"
            value={userRows.length}
            accent={AES.green}
            loading={users.isLoading}
            sub={`${roleSegments.length} role${roleSegments.length === 1 ? '' : 's'} in use`}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            icon={<BankOutlined />}
            label="Sites"
            value={siteRows.length}
            accent="#2f7cb8"
            loading={sites.isLoading}
            sub={`${activeSites} active`}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            icon={<IdcardOutlined />}
            label="Employees"
            value={employeeRows.length}
            accent="#e9a13b"
            loading={employees.isLoading}
            sub={`${employeesByType.length} employment type${employeesByType.length === 1 ? '' : 's'}`}
          />
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <KpiCard
            icon={<WalletOutlined />}
            label="Ledger accounts"
            value={accountRows.length}
            accent="#8b5cf6"
            loading={accounts.isLoading}
            sub={`${accountsByCurrency.length} currenc${accountsByCurrency.length === 1 ? 'y' : 'ies'}`}
          />
        </Col>
      </Row>

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
