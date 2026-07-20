import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Popconfirm, Segmented, Space, Switch, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import {
  useCreateLookupMutation,
  useDeleteLookupMutation,
  useGetLookupsQuery,
  useUpdateLookupMutation,
  type LookupRecord,
} from '../../api/api';

const CATEGORIES = [
  { label: 'Currencies', value: 'currency' },
  { label: 'Currency pairs', value: 'currency_pair' },
  { label: 'Site types', value: 'site_type' },
  { label: 'Statutory keys', value: 'statutory_key' },
  { label: 'Threshold keys', value: 'threshold_key' },
  { label: 'Employment types', value: 'employment_type' },
  { label: 'Pay modes', value: 'pay_mode' },
  { label: 'Roles', value: 'role' },
];

/** Example code/label hints shown as placeholders for each category. */
const EXAMPLES: Record<string, { code: string; label: string }> = {
  currency: { code: 'ZAR', label: 'South African Rand' },
  currency_pair: { code: 'USD/ZWG', label: 'US Dollar to Zimbabwe Gold' },
  site_type: { code: 'QUARRY', label: 'Quarry' },
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
  const [form] = Form.useForm();
  const example = EXAMPLES[category] ?? FALLBACK_EXAMPLE;

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
      <Segmented
        options={CATEGORIES}
        value={category}
        onChange={(v) => setCategory(v as string)}
        style={{ marginBottom: 16 }}
      />
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
