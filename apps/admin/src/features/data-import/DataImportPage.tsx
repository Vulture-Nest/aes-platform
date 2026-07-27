import {
  CheckCircleTwoTone,
  CloseCircleTwoTone,
  CloudUploadOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  Result,
  Row,
  Segmented,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import {
  useGetParityQuery,
  useImportWorkbookMutation,
  type ImportWhich,
  type ParityCheck,
  type TableCounts,
} from './dataImportApi';

const { Title, Text, Paragraph } = Typography;

const money = (v: number) =>
  `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const WHICH_OPTIONS: { label: string; value: ImportWhich }[] = [
  { label: 'All workbooks', value: 'all' },
  { label: 'Cashflow (P1)', value: 'cashflow' },
  { label: 'Payroll (P2)', value: 'payroll' },
  { label: 'Manhours (P3)', value: 'manhours' },
];

interface PerTableRow {
  table: string;
  created: number;
  updated: number;
}

function ImportSection() {
  const { message } = App.useApp();
  const [which, setWhich] = useState<ImportWhich>('all');
  const [importWorkbook, { data, isLoading }] = useImportWorkbookMutation();

  const runImport = async () => {
    try {
      const res = await importWorkbook({ which }).unwrap();
      const totalCreated = Object.values(res.perTable).reduce((a, t) => a + t.created, 0);
      const totalUpdated = Object.values(res.perTable).reduce((a, t) => a + t.updated, 0);
      message.success(
        `Import complete — ${totalCreated} created, ${totalUpdated} updated across ${Object.keys(res.perTable).length} tables.`,
      );
    } catch {
      message.error('Import failed. Check the API logs.');
    }
  };

  const rows: PerTableRow[] = data
    ? Object.entries(data.perTable).map(([table, c]: [string, TableCounts]) => ({
        table,
        created: c.created,
        updated: c.updated,
      }))
    : [];

  const totalCreated = rows.reduce((a, r) => a + r.created, 0);
  const totalUpdated = rows.reduce((a, r) => a + r.updated, 0);

  return (
    <Card
      title={
        <Space>
          <CloudUploadOutlined style={{ color: '#1677ff' }} />
          <span>Import workbook</span>
        </Space>
      }
      extra={
        <Button
          type="primary"
          size="large"
          icon={<ThunderboltOutlined />}
          loading={isLoading}
          onClick={runImport}
        >
          Import
        </Button>
      }
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        Idempotent upsert of the operational workbooks shipped in <Text code>docs/</Text> into the
        live financial &amp; HR tables. Re-running never duplicates rows.
      </Paragraph>
      <Segmented
        options={WHICH_OPTIONS}
        value={which}
        onChange={(v) => setWhich(v as ImportWhich)}
        size="large"
        block
        style={{ marginBottom: 16 }}
      />

      {data && (
        <>
          <Row gutter={16} style={{ marginBottom: 16 }}>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Rows created" value={totalCreated} valueStyle={{ color: '#52c41a' }} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Rows updated" value={totalUpdated} valueStyle={{ color: '#1677ff' }} />
              </Card>
            </Col>
            <Col span={8}>
              <Card size="small">
                <Statistic title="Tables touched" value={rows.length} />
              </Card>
            </Col>
          </Row>

          <Table<PerTableRow>
            rowKey="table"
            size="small"
            pagination={false}
            dataSource={rows}
            columns={[
              { title: 'Table', dataIndex: 'table', key: 'table', render: (t: string) => <Text strong>{t}</Text> },
              {
                title: 'Created',
                dataIndex: 'created',
                key: 'created',
                align: 'right',
                render: (n: number) => (n > 0 ? <Tag color="green">+{n}</Tag> : <Text type="secondary">0</Text>),
              },
              {
                title: 'Updated',
                dataIndex: 'updated',
                key: 'updated',
                align: 'right',
                render: (n: number) => (n > 0 ? <Tag color="blue">{n}</Tag> : <Text type="secondary">0</Text>),
              },
            ]}
          />

          {data.errors.length > 0 && (
            <Alert
              style={{ marginTop: 16 }}
              type="warning"
              showIcon
              message="Best-effort imports reported issues"
              description={
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {data.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              }
            />
          )}
        </>
      )}
    </Card>
  );
}

function VerdictBanner({
  verdict,
  verdictExpected,
  verdictPass,
}: {
  verdict: string;
  verdictExpected: string;
  verdictPass: boolean;
}) {
  return (
    <Card
      style={{
        marginBottom: 16,
        background: verdictPass ? 'rgba(82,196,26,0.08)' : 'rgba(255,77,79,0.08)',
        border: `1px solid ${verdictPass ? '#b7eb8f' : '#ffccc7'}`,
      }}
    >
      <Row align="middle" justify="space-between" gutter={16}>
        <Col>
          <Space direction="vertical" size={2}>
            <Text type="secondary">Health verdict</Text>
            <Space size="large" align="baseline">
              <Tag
                color={verdictPass ? 'success' : 'error'}
                style={{ fontSize: 22, padding: '6px 18px', margin: 0, fontWeight: 700 }}
              >
                {verdict} {verdictPass ? '✓' : '✗'}
              </Tag>
              <Text type="secondary">
                expected <Text strong>{verdictExpected}</Text>
              </Text>
            </Space>
          </Space>
        </Col>
        <Col>
          {verdictPass ? (
            <CheckCircleTwoTone twoToneColor="#52c41a" style={{ fontSize: 48 }} />
          ) : (
            <CloseCircleTwoTone twoToneColor="#ff4d4f" style={{ fontSize: 48 }} />
          )}
        </Col>
      </Row>
    </Card>
  );
}

function ParitySection() {
  const { data, isLoading, isFetching, refetch } = useGetParityQuery();

  return (
    <Card
      title={
        <Space>
          <CheckCircleTwoTone twoToneColor="#52c41a" />
          <span>Migration parity (Appendix A.10)</span>
        </Space>
      }
      extra={
        <Button icon={<ReloadOutlined />} loading={isFetching} onClick={() => refetch()}>
          Re-run
        </Button>
      }
      loading={isLoading}
    >
      <Paragraph type="secondary" style={{ marginTop: 0 }}>
        Recomputes the FinancialSummary headline figures via the same Command Centre panels the
        executive dashboard uses and asserts they match the workbook within{' '}
        <Text strong>${data?.tolerance ?? 1}</Text>.
      </Paragraph>

      {data && (
        <>
          <VerdictBanner
            verdict={data.verdict}
            verdictExpected={data.verdictExpected}
            verdictPass={data.verdictPass}
          />

          <Table<ParityCheck>
            rowKey="name"
            size="middle"
            pagination={false}
            dataSource={data.checks}
            style={{ marginBottom: 16 }}
            columns={[
              { title: 'Check', dataIndex: 'name', key: 'name', render: (t: string) => <Text strong>{t}</Text> },
              {
                title: 'Expected',
                dataIndex: 'expected',
                key: 'expected',
                align: 'right',
                render: (v: number) => <Text type="secondary">{money(v)}</Text>,
              },
              {
                title: 'Actual',
                dataIndex: 'actual',
                key: 'actual',
                align: 'right',
                render: (v: number) => money(v),
              },
              {
                title: 'Delta',
                dataIndex: 'delta',
                key: 'delta',
                align: 'right',
                render: (v: number) => (
                  <Text type={Math.abs(v) <= (data.tolerance ?? 1) ? 'secondary' : 'danger'}>
                    {v > 0 ? '+' : ''}
                    {money(v)}
                  </Text>
                ),
              },
              {
                title: 'Status',
                dataIndex: 'pass',
                key: 'pass',
                align: 'center',
                render: (pass: boolean) =>
                  pass ? <Tag color="success">PASS</Tag> : <Tag color="error">FAIL</Tag>,
              },
            ]}
            summary={(rows) => {
              const failing = rows.filter((r) => !r.pass).length;
              return (
                <Table.Summary.Row>
                  <Table.Summary.Cell index={0} colSpan={4}>
                    <Text strong>{rows.length} checks</Text>
                  </Table.Summary.Cell>
                  <Table.Summary.Cell index={4} align="center">
                    {failing === 0 ? (
                      <Tag color="success">ALL PASS</Tag>
                    ) : (
                      <Tag color="error">{failing} FAILING</Tag>
                    )}
                  </Table.Summary.Cell>
                </Table.Summary.Row>
              );
            }}
          />

          <Result
            status={data.allPass ? 'success' : 'error'}
            title={data.allPass ? 'Migration parity achieved' : 'Parity mismatch detected'}
            subTitle={
              data.allPass
                ? 'Every FinancialSummary figure and the health verdict reproduce the workbook within tolerance. Safe to migrate.'
                : 'One or more recomputed figures diverge from the workbook. Review the failing checks above before migrating.'
            }
          />
        </>
      )}
    </Card>
  );
}

export function DataImportPage() {
  return (
    <div style={{ maxWidth: 1100 }}>
      <Space direction="vertical" size={4} style={{ marginBottom: 16 }}>
        <Title level={3} style={{ margin: 0 }}>
          Data Import &amp; Migration Parity
        </Title>
        <Text type="secondary">
          Import the operational workbooks and rehearse the migration-parity checks (spec Appendix
          A.10).
        </Text>
      </Space>

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <ImportSection />
        <ParitySection />
      </Space>
    </div>
  );
}

export default DataImportPage;
