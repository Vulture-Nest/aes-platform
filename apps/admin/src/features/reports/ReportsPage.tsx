import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined, FileTextOutlined } from '@ant-design/icons';
import { App, Button, Card, Col, DatePicker, Input, Row, Select, Space, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useGetPayrollRunsQuery } from '../../api/api';
import { downloadFile } from '../../api/download';
import { LookupSelect } from '../../components/LookupSelect';

/** Small hook: runs an async download with a per-button loading flag + error toast. */
function useDownload() {
  const { message } = App.useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, path: string, fallback: string) => {
    setBusy(key);
    try {
      await downloadFile(path, fallback);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  };
  return { busy, run };
}

function FinancialSummaryCard() {
  const { busy, run } = useDownload();
  const [currency, setCurrency] = useState<string | undefined>();
  const [asOf, setAsOf] = useState<dayjs.Dayjs | null>(null);

  const go = () => {
    const qs = new URLSearchParams();
    if (currency) qs.set('currency', currency);
    if (asOf) qs.set('asOf', asOf.toISOString());
    const q = qs.toString();
    run('fin', `v1/reports/financial-summary${q ? `?${q}` : ''}`, 'financial-summary.xlsx');
  };

  return (
    <Card
      title={
        <Space>
          <FileExcelOutlined style={{ color: '#1f7a3d' }} />
          Financial summary
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">
        Income, expense breakdown, operating profit & margin (P&amp;L) — XLSX.
      </Typography.Paragraph>
      <Space wrap>
        <LookupSelect
          category="currency"
          allowClear
          placeholder="Currency (default USD)"
          style={{ width: 180 }}
          value={currency}
          onChange={(v) => setCurrency(v as string | undefined)}
        />
        <DatePicker placeholder="As of (default today)" value={asOf} onChange={setAsOf} />
        <Button type="primary" icon={<DownloadOutlined />} loading={busy === 'fin'} onClick={go}>
          Download
        </Button>
      </Space>
    </Card>
  );
}

function CashflowCard() {
  const { busy, run } = useDownload();
  const [win, setWin] = useState('month');
  const [currency, setCurrency] = useState<string | undefined>();

  const go = () => {
    const qs = new URLSearchParams({ window: win });
    if (currency) qs.set('currency', currency);
    run('cash', `v1/reports/cashflow?${qs.toString()}`, `cashflow-${win}.xlsx`);
  };

  return (
    <Card
      title={
        <Space>
          <FileExcelOutlined style={{ color: '#1f7a3d' }} />
          Cashflow
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">
        Money in / out bucketed by period, with net — XLSX.
      </Typography.Paragraph>
      <Space wrap>
        <Select
          value={win}
          style={{ width: 140 }}
          onChange={setWin}
          options={[
            { label: 'By day', value: 'day' },
            { label: 'By week', value: 'week' },
            { label: 'By month', value: 'month' },
          ]}
        />
        <LookupSelect
          category="currency"
          allowClear
          placeholder="Currency (default USD)"
          style={{ width: 180 }}
          value={currency}
          onChange={(v) => setCurrency(v as string | undefined)}
        />
        <Button type="primary" icon={<DownloadOutlined />} loading={busy === 'cash'} onClick={go}>
          Download
        </Button>
      </Space>
    </Card>
  );
}

function PayrollCard() {
  const { busy, run } = useDownload();
  const { data: runs, isLoading } = useGetPayrollRunsQuery();
  const [runId, setRunId] = useState<string | undefined>();

  return (
    <Card
      title={
        <Space>
          <FilePdfOutlined style={{ color: '#b23b3b' }} />
          Payroll exports
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">
        Payslips (PDF) and the Sage-ready journal (CSV) for a payroll run.
      </Typography.Paragraph>
      <Space wrap>
        <Select
          style={{ width: 260 }}
          loading={isLoading}
          placeholder="Select a payroll run"
          value={runId}
          onChange={setRunId}
          notFoundContent="No payroll runs yet"
          options={(runs ?? []).map((r) => ({
            label: `${r.month} — ${r.status}`,
            value: r.id,
          }))}
        />
        <Button
          icon={<FilePdfOutlined />}
          disabled={!runId}
          loading={busy === 'payslips'}
          onClick={() =>
            run('payslips', `v1/reports/payroll/${runId}/payslips`, 'payslips.pdf')
          }
        >
          Payslips PDF
        </Button>
        <Button
          icon={<FileTextOutlined />}
          disabled={!runId}
          loading={busy === 'sage'}
          onClick={() =>
            run('sage', `v1/reports/payroll/${runId}/sage-journal`, 'sage-journal.csv')
          }
        >
          Sage journal CSV
        </Button>
      </Space>
    </Card>
  );
}

function ManhoursCard() {
  const { busy, run } = useDownload();
  const [periodId, setPeriodId] = useState('');

  return (
    <Card
      title={
        <Space>
          <FileExcelOutlined style={{ color: '#1f7a3d' }} />
          Timesheet man-hours
        </Space>
      }
    >
      <Typography.Paragraph type="secondary">
        Per-employee man-hour totals for a timesheet period — XLSX. Enter the period id.
      </Typography.Paragraph>
      <Space wrap>
        <Input
          placeholder="Timesheet period id"
          style={{ width: 320 }}
          value={periodId}
          onChange={(e) => setPeriodId(e.target.value.trim())}
        />
        <Button
          type="primary"
          icon={<DownloadOutlined />}
          disabled={!periodId}
          loading={busy === 'manhours'}
          onClick={() =>
            run('manhours', `v1/reports/timesheets/${periodId}/manhours`, 'manhours.xlsx')
          }
        >
          Download
        </Button>
      </Space>
    </Card>
  );
}

export function ReportsPage() {
  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Reports &amp; exports
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Download financial, payroll and timesheet reports. Payroll exports are audited.
      </Typography.Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <FinancialSummaryCard />
        </Col>
        <Col xs={24} lg={12}>
          <CashflowCard />
        </Col>
        <Col xs={24} lg={12}>
          <PayrollCard />
        </Col>
        <Col xs={24} lg={12}>
          <ManhoursCard />
        </Col>
      </Row>
    </>
  );
}
