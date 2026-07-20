import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Select, Space, Table, Typography } from 'antd';
import { useState } from 'react';
import {
  useCreateContactMutation,
  useGetContactsQuery,
  useGetOrganisationsQuery,
  useUpdateContactMutation,
  type CrmContact,
} from '../../api/api';

export function ContactsTab() {
  const { data, isLoading } = useGetContactsQuery();
  const { data: orgs } = useGetOrganisationsQuery();
  const [create, createState] = useCreateContactMutation();
  const [update, updateState] = useUpdateContactMutation();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<CrmContact | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const orgName = (id: string | null) =>
    id ? (orgs?.find((o) => o.id === id)?.name ?? '—') : '—';

  const submit = async (v: Record<string, unknown>) => {
    if (editing) {
      await update({ id: editing.id, ...v }).unwrap();
      message.success('Contact updated');
    } else {
      await create(v).unwrap();
      message.success('Contact created');
    }
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Typography.Text type="secondary">People at those organisations.</Typography.Text>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add contact
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          {
            title: 'Name',
            render: (_: unknown, r: CrmContact) => `${r.firstName} ${r.lastName}`,
          },
          { title: 'Title', dataIndex: 'title', render: (v: string | null) => v ?? '—' },
          {
            title: 'Organisation',
            dataIndex: 'organisationId',
            render: (id: string | null) => orgName(id),
          },
          { title: 'Email', dataIndex: 'email', render: (v: string | null) => v ?? '—' },
          { title: 'Phone', dataIndex: 'phone', render: (v: string | null) => v ?? '—' },
          {
            title: '',
            width: 90,
            render: (_: unknown, r: CrmContact) => (
              <Button
                size="small"
                icon={<EditOutlined />}
                onClick={() => {
                  setEditing(r);
                  setOpen(true);
                }}
              >
                Edit
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? 'Edit contact' : 'Add contact'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading || updateState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit} initialValues={editing ?? {}}>
          <Form.Item name="organisationId" label="Organisation" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select an organisation"
              options={(orgs ?? []).map((o) => ({ label: o.name, value: o.id }))}
            />
          </Form.Item>
          <Space>
            <Form.Item name="firstName" label="First name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="lastName" label="Last name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Space>
          <Form.Item name="title" label="Title">
            <Input placeholder="Procurement Manager" />
          </Form.Item>
          <Space>
            <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
              <Input placeholder="name@client.co.zw" />
            </Form.Item>
            <Form.Item name="phone" label="Phone">
              <Input />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
}
