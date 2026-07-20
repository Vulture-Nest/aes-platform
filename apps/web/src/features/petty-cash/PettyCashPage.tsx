import { CheckOutlined, MinusCircleOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  useConfirmWithdrawalMutation,
  useCreateWithdrawalMutation,
  useGetPettyCashFloatsQuery,
  useGetPettyCashTxnsQuery,
  useGetSitesQuery,
  type PettyCashFloatRecord,
  type PettyCashTxnRecord,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { hasAnyRole } from '../../rbac/roles';

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  APPROVED: 'green',
  POSTED: 'blue',
  REJECTED: 'red',
  RETURNED: 'orange',
};

function errText(e: unknown, fallback: string) {
  const err = e as { data?: { message?: string } };
  return err?.data?.message ?? fallback;
}

function FloatView({ float, siteName }: { float: PettyCashFloatRecord; siteName: (id: string) => string }) {
  const { data: txns, isFetching } = useGetPettyCashTxnsQuery(float.id);
  const [withdraw, withdrawState] = useCreateWithdrawalMutation();
  const [confirm] = useConfirmWithdrawalMutation();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);
  const canWithdraw = hasAnyRole(user, ['SITE_CLERK', 'SITE_MANAGER', 'OPS_STAFF']);
  const canConfirm = hasAnyRole(user, ['SITE_MANAGER']);

  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const onWithdraw = async (v: { amount: number; purpose: string }) => {
    try {
      await withdraw({ id: float.id, ...v }).unwrap();
      message.success('Withdrawal raised');
      setOpen(false);
      form.resetFields();
    } catch (e) {
      message.error(errText(e, 'Could not raise withdrawal'));
    }
  };

  const onConfirm = async (txnId: string) => {
    try {
      await confirm(txnId).unwrap();
      message.success('Withdrawal posted');
    } catch (e) {
      message.error(errText(e, 'Could not confirm'));
    }
  };

  return (
    <>
      <Descriptions column={2} size="small" bordered style={{ marginBottom: 12 }}>
        <Descriptions.Item label="Site">{siteName(float.siteId)}</Descriptions.Item>
        <Descriptions.Item label="Float">
          {float.currency} {float.floatAmount}
        </Descriptions.Item>
        <Descriptions.Item label="State" span={2}>
          {float.locked ? <Tag color="red">LOCKED</Tag> : <Tag color="green">OK</Tag>}
        </Descriptions.Item>
      </Descriptions>

      {canWithdraw && !float.locked && (
        <Button
          type="primary"
          icon={<MinusCircleOutlined />}
          style={{ marginBottom: 12 }}
          onClick={() => setOpen(true)}
        >
          Raise withdrawal
        </Button>
      )}

      <Table
        rowKey="id"
        size="small"
        loading={isFetching}
        pagination={false}
        dataSource={txns}
        locale={{ emptyText: 'No transactions yet' }}
        columns={[
          {
            title: 'Date',
            dataIndex: 'createdAt',
            render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
          },
          {
            title: 'Type',
            dataIndex: 'type',
            render: (t: string) => <Tag>{t.replaceAll('_', ' ')}</Tag>,
          },
          {
            title: 'Amount',
            render: (_: unknown, r: PettyCashTxnRecord) => `${r.currency} ${r.amount}`,
          },
          { title: 'Purpose', dataIndex: 'purpose', render: (v: string | null) => v ?? '—' },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => (
              <Tag color={STATUS_COLOR[s] ?? 'default'}>{s.replaceAll('_', ' ')}</Tag>
            ),
          },
          {
            title: '',
            render: (_: unknown, r: PettyCashTxnRecord) =>
              canConfirm && r.type === 'WITHDRAWAL' && r.status !== 'POSTED' ? (
                <Popconfirm title="Confirm & post this withdrawal?" onConfirm={() => onConfirm(r.id)}>
                  <Button size="small" icon={<CheckOutlined />}>
                    Confirm
                  </Button>
                </Popconfirm>
              ) : null,
          },
        ]}
      />

      <Modal
        title="Raise withdrawal"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={withdrawState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onWithdraw}>
          <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="purpose" label="Purpose" rules={[{ required: true }]}>
            <Input placeholder="Fuel for site generator" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

export function PettyCashPage() {
  const { data, isLoading } = useGetPettyCashFloatsQuery();
  const { data: sites } = useGetSitesQuery();
  const [viewFloat, setViewFloat] = useState<PettyCashFloatRecord | null>(null);

  const siteName = (id: string) => sites?.find((s) => s.id === id)?.name ?? id.slice(0, 8);

  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Petty Cash
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Your site floats. Raise withdrawals against a float; a site manager confirms below-threshold
        vouchers. Finance opens and tops up floats.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        locale={{ emptyText: 'No floats — Finance opens these' }}
        columns={[
          { title: 'Site', dataIndex: 'siteId', render: (id: string) => siteName(id) },
          { title: 'Currency', dataIndex: 'currency' },
          {
            title: 'Float',
            render: (_: unknown, r: PettyCashFloatRecord) => `${r.currency} ${r.floatAmount}`,
          },
          {
            title: 'State',
            dataIndex: 'locked',
            render: (locked: boolean) =>
              locked ? <Tag color="red">LOCKED</Tag> : <Tag color="green">OK</Tag>,
          },
          {
            title: '',
            render: (_: unknown, r: PettyCashFloatRecord) => (
              <Button size="small" onClick={() => setViewFloat(r)}>
                Open
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title={viewFloat ? `Float — ${siteName(viewFloat.siteId)}` : 'Float'}
        open={!!viewFloat}
        onCancel={() => setViewFloat(null)}
        footer={
          <Button type="primary" onClick={() => setViewFloat(null)}>
            Close
          </Button>
        }
        width={720}
        destroyOnClose
      >
        {viewFloat && <FloatView float={viewFloat} siteName={siteName} />}
      </Modal>
    </>
  );
}
