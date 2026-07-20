import { DollarOutlined, EyeOutlined, PlusOutlined } from '@ant-design/icons';
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
  useCreateOrderMutation,
  useGetClientsQuery,
  useGetContractsQuery,
  useGetOrderQuery,
  useGetOrdersQuery,
  useGetUsersQuery,
  useMarkServicedMutation,
  useRecordReceiptMutation,
  type OrderReceiptRecord,
  type OrderRecord,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { LookupSelect } from '../../components/LookupSelect';
import { hasAnyRole } from '../../rbac/roles';

interface OrderForm {
  clientId: string;
  contractId?: string;
  reference: string;
  valueExVat: number;
  currency: string;
  closingDate?: dayjs.Dayjs;
  assignedUserId?: string;
}
interface ReceiptForm {
  amount: number;
  currency: string;
  receivedDate: dayjs.Dayjs;
  reference?: string;
}

export function OrdersPage() {
  const { data, isLoading } = useGetOrdersQuery();
  const { data: clients } = useGetClientsQuery();
  const { data: contracts } = useGetContractsQuery();
  const { data: users } = useGetUsersQuery();
  const [create, createState] = useCreateOrderMutation();
  const [recordReceipt, receiptState] = useRecordReceiptMutation();
  const [markServiced] = useMarkServicedMutation();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);
  const canWrite = hasAnyRole(user, ['FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN']);

  const [addOpen, setAddOpen] = useState(false);
  const [receiptFor, setReceiptFor] = useState<OrderRecord | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [orderForm] = Form.useForm();
  const [receiptForm] = Form.useForm();
  const selectedClient = Form.useWatch('clientId', orderForm);

  const { data: detail, isFetching: detailLoading } = useGetOrderQuery(viewId ?? '', {
    skip: !viewId,
  });

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? id.slice(0, 8);
  const assigneeName = (id: string | null) =>
    id ? (users?.find((u) => u.id === id)?.email ?? id.slice(0, 8)) : '—';

  const submitOrder = async (v: OrderForm) => {
    await create({
      clientId: v.clientId,
      contractId: v.contractId,
      reference: v.reference,
      valueExVat: v.valueExVat,
      currency: v.currency,
      closingDate: v.closingDate ? v.closingDate.toISOString() : undefined,
      assignedUserId: v.assignedUserId,
    }).unwrap();
    message.success('Order created');
    setAddOpen(false);
    orderForm.resetFields();
  };

  const submitReceipt = async (v: ReceiptForm) => {
    if (!receiptFor) return;
    await recordReceipt({
      id: receiptFor.id,
      amount: v.amount,
      currency: v.currency,
      receivedDate: v.receivedDate.toISOString(),
      reference: v.reference,
    }).unwrap();
    message.success('Receipt recorded');
    setReceiptFor(null);
    receiptForm.resetFields();
  };

  const onServiced = async (id: string) => {
    await markServiced(id).unwrap();
    message.success('Order marked serviced');
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Orders
        </Typography.Title>
        {canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Add order
          </Button>
        )}
      </Space>
      <Typography.Paragraph type="secondary">Order book with servicing status.</Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Reference', dataIndex: 'reference' },
          { title: 'Client', dataIndex: 'clientId', render: (id: string) => clientName(id) },
          {
            title: 'Value (ex VAT)',
            render: (_: unknown, r: OrderRecord) =>
              `${r.currency} ${Number(r.valueExVat).toLocaleString()}`,
          },
          {
            title: 'Assigned to',
            dataIndex: 'assignedUserId',
            render: (id: string | null) =>
              id ? <Tag color="purple">{assigneeName(id)}</Tag> : <Tag>unassigned</Tag>,
          },
          {
            title: 'Serviced',
            dataIndex: 'serviced',
            render: (s: boolean) =>
              s ? <Tag color="green">serviced</Tag> : <Tag color="gold">open</Tag>,
          },
          {
            title: 'Closing date',
            dataIndex: 'closingDate',
            render: (d: string | null) => (d ? dayjs(d).format('YYYY-MM-DD') : '—'),
          },
          {
            title: '',
            render: (_: unknown, r: OrderRecord) => (
              <Space>
                <Button size="small" icon={<EyeOutlined />} onClick={() => setViewId(r.id)}>
                  View
                </Button>
                {canWrite && !r.serviced && (
                  <>
                    <Button size="small" icon={<DollarOutlined />} onClick={() => setReceiptFor(r)}>
                      Receipt
                    </Button>
                    <Popconfirm
                      title="Mark this order as serviced?"
                      onConfirm={() => onServiced(r.id)}
                    >
                      <Button size="small">Mark serviced</Button>
                    </Popconfirm>
                  </>
                )}
              </Space>
            ),
          },
        ]}
      />

      {/* Add order */}
      <Modal
        title="Add order"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => orderForm.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
        width={560}
      >
        <Form form={orderForm} layout="vertical" onFinish={submitOrder}>
          <Form.Item name="clientId" label="Client" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={(clients ?? []).map((c) => ({ label: c.name, value: c.id }))}
              placeholder="Select a client"
              onChange={() => orderForm.setFieldValue('contractId', undefined)}
            />
          </Form.Item>
          <Form.Item name="contractId" label="Contract (optional)">
            <Select
              allowClear
              placeholder="Link to a contract"
              options={(contracts ?? [])
                .filter((c) => c.clientId === selectedClient)
                .map((c) => ({ label: c.reference, value: c.id }))}
            />
          </Form.Item>
          <Form.Item name="reference" label="Reference" rules={[{ required: true }]}>
            <Input placeholder="ORD-2025-001" />
          </Form.Item>
          <Space>
            <Form.Item name="valueExVat" label="Value (ex VAT)" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>
          <Form.Item name="closingDate" label="Closing date (optional)">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="assignedUserId"
            label="Assign to (optional)"
            help="The person who services this order — it shows in their My Orders."
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select a user"
              options={(users ?? []).map((u) => ({ label: u.email, value: u.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Record receipt */}
      <Modal
        title={`Record receipt${receiptFor ? ` — ${receiptFor.reference}` : ''}`}
        open={!!receiptFor}
        onCancel={() => setReceiptFor(null)}
        onOk={() => receiptForm.submit()}
        confirmLoading={receiptState.isLoading}
        destroyOnClose
      >
        <Form
          form={receiptForm}
          layout="vertical"
          onFinish={submitReceipt}
          initialValues={receiptFor ? { currency: receiptFor.currency } : {}}
        >
          <Space>
            <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} />
            </Form.Item>
          </Space>
          <Form.Item name="receivedDate" label="Received date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="reference" label="Bank reference (optional)">
            <Input placeholder="EFT-88213" />
          </Form.Item>
        </Form>
      </Modal>

      {/* View detail */}
      <Modal
        title={detail ? `Order — ${detail.reference}` : 'Order'}
        open={!!viewId}
        onCancel={() => setViewId(null)}
        footer={
          <Button type="primary" onClick={() => setViewId(null)}>
            Close
          </Button>
        }
        width={620}
      >
        {detailLoading || !detail ? (
          <Typography.Text type="secondary">Loading…</Typography.Text>
        ) : (
          <>
            <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Client">{clientName(detail.clientId)}</Descriptions.Item>
              <Descriptions.Item label="Value">
                {detail.currency} {Number(detail.valueExVat).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Serviced">{detail.serviced ? 'Yes' : 'No'}</Descriptions.Item>
              <Descriptions.Item label="Closing">
                {detail.closingDate ? dayjs(detail.closingDate).format('YYYY-MM-DD') : '—'}
              </Descriptions.Item>
              <Descriptions.Item label="Assigned to" span={2}>
                {assigneeName(detail.assignedUserId)}
              </Descriptions.Item>
            </Descriptions>
            <Typography.Title level={5}>Receipts</Typography.Title>
            <Table
              rowKey="id"
              size="small"
              pagination={false}
              dataSource={detail.receipts ?? []}
              locale={{ emptyText: 'No receipts yet' }}
              columns={[
                {
                  title: 'Date',
                  dataIndex: 'receivedDate',
                  render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
                },
                {
                  title: 'Amount',
                  render: (_: unknown, r: OrderReceiptRecord) =>
                    `${r.currency} ${Number(r.amount).toLocaleString()}`,
                },
                {
                  title: 'Reference',
                  dataIndex: 'reference',
                  render: (v: string | null) => v ?? '—',
                },
              ]}
            />
          </>
        )}
      </Modal>
    </>
  );
}
