import {
  CheckOutlined,
  DollarOutlined,
  MinusCircleOutlined,
  PlusOutlined,
  ReconciliationOutlined,
  SettingOutlined,
  UnlockOutlined,
} from '@ant-design/icons';
import {
  App,
  Button,
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
  useConfirmWithdrawalMutation,
  useCreateFloatMutation,
  useCreateWithdrawalMutation,
  useGetAccountsQuery,
  useGetPettyCashFloatsQuery,
  useGetPettyCashTxnsQuery,
  useGetSitesQuery,
  useGetUsersQuery,
  useRecordCashCountMutation,
  useTopUpFloatMutation,
  useUnlockFloatMutation,
  type PettyCashFloatRecord,
  type PettyCashTxnRecord,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { LookupSelect } from '../../components/LookupSelect';
import { hasAnyRole } from '../../rbac/roles';
import { errorMessage, money, StatusTag } from './shared';

type FloatAction = 'withdraw' | 'topup' | 'count' | null;

function FloatManager({
  float,
  siteName,
  userName,
}: {
  float: PettyCashFloatRecord;
  siteName: (id: string) => string;
  userName: (id: string) => string;
}) {
  const { data: txns, isFetching } = useGetPettyCashTxnsQuery(float.id);
  const { data: accounts } = useGetAccountsQuery();
  const [withdraw, withdrawState] = useCreateWithdrawalMutation();
  const [topUp, topUpState] = useTopUpFloatMutation();
  const [count, countState] = useRecordCashCountMutation();
  const [unlock] = useUnlockFloatMutation();
  const [confirm] = useConfirmWithdrawalMutation();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);

  // Role gates mirror the API exactly (petty cash enforces separation of duties —
  // SYS_ADMIN can open a float but does not transact on it).
  const canWithdraw = hasAnyRole(user, ['SITE_CLERK', 'SITE_MANAGER', 'OPS_STAFF']);
  const canManageFloat = hasAnyRole(user, ['SITE_MANAGER', 'FINANCE_OFFICER', 'FINANCE_DIRECTOR']);
  const canUnlock = hasAnyRole(user, ['FINANCE_DIRECTOR']);
  const canConfirm = hasAnyRole(user, ['SITE_MANAGER']);

  const [action, setAction] = useState<FloatAction>(null);
  const [form] = Form.useForm();

  const guard = async (p: Promise<unknown>, ok: string) => {
    try {
      await p;
      message.success(ok);
      return true;
    } catch (e) {
      message.error(errorMessage(e));
      return false;
    }
  };

  const submit = async (v: Record<string, unknown>) => {
    let ok = false;
    if (action === 'withdraw') ok = await guard(withdraw({ id: float.id, ...v }).unwrap(), 'Withdrawal raised');
    else if (action === 'topup') ok = await guard(topUp({ id: float.id, ...v }).unwrap(), 'Top-up raised');
    else if (action === 'count')
      ok = await guard(
        count({ id: float.id, countedAmount: v.countedAmount as number }).unwrap(),
        'Cash count recorded',
      );
    if (ok) {
      setAction(null);
      form.resetFields();
    }
  };

  return (
    <>
      <Descriptions column={2} size="small" bordered style={{ marginBottom: 12 }}>
        <Descriptions.Item label="Site">{siteName(float.siteId)}</Descriptions.Item>
        <Descriptions.Item label="Custodian">{userName(float.custodianUserId)}</Descriptions.Item>
        <Descriptions.Item label="Float">{money(float.floatAmount, float.currency)}</Descriptions.Item>
        <Descriptions.Item label="State">
          {float.locked ? <Tag color="red">LOCKED</Tag> : <Tag color="green">OK</Tag>}
        </Descriptions.Item>
      </Descriptions>

      <Space wrap style={{ marginBottom: 12 }}>
        {canWithdraw && (
          <Button icon={<MinusCircleOutlined />} onClick={() => setAction('withdraw')}>
            Withdraw
          </Button>
        )}
        {canManageFloat && (
          <Button icon={<DollarOutlined />} onClick={() => setAction('topup')}>
            Top-up
          </Button>
        )}
        {canManageFloat && (
          <Button icon={<ReconciliationOutlined />} onClick={() => setAction('count')}>
            Record count
          </Button>
        )}
        {canUnlock && float.locked && (
          <Popconfirm
            title="Clear the reconciliation lock on this float?"
            onConfirm={() => guard(unlock(float.id).unwrap(), 'Float unlocked')}
          >
            <Button icon={<UnlockOutlined />}>Unlock</Button>
          </Popconfirm>
        )}
      </Space>

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
          { title: 'Type', dataIndex: 'type', render: (t: string) => <Tag>{t.replace(/_/g, ' ')}</Tag> },
          {
            title: 'Amount',
            align: 'right',
            render: (_: unknown, r: PettyCashTxnRecord) => money(r.amount, r.currency),
          },
          { title: 'Purpose', dataIndex: 'purpose', render: (v: string | null) => v ?? '—' },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => <StatusTag status={s} />,
          },
          {
            title: '',
            render: (_: unknown, r: PettyCashTxnRecord) =>
              canConfirm && r.type === 'WITHDRAWAL' && r.status !== 'POSTED' ? (
                <Popconfirm
                  title="Confirm & post this withdrawal?"
                  onConfirm={() => guard(confirm(r.id).unwrap(), 'Withdrawal posted')}
                >
                  <Button size="small" icon={<CheckOutlined />}>
                    Confirm
                  </Button>
                </Popconfirm>
              ) : null,
          },
        ]}
      />

      <Modal
        title={
          action === 'withdraw' ? 'Raise withdrawal' : action === 'topup' ? 'Imprest top-up' : 'Record cash count'
        }
        open={!!action}
        onCancel={() => setAction(null)}
        onOk={() => form.submit()}
        confirmLoading={withdrawState.isLoading || topUpState.isLoading || countState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          {action === 'withdraw' && (
            <>
              <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="purpose" label="Purpose" rules={[{ required: true }]}>
                <Input placeholder="Fuel for site generator" />
              </Form.Item>
            </>
          )}
          {action === 'topup' && (
            <>
              <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
              <Form.Item name="sourceAccountId" label="Source account" rules={[{ required: true }]}>
                <Select
                  showSearch
                  optionFilterProp="label"
                  placeholder="Bank account"
                  options={(accounts ?? []).map((a) => ({
                    label: `${a.name} (${a.currency})`,
                    value: a.id,
                  }))}
                />
              </Form.Item>
              <Form.Item name="purpose" label="Purpose">
                <Input placeholder="Monthly imprest replenishment" />
              </Form.Item>
            </>
          )}
          {action === 'count' && (
            <Form.Item name="countedAmount" label="Counted amount" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}

interface FloatForm {
  siteId: string;
  currency: string;
  custodianUserId: string;
  floatAmount: number;
}

export function PettyCashPage() {
  const { data, isLoading } = useGetPettyCashFloatsQuery();
  const { data: sites } = useGetSitesQuery();
  const { data: users } = useGetUsersQuery();
  const [create, createState] = useCreateFloatMutation();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);
  const canOpenFloat = hasAnyRole(user, ['FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN']);

  const [addOpen, setAddOpen] = useState(false);
  const [manageFloat, setManageFloat] = useState<PettyCashFloatRecord | null>(null);
  const [form] = Form.useForm();

  const siteName = (id: string) => sites?.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  const userName = (id: string) => users?.find((u) => u.id === id)?.email ?? id.slice(0, 8);

  const submitForm = async (v: FloatForm) => {
    try {
      await create({
        siteId: v.siteId,
        currency: v.currency,
        custodianUserId: v.custodianUserId,
        floatAmount: v.floatAmount,
      }).unwrap();
      message.success('Float opened');
      setAddOpen(false);
      form.resetFields();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Petty cash
        </Typography.Title>
        {canOpenFloat && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Open float
          </Button>
        )}
      </Space>
      <Typography.Paragraph type="secondary">
        Per-site cash floats with custodians. Withdrawals, imprest top-ups and cash-count
        reconciliation. A count variance beyond tolerance locks the float.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Site', dataIndex: 'siteId', render: (id: string) => siteName(id) },
          { title: 'Currency', dataIndex: 'currency' },
          {
            title: 'Custodian',
            dataIndex: 'custodianUserId',
            render: (id: string) => userName(id),
          },
          {
            title: 'Float',
            align: 'right',
            render: (_: unknown, r: PettyCashFloatRecord) => money(r.floatAmount, r.currency),
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
              <Button size="small" icon={<SettingOutlined />} onClick={() => setManageFloat(r)}>
                Manage
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title="Open petty-cash float"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submitForm}>
          <Form.Item name="siteId" label="Site" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select a site"
              options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
            />
          </Form.Item>
          <Form.Item name="custodianUserId" label="Custodian" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select a user"
              options={(users ?? []).map((u) => ({ label: u.email, value: u.id }))}
            />
          </Form.Item>
          <Space>
            <Form.Item name="floatAmount" label="Float amount" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      <Modal
        title={manageFloat ? `Float — ${siteName(manageFloat.siteId)}` : 'Float'}
        open={!!manageFloat}
        onCancel={() => setManageFloat(null)}
        footer={
          <Button type="primary" onClick={() => setManageFloat(null)}>
            Close
          </Button>
        }
        width={820}
        destroyOnClose
      >
        {manageFloat && (
          <FloatManager float={manageFloat} siteName={siteName} userName={userName} />
        )}
      </Modal>
    </>
  );
}
