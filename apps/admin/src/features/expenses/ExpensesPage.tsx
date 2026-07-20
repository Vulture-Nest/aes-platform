import { PlusOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  useCreateGeneralExpenseMutation,
  useCreateOverheadMutation,
  useGetGeneralExpensesQuery,
  useGetOverheadsQuery,
  type GeneralExpenseRecord,
  type OverheadRecord,
} from '../../api/api';
import { LookupSelect } from '../../components/LookupSelect';

const money = (a: string, c: string) => `${c} ${Number(a).toLocaleString()}`;

function GeneralExpensesTab() {
  const { data, isLoading } = useGetGeneralExpensesQuery();
  const [create, createState] = useCreateGeneralExpenseMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: {
    amount: number;
    currency: string;
    vatClaimable?: boolean;
    category?: string;
    expenseDate: dayjs.Dayjs;
  }) => {
    await create({
      amount: v.amount,
      currency: v.currency,
      vatClaimable: v.vatClaimable ?? false,
      category: v.category,
      expenseDate: v.expenseDate.toISOString(),
    }).unwrap();
    message.success('Expense recorded');
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Typography.Text type="secondary">Non-order costs (fuel, admin, sundries).</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Add expense
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          {
            title: 'Date',
            dataIndex: 'expenseDate',
            render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
          },
          { title: 'Category', dataIndex: 'category', render: (v: string | null) => v ?? '—' },
          {
            title: 'Amount',
            render: (_: unknown, r: GeneralExpenseRecord) => money(r.amount, r.currency),
          },
          {
            title: 'VAT claimable',
            dataIndex: 'vatClaimable',
            render: (v: boolean) => (v ? <Tag color="green">Yes</Tag> : <Tag>No</Tag>),
          },
        ]}
      />
      <Modal
        title="Add general expense"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={{ vatClaimable: false, expenseDate: dayjs() }}
        >
          <Space>
            <Form.Item name="amount" label="Amount (ex VAT)" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>
          <Form.Item name="category" label="Category">
            <Input placeholder="Fuel" />
          </Form.Item>
          <Form.Item name="expenseDate" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="vatClaimable" label="Input VAT claimable" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function OverheadsTab() {
  const { data, isLoading } = useGetOverheadsQuery();
  const [create, createState] = useCreateOverheadMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: {
    amount: number;
    currency: string;
    category?: string;
    periodMonth?: string;
  }) => {
    await create(v).unwrap();
    message.success('Overhead recorded');
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Typography.Text type="secondary">Monthly overheads (rent, software, internet…).</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Add overhead
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Period', dataIndex: 'periodMonth', render: (v: string | null) => v ?? '—' },
          { title: 'Category', dataIndex: 'category', render: (v: string | null) => v ?? '—' },
          {
            title: 'Amount',
            render: (_: unknown, r: OverheadRecord) => money(r.amount, r.currency),
          },
        ]}
      />
      <Modal
        title="Add overhead"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Space>
            <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>
          <Form.Item name="category" label="Category">
            <Input placeholder="Rent" />
          </Form.Item>
          <Form.Item name="periodMonth" label="Period (YYYY-MM)">
            <Input placeholder="2026-07" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function ExpensesPage() {
  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Expenses &amp; Overheads
      </Typography.Title>
      <Tabs
        items={[
          { key: 'general', label: 'General expenses', children: <GeneralExpensesTab /> },
          { key: 'overheads', label: 'Overheads', children: <OverheadsTab /> },
        ]}
      />
    </>
  );
}
