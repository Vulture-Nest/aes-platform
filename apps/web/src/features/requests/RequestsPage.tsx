import { PlusOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  useCreateRequisitionMutation,
  useGetRequisitionsQuery,
  useSubmitRequisitionMutation,
  type RequisitionRecord,
} from '../../api/api';
import { LookupSelect } from '../../components/LookupSelect';

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  APPROVED_READY_TO_PAY: 'green',
  APPROVED_PENDING_FUNDS: 'gold',
  DISBURSED: 'blue',
  CLOSED: 'default',
  REJECTED: 'red',
  RETURNED: 'orange',
};

export function RequestsPage() {
  const { data, isLoading } = useGetRequisitionsQuery();
  const [create, createState] = useCreateRequisitionMutation();
  const [submit] = useSubmitRequisitionMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const onCreate = async (v: {
    purpose: string;
    amount: number;
    currency: string;
    requiredByDate: dayjs.Dayjs;
  }) => {
    await create({
      purpose: v.purpose,
      amount: v.amount,
      currency: v.currency,
      requiredByDate: v.requiredByDate.toISOString(),
    }).unwrap();
    message.success('Requisition created');
    setOpen(false);
    form.resetFields();
  };

  const onSubmit = async (id: string) => {
    await submit(id).unwrap();
    message.success('Submitted for approval');
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Cash Requisitions
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          New requisition
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Purpose', dataIndex: 'purpose' },
          {
            title: 'Amount',
            render: (_: unknown, r: RequisitionRecord) => `${r.currency} ${r.amount}`,
          },
          {
            title: 'Required by',
            dataIndex: 'requiredByDate',
            render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => <Tag color={STATUS_COLOR[s] ?? 'default'}>{s.replaceAll('_', ' ')}</Tag>,
          },
          {
            title: 'Shortfall',
            dataIndex: 'shortfall',
            render: (s: string | null) => (s ? <Tag color="gold">{s}</Tag> : '—'),
          },
          {
            title: 'Actions',
            render: (_: unknown, r: RequisitionRecord) =>
              r.status === 'DRAFT' ? (
                <Button size="small" type="primary" onClick={() => onSubmit(r.id)}>
                  Submit
                </Button>
              ) : (
                '—'
              ),
          },
        ]}
      />
      <Modal
        title="New requisition"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item name="purpose" label="Purpose" rules={[{ required: true }]}>
            <Input placeholder="Site fuel for March" />
          </Form.Item>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
            <LookupSelect category="currency" placeholder="Select a currency" />
          </Form.Item>
          <Form.Item name="requiredByDate" label="Required by" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
