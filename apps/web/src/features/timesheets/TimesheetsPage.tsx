import { PlusOutlined, SendOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
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
  useCreateTimesheetPeriodMutation,
  useGetEmployeesQuery,
  useGetManhoursQuery,
  useGetSitesQuery,
  useGetTimesheetPeriodsQuery,
  useSubmitTimesheetPeriodMutation,
  useUpsertTimesheetEntriesMutation,
  type ManhoursRow,
  type TimesheetPeriodRecord,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { hasAnyRole } from '../../rbac/roles';

const STATUS_COLOR: Record<string, string> = {
  OPEN: 'processing',
  SITE_APPROVED: 'green',
  LOCKED: 'gold',
};

const hrs = (n: number) => n.toLocaleString('en-US');

function errText(e: unknown, fallback: string) {
  const err = e as { data?: { message?: string } };
  return err?.data?.message ?? fallback;
}

interface EntryForm {
  employeeId: string;
  date: dayjs.Dayjs;
  hoursNormal?: number;
  hoursOt15?: number;
  hoursOt20?: number;
  ugShift?: number;
  nightHours?: number;
  remarks?: string;
}

function AddEntryModal({
  periodId,
  siteId,
  open,
  onClose,
}: {
  periodId: string;
  siteId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { data: employees } = useGetEmployeesQuery();
  const [upsert, state] = useUpsertTimesheetEntriesMutation();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const siteEmployees = (employees ?? []).filter((e) => e.siteId === siteId);

  const submit = async (v: EntryForm) => {
    try {
      await upsert({
        id: periodId,
        rows: [
          {
            employeeId: v.employeeId,
            date: v.date.toISOString(),
            hoursNormal: v.hoursNormal ?? 0,
            hoursOt15: v.hoursOt15 ?? 0,
            hoursOt20: v.hoursOt20 ?? 0,
            ugShift: v.ugShift ?? 0,
            nightHours: v.nightHours ?? 0,
            remarks: v.remarks,
          },
        ],
      }).unwrap();
      message.success('Entry saved');
      form.resetFields();
      onClose();
    } catch (e) {
      message.error(errText(e, 'Could not save entry'));
    }
  };

  return (
    <Modal
      title="Add / update entry"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={state.isLoading}
      destroyOnClose
    >
      <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
        A day is either a normal shift <em>or</em> overtime — not both. Total hours can&apos;t exceed
        the daily maximum.
      </Typography.Paragraph>
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="employeeId" label="Employee" rules={[{ required: true }]}>
          <Select
            showSearch
            optionFilterProp="label"
            placeholder="Employee at this site"
            notFoundContent="No employees visible (needs site-manager access)"
            options={siteEmployees.map((e) => ({
              label: `${e.worksNo} — ${e.firstName} ${e.lastName}`,
              value: e.id,
            }))}
          />
        </Form.Item>
        <Form.Item name="date" label="Date" rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
        <Space wrap>
          <Form.Item name="hoursNormal" label="Normal">
            <InputNumber min={0} style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="hoursOt15" label="OT 1.5x">
            <InputNumber min={0} style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="hoursOt20" label="OT 2.0x">
            <InputNumber min={0} style={{ width: 110 }} />
          </Form.Item>
        </Space>
        <Space wrap>
          <Form.Item name="ugShift" label="UG shift">
            <InputNumber min={0} style={{ width: 110 }} />
          </Form.Item>
          <Form.Item name="nightHours" label="Night hours">
            <InputNumber min={0} style={{ width: 110 }} />
          </Form.Item>
        </Space>
        <Form.Item name="remarks" label="Remarks">
          <Input placeholder="Optional note" />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function PeriodView({
  period,
  canCapture,
  siteName,
}: {
  period: TimesheetPeriodRecord;
  canCapture: boolean;
  siteName: (id: string) => string;
}) {
  const { data, isFetching } = useGetManhoursQuery(period.id);
  const [entryOpen, setEntryOpen] = useState(false);

  return (
    <>
      <Descriptions column={2} size="small" bordered style={{ marginBottom: 12 }}>
        <Descriptions.Item label="Month">{period.month}</Descriptions.Item>
        <Descriptions.Item label="Site">{siteName(period.siteId)}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <Tag color={STATUS_COLOR[period.status] ?? 'default'}>
            {period.status.replaceAll('_', ' ')}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="Employees">{data?.rows.length ?? 0}</Descriptions.Item>
      </Descriptions>

      {canCapture && period.status === 'OPEN' && (
        <Button
          type="primary"
          icon={<PlusOutlined />}
          style={{ marginBottom: 12 }}
          onClick={() => setEntryOpen(true)}
        >
          Add entry
        </Button>
      )}

      <Table
        rowKey="employeeId"
        size="small"
        loading={isFetching}
        pagination={false}
        dataSource={data?.rows ?? []}
        locale={{ emptyText: 'No hours captured yet' }}
        columns={[
          { title: 'Works No', dataIndex: 'worksNo' },
          { title: 'Employee', dataIndex: 'employeeName' },
          { title: 'Normal', render: (_: unknown, r: ManhoursRow) => hrs(r.hoursNormal) },
          { title: 'OT 1.5x', render: (_: unknown, r: ManhoursRow) => hrs(r.hoursOt15) },
          { title: 'OT 2.0x', render: (_: unknown, r: ManhoursRow) => hrs(r.hoursOt20) },
          { title: 'UG', render: (_: unknown, r: ManhoursRow) => hrs(r.ugShift) },
          { title: 'Night', render: (_: unknown, r: ManhoursRow) => hrs(r.nightHours) },
          {
            title: 'Total',
            render: (_: unknown, r: ManhoursRow) => <strong>{hrs(r.totalHours)}</strong>,
          },
        ]}
      />

      <AddEntryModal
        periodId={period.id}
        siteId={period.siteId}
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
      />
    </>
  );
}

interface PeriodForm {
  siteId: string;
  month: dayjs.Dayjs;
}

export function TimesheetsPage() {
  const { data, isLoading } = useGetTimesheetPeriodsQuery();
  const { data: sites } = useGetSitesQuery();
  const [create, createState] = useCreateTimesheetPeriodMutation();
  const [submit] = useSubmitTimesheetPeriodMutation();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);
  const canCapture = hasAnyRole(user, ['SITE_CLERK', 'SITE_MANAGER', 'OPS_STAFF', 'SYS_ADMIN']);

  const [addOpen, setAddOpen] = useState(false);
  const [viewPeriod, setViewPeriod] = useState<TimesheetPeriodRecord | null>(null);
  const [form] = Form.useForm();

  const siteName = (id: string) => sites?.find((s) => s.id === id)?.name ?? id.slice(0, 8);

  const onCreate = async (v: PeriodForm) => {
    try {
      await create({ siteId: v.siteId, month: v.month.format('YYYY-MM') }).unwrap();
      message.success('Timesheet period created');
      setAddOpen(false);
      form.resetFields();
    } catch (e) {
      message.error(errText(e, 'Could not create period'));
    }
  };

  const onSubmit = async (id: string) => {
    try {
      await submit(id).unwrap();
      message.success('Submitted for site-manager approval');
    } catch (e) {
      message.error(errText(e, 'Could not submit'));
    }
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Timesheets
        </Typography.Title>
        {canCapture && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Create period
          </Button>
        )}
      </Space>
      <Typography.Paragraph type="secondary">
        Capture monthly hours per site, then submit for site-manager approval. Finance locks the
        period for payroll in the admin console.
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
            render: (s: string) => (
              <Tag color={STATUS_COLOR[s] ?? 'default'}>{s.replaceAll('_', ' ')}</Tag>
            ),
          },
          {
            title: 'Actions',
            render: (_: unknown, r: TimesheetPeriodRecord) => (
              <Space>
                <Button size="small" onClick={() => setViewPeriod(r)}>
                  Open
                </Button>
                {canCapture && r.status === 'OPEN' && (
                  <Popconfirm
                    title="Submit this period for approval?"
                    onConfirm={() => onSubmit(r.id)}
                  >
                    <Button size="small" type="primary" icon={<SendOutlined />}>
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
        title="Create timesheet period"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onCreate}>
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
        title={viewPeriod ? `Timesheet — ${viewPeriod.month}` : 'Timesheet'}
        open={!!viewPeriod}
        onCancel={() => setViewPeriod(null)}
        footer={
          <Button type="primary" onClick={() => setViewPeriod(null)}>
            Close
          </Button>
        }
        width={820}
        destroyOnClose
      >
        {viewPeriod && <PeriodView period={viewPeriod} canCapture={canCapture} siteName={siteName} />}
      </Modal>
    </>
  );
}
