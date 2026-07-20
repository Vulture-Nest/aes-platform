import {
  BankOutlined,
  CreditCardOutlined,
  DeleteOutlined,
  DollarOutlined,
  IdcardOutlined,
  PercentageOutlined,
  PlusOutlined,
  SlidersOutlined,
  SwapOutlined,
  TagsOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Popconfirm, Space, Switch, Table, Tag, Typography } from 'antd';
import { ReactNode, useState } from 'react';
import {
  useCreateLookupMutation,
  useDeleteLookupMutation,
  useGetLookupsQuery,
  useUpdateLookupMutation,
  type LookupRecord,
} from '../../api/api';
import { AES } from '../../theme';

interface Category {
  label: string;
  value: string;
  desc: string;
  icon: ReactNode;
}

const CATEGORIES: Category[] = [
  { label: 'Currencies', value: 'currency', desc: 'Accepted currencies', icon: <DollarOutlined /> },
  {
    label: 'Currency pairs',
    value: 'currency_pair',
    desc: 'Exchange-rate pairs',
    icon: <SwapOutlined />,
  },
  { label: 'Site types', value: 'site_type', desc: 'Site classifications', icon: <BankOutlined /> },
  {
    label: 'Account types',
    value: 'account_type',
    desc: 'Ledger account categories',
    icon: <WalletOutlined />,
  },
  {
    label: 'Contract statuses',
    value: 'contract_status',
    desc: 'Contract lifecycle labels',
    icon: <TagsOutlined />,
  },
  {
    label: 'Statutory keys',
    value: 'statutory_key',
    desc: 'Tax & statutory parameters',
    icon: <PercentageOutlined />,
  },
  {
    label: 'Threshold keys',
    value: 'threshold_key',
    desc: 'Configurable limits',
    icon: <SlidersOutlined />,
  },
  {
    label: 'Employment types',
    value: 'employment_type',
    desc: 'Employment categories',
    icon: <IdcardOutlined />,
  },
  { label: 'Pay modes', value: 'pay_mode', desc: 'Payment methods', icon: <CreditCardOutlined /> },
  { label: 'Roles', value: 'role', desc: 'User roles & access', icon: <TeamOutlined /> },
];

/** Example code/label hints shown as placeholders for each category. */
const EXAMPLES: Record<string, { code: string; label: string }> = {
  currency: { code: 'ZAR', label: 'South African Rand' },
  currency_pair: { code: 'USD/ZWG', label: 'US Dollar to Zimbabwe Gold' },
  site_type: { code: 'QUARRY', label: 'Quarry' },
  account_type: { code: 'SAVINGS', label: 'Savings account' },
  contract_status: { code: 'SUSPENDED', label: 'Suspended' },
  statutory_key: { code: 'PAYE', label: 'Pay As You Earn' },
  threshold_key: { code: 'PETTY_CASH_FD', label: 'Petty cash — FD approval limit' },
  employment_type: { code: 'CONTRACT', label: 'Contract' },
  pay_mode: { code: 'BANK_TRANSFER', label: 'Bank transfer' },
  role: { code: 'SITE_MANAGER', label: 'Site Manager' },
};

const FALLBACK_EXAMPLE = { code: 'CODE', label: 'Descriptive name' };

const isSystem = (r: LookupRecord) => r.metadata?.system === true;

export function SettingsPage() {
  const [category, setCategory] = useState('currency');
  const { data, isLoading } = useGetLookupsQuery(category);
  const [create, createState] = useCreateLookupMutation();
  const [update] = useUpdateLookupMutation();
  const [remove] = useDeleteLookupMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const [form] = Form.useForm();
  const example = EXAMPLES[category] ?? FALLBACK_EXAMPLE;
  const activeCategory = CATEGORIES.find((c) => c.value === category);

  const submit = async (v: { code: string; label: string }) => {
    await create({ category, code: v.code, label: v.label }).unwrap();
    message.success('Value added');
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Settings
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Add value
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        Configurable reference lists used across the platform. System values can be disabled but
        not deleted.
      </Typography.Paragraph>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
          gap: 12,
          marginBottom: 24,
        }}
      >
        {CATEGORIES.map((c) => {
          const active = c.value === category;
          const hot = hovered === c.value;
          return (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              onMouseEnter={() => setHovered(c.value)}
              onMouseLeave={() => setHovered((h) => (h === c.value ? null : h))}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '12px 14px',
                textAlign: 'left',
                cursor: 'pointer',
                fontFamily: 'inherit',
                borderRadius: 10,
                border: `1.5px solid ${active ? AES.green : hot ? '#bfe3a8' : '#e8eaed'}`,
                background: active ? AES.greenSoft : '#fff',
                boxShadow: hot && !active ? '0 4px 12px rgba(0,0,0,0.06)' : 'none',
                transition: 'border-color 0.15s, box-shadow 0.15s, background 0.15s',
              }}
            >
              <span
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 38,
                  height: 38,
                  flexShrink: 0,
                  borderRadius: 9,
                  fontSize: 18,
                  color: active ? '#fff' : AES.green,
                  background: active ? AES.green : AES.greenSoft,
                }}
              >
                {c.icon}
              </span>
              <span style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: 14,
                    lineHeight: 1.3,
                    color: active ? '#274d15' : '#1f2933',
                  }}
                >
                  {c.label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: active ? '#5a7f3f' : '#8c96a0',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {c.desc}
                </div>
              </span>
            </button>
          );
        })}
      </div>
      <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
        {activeCategory?.label}
        <Typography.Text
          type="secondary"
          style={{ fontWeight: 400, marginLeft: 8, fontSize: 13 }}
        >
          {activeCategory?.desc}
        </Typography.Text>
      </Typography.Title>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        columns={[
          {
            title: 'Code',
            dataIndex: 'code',
            render: (c: string, r: LookupRecord) => (
              <Space>
                <Typography.Text code>{c}</Typography.Text>
                {isSystem(r) && <Tag>system</Tag>}
              </Space>
            ),
          },
          { title: 'Label', dataIndex: 'label' },
          {
            title: 'Active',
            dataIndex: 'active',
            render: (active: boolean, r: LookupRecord) => (
              <Switch checked={active} onChange={(v) => update({ id: r.id, active: v })} />
            ),
          },
          {
            title: '',
            render: (_: unknown, r: LookupRecord) =>
              isSystem(r) ? null : (
                <Popconfirm
                  title="Delete this value?"
                  onConfirm={async () => {
                    await remove(r.id).unwrap();
                    message.success('Deleted');
                  }}
                >
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              ),
          },
        ]}
      />
      <Modal
        title={`Add ${CATEGORIES.find((c) => c.value === category)?.label}`}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input placeholder={`e.g. ${example.code}`} />
          </Form.Item>
          <Form.Item name="label" label="Label" rules={[{ required: true }]}>
            <Input placeholder={`e.g. ${example.label}`} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
