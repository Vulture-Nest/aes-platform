import { DollarOutlined, EyeOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  useGetAssignedOrdersQuery,
  useGetOrderQuery,
  useMarkServicedMutation,
  useRecordReceiptMutation,
  type OrderReceiptRecord,
  type OrderRecord,
} from '../../api/api';
import { LookupSelect } from '../../components/LookupSelect';

interface ReceiptForm {
  amount: number;
  currency: string;
  receivedDate: dayjs.Dayjs;
  reference?: string;
}

export function MyOrdersPage() {
  const { data, isLoading } = useGetAssignedOrdersQuery();
  const [recordReceipt, receiptState] = useRecordReceiptMutation();
  const [markServiced] = useMarkServicedMutation();
  const { message } = App.useApp();

  const [receiptFor, setReceiptFor] = useState<OrderRecord | null>(null);
  const [viewId, setViewId] = useState<string | null>(null);
  const [receiptForm] = Form.useForm();

  const { data: detail, isFetching: detailLoading } = useGetOrderQuery(viewId ?? '', {
    skip: !viewId,
  });

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
      <Typography.Title level={3}>My Orders</Typography.Title>
      <Typography.Paragraph type="secondary">
        Orders assigned to you to service. Record receipts and mark them serviced when done.
      </Typography.Paragraph>
      {data && data.length === 0 ? (
        <Empty description="Nothing assigned to you yet" />
      ) : (
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={data}
          columns={[
            { title: 'Reference', dataIndex: 'reference' },
            {
              title: 'Value (ex VAT)',
              render: (_: unknown, r: OrderRecord) =>
                `${r.currency} ${Number(r.valueExVat).toLocaleString()}`,
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
                  {!r.serviced && (
                    <>
                      <Button
                        size="small"
                        icon={<DollarOutlined />}
                        onClick={() => setReceiptFor(r)}
                      >
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
      )}

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
              <Descriptions.Item label="Value">
                {detail.currency} {Number(detail.valueExVat).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="Serviced">{detail.serviced ? 'Yes' : 'No'}</Descriptions.Item>
              <Descriptions.Item label="Closing">
                {detail.closingDate ? dayjs(detail.closingDate).format('YYYY-MM-DD') : '—'}
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
