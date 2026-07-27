import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  DatePicker,
  Descriptions,
  Divider,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useGetEmployeesQuery } from '../../api/api';
import { LookupSelect } from '../../components/LookupSelect';
import {
  useApproveActingAssignmentMutation,
  useApproveBackPayBatchMutation,
  useCreateActingAssignmentMutation,
  useCreateBackPayBatchMutation,
  useGetActingRegisterQuery,
  useGetBackPayBatchQuery,
  useGetBackPayBatchesQuery,
  useSubmitActingAssignmentMutation,
  useSubmitBackPayBatchMutation,
  type ActingBasisValue,
  type ActingRegisterRow,
  type BackPayBatchRecord,
  type BackPayLineRecord,
} from './payrollAdjustmentsApi';

const money = (a: string | number | null | undefined, c?: string | null) => {
  if (a === null || a === undefined || a === '') return '—';
  const n = typeof a === 'number' ? a : Number(a);
  return `${c ?? 'USD'} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const statusColor = (s: string) => {
  switch (s) {
    case 'APPROVED':
      return 'green';
    case 'SUBMITTED':
      return 'blue';
    case 'REJECTED':
    case 'CANCELLED':
      return 'red';
    default:
      return 'default';
  }
};

const StatusTag = ({ status }: { status: string }) => <Tag color={statusColor(status)}>{status}</Tag>;

// ---------------------------------------------------------------------------
// Employee helpers
// ---------------------------------------------------------------------------
function useEmployeeName() {
  const { data } = useGetEmployeesQuery();
  const byId = new Map((data ?? []).map((e) => [e.id, `${e.firstName} ${e.lastName} (${e.worksNo})`]));
  return (id: string) => byId.get(id) ?? id;
}

function EmployeeSelect(props: { value?: string; onChange?: (v: string) => void; style?: React.CSSProperties }) {
  const { data, isLoading } = useGetEmployeesQuery();
  return (
    <Select
      showSearch
      loading={isLoading}
      placeholder="Select employee"
      optionFilterProp="label"
      value={props.value}
      onChange={props.onChange}
      style={props.style}
      options={(data ?? []).map((e) => ({
        value: e.id,
        label: `${e.firstName} ${e.lastName} (${e.worksNo})`,
      }))}
    />
  );
}

// ===========================================================================
// Back-pay tab
// ===========================================================================
interface BackPayFormValues {
  name: string;
  rateEffectiveFrom: dayjs.Dayjs;
  gazettedAt?: dayjs.Dayjs;
  currency: string;
  affectedPeriods: dayjs.Dayjs[];
  newRates: { grade?: string; necClass?: string; hourly?: number; basic?: number }[];
  taxable: boolean;
  pensionable: boolean;
  nssaAble: boolean;
}

function BackPayTab() {
  const { data, isLoading } = useGetBackPayBatchesQuery();
  const [create, createState] = useCreateBackPayBatchMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [drillId, setDrillId] = useState<string | null>(null);
  const [form] = Form.useForm<BackPayFormValues>();

  const submit = async (v: BackPayFormValues) => {
    const rows = (v.newRates ?? []).filter(
      (r) => r && (r.grade || r.necClass) && (r.hourly != null || r.basic != null),
    );
    if (rows.length === 0) {
      message.error('Add at least one new rate row with a grade/NEC class and an amount');
      return;
    }
    await create({
      name: v.name,
      rateEffectiveFrom: v.rateEffectiveFrom.format('YYYY-MM-DD'),
      gazettedAt: v.gazettedAt ? v.gazettedAt.format('YYYY-MM-DD') : undefined,
      currency: v.currency,
      affectedPeriods: (v.affectedPeriods ?? []).map((d) => d.format('YYYY-MM')),
      newRates: rows,
      taxable: v.taxable,
      pensionable: v.pensionable,
      nssaAble: v.nssaAble,
    }).unwrap();
    message.success('Back-pay batch created (DRAFT)');
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Alert
        type="info"
        message="Approving a batch emits one BACK_PAY extra earning per employee, picked up by the next payroll run."
        style={{ marginBottom: 12 }}
      />
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Typography.Text type="secondary">
          Recompute old vs new pay per employee×period after a gazetted wage award.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          New batch
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          {
            title: 'Rate effective',
            dataIndex: 'rateEffectiveFrom',
            render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
          },
          {
            title: 'Gazetted',
            dataIndex: 'gazettedAt',
            render: (d: string | null) => (d ? dayjs(d).format('YYYY-MM-DD') : '—'),
          },
          { title: 'Currency', dataIndex: 'currency' },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => <StatusTag status={s} />,
          },
          {
            title: 'Actions',
            render: (_: unknown, r: BackPayBatchRecord) => (
              <Button size="small" onClick={() => setDrillId(r.id)}>
                Open
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title="New back-pay batch"
        open={open}
        width={760}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={{
            currency: 'USD',
            rateEffectiveFrom: dayjs(),
            taxable: true,
            pensionable: false,
            nssaAble: false,
            newRates: [{}],
            affectedPeriods: [],
          }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="NEC 2024 wage award" />
          </Form.Item>
          <Space>
            <Form.Item name="rateEffectiveFrom" label="Rate effective from" rules={[{ required: true }]}>
              <DatePicker style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="gazettedAt" label="Gazetted at">
              <DatePicker style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>

          <Form.Item
            name="affectedPeriods"
            label="Affected periods (months to recompute)"
            rules={[{ required: true, message: 'Pick at least one month' }]}
          >
            <DatePicker picker="month" multiple format="YYYY-MM" style={{ width: '100%' }} />
          </Form.Item>

          <Divider orientation="left" plain>
            New rates by grade / NEC class
          </Divider>
          <Form.List name="newRates">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 4 }}>
                    <Form.Item name={[field.name, 'grade']} label="Grade">
                      <Input placeholder="M2" style={{ width: 110 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'necClass']} label="NEC class">
                      <Input placeholder="A3" style={{ width: 110 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'hourly']} label="New hourly">
                      <InputNumber min={0} style={{ width: 120 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'basic']} label="New basic">
                      <InputNumber min={0} style={{ width: 120 }} />
                    </Form.Item>
                    {fields.length > 1 && (
                      <MinusCircleOutlined onClick={() => remove(field.name)} />
                    )}
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add({})} icon={<PlusOutlined />} block>
                  Add rate row
                </Button>
              </>
            )}
          </Form.List>

          <Divider orientation="left" plain>
            Earning flags
          </Divider>
          <Space size="large">
            <Form.Item name="taxable" label="Taxable" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="pensionable" label="Pensionable" valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="nssaAble" label="NSSA-able" valuePropName="checked">
              <Switch />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <BackPayDrawer id={drillId} onClose={() => setDrillId(null)} />
    </>
  );
}

function BackPayDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data, isLoading } = useGetBackPayBatchQuery(id as string, { skip: !id });
  const [submitBatch, submitState] = useSubmitBackPayBatchMutation();
  const [approveBatch, approveState] = useApproveBackPayBatchMutation();
  const { message, modal } = App.useApp();
  const empName = useEmployeeName();

  const onSubmit = async () => {
    if (!id) return;
    await submitBatch(id).unwrap();
    message.success('Batch submitted for approval');
  };

  const onApprove = () => {
    if (!id) return;
    modal.confirm({
      title: 'Approve back-pay batch?',
      content: 'This emits a BACK_PAY extra earning per employee for the next payroll run.',
      onOk: async () => {
        await approveBatch({ id }).unwrap();
        message.success('Batch approved; extra earnings emitted');
      },
    });
  };

  const total = (data?.lines ?? []).reduce((s, l) => s + Number(l.difference), 0);

  return (
    <Drawer
      title={data ? data.name : 'Back-pay batch'}
      width={900}
      open={!!id}
      onClose={onClose}
      loading={isLoading}
      extra={
        data && (
          <Space>
            {data.status === 'DRAFT' && (
              <Button type="primary" loading={submitState.isLoading} onClick={onSubmit}>
                Submit
              </Button>
            )}
            {data.status === 'SUBMITTED' && (
              <Button type="primary" loading={approveState.isLoading} onClick={onApprove}>
                Approve
              </Button>
            )}
          </Space>
        )
      }
    >
      {data && (
        <>
          <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Status">
              <StatusTag status={data.status} />
            </Descriptions.Item>
            <Descriptions.Item label="Currency">{data.currency}</Descriptions.Item>
            <Descriptions.Item label="Rate effective from">
              {dayjs(data.rateEffectiveFrom).format('YYYY-MM-DD')}
            </Descriptions.Item>
            <Descriptions.Item label="Gazetted at">
              {data.gazettedAt ? dayjs(data.gazettedAt).format('YYYY-MM-DD') : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Lines">{data.lines.length}</Descriptions.Item>
            <Descriptions.Item label="Total back-pay">{money(total, data.currency)}</Descriptions.Item>
          </Descriptions>

          <Typography.Title level={5}>Per-employee workings (old vs new vs difference)</Typography.Title>
          <Table
            rowKey="id"
            size="small"
            pagination={false}
            dataSource={data.lines}
            columns={[
              { title: 'Employee', dataIndex: 'employeeId', render: (v: string) => empName(v) },
              { title: 'Period', dataIndex: 'periodMonth' },
              {
                title: 'Matched',
                render: (_: unknown, r: BackPayLineRecord) =>
                  r.workings?.matchedBy ? <Tag>{r.workings.matchedBy}</Tag> : '—',
              },
              {
                title: 'Old',
                dataIndex: 'oldAmount',
                render: (v: string) => money(v, data.currency),
              },
              {
                title: 'New',
                dataIndex: 'newAmount',
                render: (v: string) => money(v, data.currency),
              },
              {
                title: 'Difference',
                dataIndex: 'difference',
                render: (v: string) => (
                  <Typography.Text type={Number(v) >= 0 ? 'success' : 'danger'}>
                    {money(v, data.currency)}
                  </Typography.Text>
                ),
              },
              {
                title: 'Workings',
                render: (_: unknown, r: BackPayLineRecord) => {
                  const w = r.workings;
                  if (!w) return '—';
                  const bits: string[] = [];
                  if (w.hoursPaid != null && w.oldHourly != null && w.newHourly != null) {
                    bits.push(`${w.hoursPaid}h @ ${w.oldHourly}→${w.newHourly}`);
                  }
                  if (w.oldBasic != null || w.newBasic != null) {
                    bits.push(`basic ${w.oldBasic ?? '—'}→${w.newBasic ?? '—'}`);
                  }
                  return (
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {bits.join('; ') || '—'}
                    </Typography.Text>
                  );
                },
              },
            ]}
          />
        </>
      )}
    </Drawer>
  );
}

// ===========================================================================
// Acting allowances tab
// ===========================================================================
interface ActingFormValues {
  employeeId: string;
  actingPosition: string;
  actingGrade?: string;
  dateRange: [dayjs.Dayjs, dayjs.Dayjs];
  basis: ActingBasisValue;
  fixedAmount?: number;
  percent?: number;
  currency: string;
  minQualifyingDays?: number;
}

function ActingTab() {
  const { data, isLoading } = useGetActingRegisterQuery();
  const [create, createState] = useCreateActingAssignmentMutation();
  const [submitActing] = useSubmitActingAssignmentMutation();
  const [approveActing] = useApproveActingAssignmentMutation();
  const { message, modal } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<ActingFormValues>();
  const basis = Form.useWatch('basis', form);
  const empName = useEmployeeName();

  const submit = async (v: ActingFormValues) => {
    await create({
      employeeId: v.employeeId,
      actingPosition: v.actingPosition,
      actingGrade: v.actingGrade,
      dateFrom: v.dateRange[0].format('YYYY-MM-DD'),
      dateTo: v.dateRange[1].format('YYYY-MM-DD'),
      basis: v.basis,
      fixedAmount: v.basis === 'FIXED' ? v.fixedAmount : undefined,
      percent: v.basis === 'PERCENT' ? v.percent : undefined,
      currency: v.currency,
      minQualifyingDays: v.minQualifyingDays,
    }).unwrap();
    message.success('Acting assignment created (DRAFT)');
    setOpen(false);
    form.resetFields();
  };

  const onSubmit = async (id: string) => {
    await submitActing(id).unwrap();
    message.success('Assignment submitted for approval');
  };

  const onApprove = (id: string) => {
    modal.confirm({
      title: 'Approve acting assignment?',
      content: 'Once approved it can be pro-rated into payroll runs as an ACTING_ALLOWANCE earning.',
      onOk: async () => {
        await approveActing({ id }).unwrap();
        message.success('Assignment approved');
      },
    });
  };

  return (
    <>
      <Alert
        type="info"
        message="Approved acting allowances are pro-rated by active days and flow into payroll as an ACTING_ALLOWANCE extra earning."
        style={{ marginBottom: 12 }}
      />
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Typography.Text type="secondary">Assign an employee to act in a higher role.</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          New assignment
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Employee', dataIndex: 'employeeId', render: (v: string) => empName(v) },
          { title: 'Acting position', dataIndex: 'actingPosition' },
          { title: 'Grade', dataIndex: 'actingGrade', render: (v: string | null) => v ?? '—' },
          {
            title: 'From',
            dataIndex: 'dateFrom',
            render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
          },
          { title: 'To', dataIndex: 'dateTo', render: (d: string) => dayjs(d).format('YYYY-MM-DD') },
          {
            title: 'Basis',
            render: (_: unknown, r: ActingRegisterRow) =>
              r.basis === 'FIXED'
                ? `Fixed ${money(r.fixedAmount, r.currency)}`
                : `Percent ${r.percent ?? '—'}%`,
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => <StatusTag status={s} />,
          },
          {
            title: 'Actions',
            render: (_: unknown, r: ActingRegisterRow) => (
              <Space>
                {r.status === 'DRAFT' && (
                  <Button size="small" onClick={() => onSubmit(r.id)}>
                    Submit
                  </Button>
                )}
                {r.status === 'SUBMITTED' && (
                  <Button size="small" type="primary" onClick={() => onApprove(r.id)}>
                    Approve
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="New acting assignment"
        open={open}
        width={640}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={{ basis: 'FIXED', currency: 'USD' }}
        >
          <Form.Item name="employeeId" label="Employee" rules={[{ required: true }]}>
            <EmployeeSelect style={{ width: '100%' }} />
          </Form.Item>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="actingPosition" label="Acting position" rules={[{ required: true, min: 2 }]}>
              <Input placeholder="Site Manager" style={{ width: 260 }} />
            </Form.Item>
            <Form.Item name="actingGrade" label="Acting grade">
              <Input placeholder="M2" style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Form.Item name="dateRange" label="Acting period" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Space style={{ display: 'flex' }}>
            <Form.Item name="basis" label="Basis" rules={[{ required: true }]}>
              <Select
                style={{ width: 160 }}
                options={[
                  { value: 'FIXED', label: 'Fixed amount' },
                  { value: 'PERCENT', label: 'Percent of differential' },
                ]}
              />
            </Form.Item>
            {basis === 'FIXED' ? (
              <Form.Item
                name="fixedAmount"
                label="Fixed monthly amount"
                rules={[{ required: true, message: 'Required for FIXED' }]}
              >
                <InputNumber min={0} style={{ width: 180 }} />
              </Form.Item>
            ) : (
              <Form.Item
                name="percent"
                label="Percent (0–100)"
                rules={[{ required: true, message: 'Required for PERCENT' }]}
              >
                <InputNumber min={0} max={100} style={{ width: 180 }} />
              </Form.Item>
            )}
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>
          <Form.Item name="minQualifyingDays" label="Minimum qualifying days">
            <InputNumber min={0} style={{ width: 180 }} placeholder="e.g. 15" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ===========================================================================
// Acting register (read-only cost view)
// ===========================================================================
function ActingRegisterTab() {
  const [range, setRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const { data, isLoading } = useGetActingRegisterQuery(
    range ? { from: range[0].format('YYYY-MM-DD'), to: range[1].format('YYYY-MM-DD') } : undefined,
  );
  const empName = useEmployeeName();

  return (
    <>
      <Space style={{ marginBottom: 12 }}>
        <Typography.Text type="secondary">Who acted, in what, for how long, and the cost basis.</Typography.Text>
        <DatePicker.RangePicker
          onChange={(v) => setRange(v && v[0] && v[1] ? [v[0], v[1]] : null)}
          allowClear
        />
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Employee', dataIndex: 'employeeId', render: (v: string) => empName(v) },
          { title: 'Acted as', dataIndex: 'actingPosition' },
          { title: 'Grade', dataIndex: 'actingGrade', render: (v: string | null) => v ?? '—' },
          {
            title: 'From',
            dataIndex: 'dateFrom',
            render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
          },
          { title: 'To', dataIndex: 'dateTo', render: (d: string) => dayjs(d).format('YYYY-MM-DD') },
          { title: 'Days', dataIndex: 'days' },
          {
            title: 'Cost',
            render: (_: unknown, r: ActingRegisterRow) =>
              r.basis === 'FIXED'
                ? money(r.fixedAmount, r.currency)
                : `${r.percent ?? '—'}% of differential`,
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => <StatusTag status={s} />,
          },
        ]}
      />
    </>
  );
}

// ===========================================================================
// Page
// ===========================================================================
export function PayrollAdjustmentsPage() {
  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Back-Pay &amp; Acting Allowances
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
        Both back-pay differences and acting allowances flow into payroll as extra earnings on the next run.
      </Typography.Paragraph>
      <Tabs
        items={[
          { key: 'backpay', label: 'Back-pay', children: <BackPayTab /> },
          { key: 'acting', label: 'Acting allowances', children: <ActingTab /> },
          { key: 'register', label: 'Acting register', children: <ActingRegisterTab /> },
        ]}
      />
    </>
  );
}

export default PayrollAdjustmentsPage;
