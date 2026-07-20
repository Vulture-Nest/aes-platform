import { DollarOutlined, PlusOutlined, RollbackOutlined, SendOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  useCreateTravelMutation,
  useDisburseTravelMutation,
  useGetAccountsQuery,
  useGetSitesQuery,
  useGetTravelRequestsQuery,
  useRetireTravelMutation,
  useSubmitTravelMutation,
  type TravelRecord,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { LookupSelect } from '../../components/LookupSelect';
import { hasAnyRole } from '../../rbac/roles';
import { errorMessage, money, StatusTag } from './shared';

interface TravelForm {
  destination: string;
  dates: [dayjs.Dayjs, dayjs.Dayjs];
  days: number;
  currency: string;
  siteId?: string;
}

export function TravelPage() {
  const { data, isLoading } = useGetTravelRequestsQuery();
  const { data: sites } = useGetSitesQuery();
  const { data: accounts } = useGetAccountsQuery();
  const [create, createState] = useCreateTravelMutation();
  const [submit] = useSubmitTravelMutation();
  const [disburse, disburseState] = useDisburseTravelMutation();
  const [retire, retireState] = useRetireTravelMutation();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);
  const canPay = hasAnyRole(user, ['FINANCE_OFFICER', 'FINANCE_DIRECTOR']);

  const [addOpen, setAddOpen] = useState(false);
  const [disburseFor, setDisburseFor] = useState<TravelRecord | null>(null);
  const [retireFor, setRetireFor] = useState<TravelRecord | null>(null);
  const [form] = Form.useForm();
  const [disburseForm] = Form.useForm();
  const [retireForm] = Form.useForm();

  const submitForm = async (v: TravelForm) => {
    try {
      await create({
        destination: v.destination,
        dateFrom: v.dates[0].toISOString(),
        dateTo: v.dates[1].toISOString(),
        days: v.days,
        currency: v.currency,
        siteId: v.siteId,
      }).unwrap();
      message.success('Travel request created');
      setAddOpen(false);
      form.resetFields();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const guard = async (p: Promise<unknown>, ok: string) => {
    try {
      await p;
      message.success(ok);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const submitDisburse = async (v: { accountId: string; reference: string }) => {
    if (!disburseFor) return;
    await guard(disburse({ id: disburseFor.id, ...v }).unwrap(), 'Advance disbursed');
    setDisburseFor(null);
    disburseForm.resetFields();
  };

  const submitRetire = async (v: { receiptsKey: string; unspent: number }) => {
    if (!retireFor) return;
    await guard(retire({ id: retireFor.id, ...v }).unwrap(), 'Advance retired');
    setRetireFor(null);
    retireForm.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Travel &amp; allowances
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          New travel request
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        Per-diem advances: raise → submit → disburse once approved → retire against receipts.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Destination', dataIndex: 'destination' },
          {
            title: 'Dates',
            render: (_: unknown, r: TravelRecord) =>
              `${dayjs(r.dateFrom).format('DD MMM')} – ${dayjs(r.dateTo).format('DD MMM')}`,
          },
          { title: 'Days', dataIndex: 'days', align: 'right' },
          {
            title: 'Advance',
            align: 'right',
            render: (_: unknown, r: TravelRecord) => money(r.advanceAmount, r.currency),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => <StatusTag status={s} />,
          },
          {
            title: '',
            render: (_: unknown, r: TravelRecord) => (
              <Space>
                {r.status === 'DRAFT' && (
                  <Popconfirm
                    title="Submit for approval?"
                    onConfirm={() => guard(submit(r.id).unwrap(), 'Submitted for approval')}
                  >
                    <Button size="small" icon={<SendOutlined />}>
                      Submit
                    </Button>
                  </Popconfirm>
                )}
                {canPay && r.status === 'APPROVED_READY_TO_PAY' && (
                  <Button size="small" icon={<DollarOutlined />} onClick={() => setDisburseFor(r)}>
                    Disburse
                  </Button>
                )}
                {canPay && r.status === 'DISBURSED' && (
                  <Button size="small" icon={<RollbackOutlined />} onClick={() => setRetireFor(r)}>
                    Retire
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="New travel request"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submitForm}>
          <Form.Item name="destination" label="Destination" rules={[{ required: true }]}>
            <Input placeholder="Bulawayo depot audit" />
          </Form.Item>
          <Form.Item name="dates" label="From – to" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Space>
            <Form.Item name="days" label="Days" rules={[{ required: true }]}>
              <InputNumber min={1} precision={0} style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>
          <Form.Item
            name="siteId"
            label="Site (optional)"
            help="Per-diem is resolved from the rate table at submit."
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select a site"
              options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Disburse advance"
        open={!!disburseFor}
        onCancel={() => setDisburseFor(null)}
        onOk={() => disburseForm.submit()}
        confirmLoading={disburseState.isLoading}
        destroyOnClose
      >
        <Form form={disburseForm} layout="vertical" onFinish={submitDisburse}>
          <Form.Item name="accountId" label="Source account" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Bank / cash account"
              options={(accounts ?? []).map((a) => ({
                label: `${a.name} (${a.currency})`,
                value: a.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="reference" label="Payment reference" rules={[{ required: true }]}>
            <Input placeholder="EFT-77120" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Retire advance"
        open={!!retireFor}
        onCancel={() => setRetireFor(null)}
        onOk={() => retireForm.submit()}
        confirmLoading={retireState.isLoading}
        destroyOnClose
      >
        <Form form={retireForm} layout="vertical" onFinish={submitRetire} initialValues={{ unspent: 0 }}>
          <Form.Item name="receiptsKey" label="Receipts reference" rules={[{ required: true }]}>
            <Input placeholder="Storage key / receipt bundle id" />
          </Form.Item>
          <Form.Item name="unspent" label="Unspent amount returned" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
