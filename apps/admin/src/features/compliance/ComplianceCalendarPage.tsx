import { CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Form,
  Input,
  Modal,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  useGenerateComplianceFromRunMutation,
  useGetComplianceObligationsQuery,
  useGetPayrollRunsQuery,
  useRemitComplianceObligationMutation,
  type ComplianceObligationRecord,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { hasAnyRole } from '../../rbac/roles';

const money = (v: string | number) =>
  Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 });

/** Days until (negative = overdue) a due date, in whole days. */
const daysUntil = (due: string) => dayjs(due).startOf('day').diff(dayjs().startOf('day'), 'day');

export function ComplianceCalendarPage() {
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'REMITTED'>('ALL');
  const { data, isLoading } = useGetComplianceObligationsQuery(
    statusFilter === 'ALL' ? undefined : { status: statusFilter },
  );
  const { data: runs } = useGetPayrollRunsQuery();
  const [generate, generateState] = useGenerateComplianceFromRunMutation();
  const [remit, remitState] = useRemitComplianceObligationMutation();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);
  const canRemit = hasAnyRole(user, ['FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN']);

  const [genOpen, setGenOpen] = useState(false);
  const [remitFor, setRemitFor] = useState<ComplianceObligationRecord | null>(null);
  const [genForm] = Form.useForm();
  const [remitForm] = Form.useForm();

  const approvedRuns = (runs ?? []).filter((r) => ['APPROVED', 'PAID'].includes(r.status));

  const onGenerate = async (v: { runId: string }) => {
    try {
      const res = await generate(v.runId).unwrap();
      message.success(`${res.generated} new obligation(s) generated`);
      setGenOpen(false);
      genForm.resetFields();
    } catch (e) {
      const err = e as { data?: { message?: string } };
      message.error(err.data?.message ?? 'Could not generate obligations');
    }
  };

  const onRemit = async (v: { reference: string }) => {
    if (!remitFor) return;
    try {
      await remit({ id: remitFor.id, reference: v.reference }).unwrap();
      message.success('Remittance recorded');
      setRemitFor(null);
      remitForm.resetFields();
    } catch (e) {
      const err = e as { data?: { message?: string } };
      message.error(err.data?.message ?? 'Could not record remittance');
    }
  };

  const dueTag = (r: ComplianceObligationRecord) => {
    const due = dayjs(r.dueDate).format('YYYY-MM-DD');
    if (r.status === 'REMITTED') return <span>{due}</span>;
    const d = daysUntil(r.dueDate);
    if (d < 0) {
      return (
        <Tooltip title={`Overdue by ${-d} day(s)`}>
          <Tag color="red">{due} · OVERDUE</Tag>
        </Tooltip>
      );
    }
    if (d <= 7) {
      return (
        <Tooltip title={`Due in ${d} day(s)`}>
          <Tag color="gold">{due} · due soon</Tag>
        </Tooltip>
      );
    }
    return <span>{due}</span>;
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Statutory compliance calendar
        </Typography.Title>
        {canRemit && (
          <Button type="primary" icon={<ThunderboltOutlined />} onClick={() => setGenOpen(true)}>
            Generate from payroll run
          </Button>
        )}
      </Space>
      <Typography.Paragraph type="secondary">
        Statutory remittances (ZIMRA PAYE &amp; AIDS levy, NSSA, ZIMDEF, NEC, MIPF) generated from
        approved payroll runs. Overdue and due-soon items raise Command Centre alerts until remitted.
      </Typography.Paragraph>

      <Segmented
        style={{ marginBottom: 16 }}
        value={statusFilter}
        onChange={(v) => setStatusFilter(v as typeof statusFilter)}
        options={[
          { label: 'All', value: 'ALL' },
          { label: 'Pending', value: 'PENDING' },
          { label: 'Remitted', value: 'REMITTED' },
        ]}
      />

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Period', dataIndex: 'periodMonth', width: 100 },
          { title: 'Obligation', dataIndex: 'label' },
          { title: 'Authority', dataIndex: 'head', width: 100, render: (h: string) => <Tag>{h}</Tag> },
          {
            title: 'Amount',
            align: 'right',
            render: (_: unknown, r: ComplianceObligationRecord) => `${r.currency} ${money(r.amount)}`,
          },
          {
            title: 'Due',
            render: (_: unknown, r: ComplianceObligationRecord) => dueTag(r),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string, r: ComplianceObligationRecord) =>
              s === 'REMITTED' ? (
                <Tooltip title={r.remittanceReference ?? ''}>
                  <Tag color="green">REMITTED</Tag>
                </Tooltip>
              ) : (
                <Tag color="default">PENDING</Tag>
              ),
          },
          {
            title: '',
            render: (_: unknown, r: ComplianceObligationRecord) =>
              canRemit && r.status === 'PENDING' ? (
                <Button
                  size="small"
                  icon={<CheckCircleOutlined />}
                  onClick={() => setRemitFor(r)}
                >
                  Remit
                </Button>
              ) : null,
          },
        ]}
      />

      <Modal
        title="Generate obligations from a payroll run"
        open={genOpen}
        onCancel={() => setGenOpen(false)}
        onOk={() => genForm.submit()}
        confirmLoading={generateState.isLoading}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          Consolidates the run&apos;s statutory returns into remittance obligations due the 10th of
          the following month. Re-running is safe — existing obligations are refreshed, not duplicated.
        </Typography.Paragraph>
        <Form form={genForm} layout="vertical" onFinish={onGenerate}>
          <Form.Item name="runId" label="Approved payroll run" rules={[{ required: true }]}>
            <Select
              placeholder={approvedRuns.length ? 'Select a run' : 'No approved runs yet'}
              options={approvedRuns.map((r) => ({
                label: `${r.month} · ${r.status}`,
                value: r.id,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Record statutory remittance"
        open={!!remitFor}
        onCancel={() => setRemitFor(null)}
        onOk={() => remitForm.submit()}
        confirmLoading={remitState.isLoading}
        destroyOnClose
      >
        {remitFor && (
          <Typography.Paragraph type="secondary">
            {remitFor.label} · {remitFor.periodMonth} · {remitFor.currency} {money(remitFor.amount)}
          </Typography.Paragraph>
        )}
        <Form form={remitForm} layout="vertical" onFinish={onRemit}>
          <Form.Item
            name="reference"
            label="Remittance reference"
            rules={[{ required: true, message: 'Enter the bank/authority reference' }]}
          >
            <Input placeholder="e.g. ZIMRA-EFT-4471" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
