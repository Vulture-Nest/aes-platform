import {
  CalculatorOutlined,
  EyeOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  PlusOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  useComputePayrollRunMutation,
  useCreatePayrollRunMutation,
  useGetPayrollRunQuery,
  useGetPayrollRunsQuery,
  useGetSitesQuery,
  useSubmitPayrollRunMutation,
  type PayrollLineRecord,
  type PayrollRunRecord,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { downloadFile } from '../../api/download';
import { hasAnyRole } from '../../rbac/roles';

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  CHECKED: 'blue',
  APPROVED: 'green',
  PAID: 'green',
  LOCKED: 'gold',
};

const money = (v: string | number) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2 });

function RunDetail({ runId, siteName }: { runId: string; siteName: (id: string) => string }) {
  const { data, isFetching } = useGetPayrollRunQuery(runId);
  const { message } = App.useApp();
  const [busy, setBusy] = useState<string | null>(null);

  const dl = async (kind: 'payslips' | 'sage-journal', name: string) => {
    setBusy(kind);
    try {
      await downloadFile(`v1/reports/payroll/${runId}/${kind}`, name);
    } catch (e) {
      message.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setBusy(null);
    }
  };

  if (isFetching || !data) return <Typography.Text type="secondary">Loading…</Typography.Text>;

  return (
    <>
      <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Month">{data.month}</Descriptions.Item>
        <Descriptions.Item label="Site">{siteName(data.siteId)}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag color={STATUS_COLOR[data.status] ?? 'default'}>{data.status}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Employees">{data.lines.length}</Descriptions.Item>
      </Descriptions>

      <Space style={{ marginBottom: 12 }}>
        <Button
          icon={<FilePdfOutlined />}
          loading={busy === 'payslips'}
          onClick={() => dl('payslips', `payslips-${data.month}.pdf`)}
        >
          Payslips PDF
        </Button>
        <Button
          icon={<FileTextOutlined />}
          loading={busy === 'sage-journal'}
          onClick={() => dl('sage-journal', `sage-journal-${data.month}.csv`)}
        >
          Sage journal CSV
        </Button>
      </Space>

      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={data.lines}
        locale={{ emptyText: 'No lines yet — compute the run first' }}
        columns={[
          {
            title: 'Works No',
            render: (_: unknown, r: PayrollLineRecord) => r.employee?.worksNo ?? '—',
          },
          {
            title: 'Employee',
            render: (_: unknown, r: PayrollLineRecord) =>
              r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : r.employeeId.slice(0, 8),
          },
          { title: 'Gross', align: 'right', render: (_: unknown, r: PayrollLineRecord) => money(r.gross) },
          { title: 'PAYE', align: 'right', render: (_: unknown, r: PayrollLineRecord) => money(r.paye) },
          {
            title: 'NSSA',
            align: 'right',
            render: (_: unknown, r: PayrollLineRecord) => money(r.nssaEe),
          },
          {
            title: 'Net',
            align: 'right',
            render: (_: unknown, r: PayrollLineRecord) =>
              money(Number(r.netUsd) + Number(r.netZwg)),
          },
        ]}
      />
    </>
  );
}

interface RunForm {
  siteId: string;
  month: dayjs.Dayjs;
}

export function PayrollPage() {
  const { data, isLoading } = useGetPayrollRunsQuery();
  const { data: sites } = useGetSitesQuery();
  const [create, createState] = useCreatePayrollRunMutation();
  const [compute] = useComputePayrollRunMutation();
  const [submit] = useSubmitPayrollRunMutation();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);
  const canWrite = hasAnyRole(user, ['FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN']);

  const [addOpen, setAddOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const siteName = (id: string) => sites?.find((s) => s.id === id)?.name ?? id.slice(0, 8);

  const submitForm = async (v: RunForm) => {
    try {
      await create({ siteId: v.siteId, month: v.month.format('YYYY-MM') }).unwrap();
      message.success('Payroll run opened');
      setAddOpen(false);
      form.resetFields();
    } catch (e) {
      const err = e as { data?: { message?: string } };
      message.error(err.data?.message ?? 'Could not open run');
    }
  };

  const onCompute = async (id: string) => {
    try {
      await compute(id).unwrap();
      message.success('Run computed');
    } catch (e) {
      const err = e as { data?: { message?: string } };
      message.error(err.data?.message ?? 'Compute failed');
    }
  };

  const onSubmit = async (id: string) => {
    try {
      await submit(id).unwrap();
      message.success('Run submitted for approval');
    } catch (e) {
      const err = e as { data?: { message?: string } };
      message.error(err.data?.message ?? 'Submit failed');
    }
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Payroll
        </Typography.Title>
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Open run
          </Button>
        )}
      </Space>
      <Typography.Paragraph type="secondary">
        Monthly payroll runs per site. Open → compute → submit for Finance-Director approval.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Month', dataIndex: 'month' },
          { title: 'Site', dataIndex: 'siteId', render: (id: string) => siteName(id) },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => <Tag color={STATUS_COLOR[s] ?? 'default'}>{s}</Tag>,
          },
          {
            title: '',
            render: (_: unknown, r: PayrollRunRecord) => (
              <Space>
                <Button size="small" icon={<EyeOutlined />} onClick={() => setViewId(r.id)}>
                  View
                </Button>
                {canWrite && r.status === 'DRAFT' && (
                  <Popconfirm title="Compute all pay lines for this run?" onConfirm={() => onCompute(r.id)}>
                    <Button size="small" icon={<CalculatorOutlined />}>
                      Compute
                    </Button>
                  </Popconfirm>
                )}
                {canWrite && r.status === 'CHECKED' && (
                  <Popconfirm
                    title="Submit this run for Finance-Director approval?"
                    onConfirm={() => onSubmit(r.id)}
                  >
                    <Button size="small" icon={<SendOutlined />}>
                      Submit
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="Open payroll run"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          Requires a site-approved (or locked) timesheet period for the same site &amp; month.
        </Typography.Paragraph>
        <Form form={form} layout="vertical" onFinish={submitForm}>
          <Form.Item name="siteId" label="Site" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select a site"
              options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
            />
          </Form.Item>
          <Form.Item name="month" label="Month" rules={[{ required: true }]}>
            <DatePicker picker="month" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Payroll run"
        open={!!viewId}
        onCancel={() => setViewId(null)}
        footer={
          <Button type="primary" onClick={() => setViewId(null)}>
            Close
          </Button>
        }
        width={760}
        destroyOnClose
      >
        {viewId && <RunDetail runId={viewId} siteName={siteName} />}
      </Modal>
    </>
  );
}
