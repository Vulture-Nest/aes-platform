import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useCreateAccountMutation, useGetAccountsQuery, useGetSitesQuery } from '../../api/api';

const TYPES = [
  { label: 'Bank', value: 'BANK' },
  { label: 'Petty cash', value: 'PETTY_CASH' },
  { label: 'Mobile wallet', value: 'MOBILE_WALLET' },
];

export function AccountsPage() {
  const { data, isLoading } = useGetAccountsQuery();
  const { data: sites } = useGetSitesQuery();
  const [create, createState] = useCreateAccountMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: Record<string, unknown>) => {
    await create(v).unwrap();
    message.success('Account created');
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Ledger Accounts
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Add account
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          { title: 'Type', dataIndex: 'type', render: (t: string) => <Tag>{t}</Tag> },
          { title: 'Currency', dataIndex: 'currency' },
          {
            title: 'Site',
            dataIndex: 'siteId',
            render: (id: string | null) => sites?.find((s) => s.id === id)?.name ?? 'Head office',
          },
        ]}
      />
      <Modal
        title="Add account"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ currency: 'USD', type: 'BANK' }}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Bank USD" />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select options={TYPES} />
          </Form.Item>
          <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
            <Select options={[{ label: 'USD', value: 'USD' }, { label: 'ZWG', value: 'ZWG' }]} />
          </Form.Item>
          <Form.Item name="siteId" label="Site (optional)">
            <Select allowClear options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
