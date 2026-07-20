import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Space, Switch, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import {
  useCreateClientMutation,
  useGetClientsQuery,
  useUpdateClientMutation,
  type ClientRecord,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { hasAnyRole } from '../../rbac/roles';

export function ClientsPage() {
  const { data, isLoading } = useGetClientsQuery();
  const [create, createState] = useCreateClientMutation();
  const [update, updateState] = useUpdateClientMutation();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);
  const canWrite = hasAnyRole(user, ['FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN']);

  const [editing, setEditing] = useState<ClientRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: { name: string; contactEmail?: string; active?: boolean }) => {
    if (editing) {
      await update({ id: editing.id, ...v }).unwrap();
      message.success('Client updated');
    } else {
      await create(v).unwrap();
      message.success('Client created');
    }
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Clients
        </Typography.Title>
        {canWrite && (
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            Add client
          </Button>
        )}
      </Space>
      <Typography.Paragraph type="secondary">
        Customers that contracts and orders are raised against.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          { title: 'Contact', dataIndex: 'contactEmail', render: (e: string | null) => e ?? '—' },
          {
            title: 'Status',
            dataIndex: 'active',
            render: (a: boolean) => (a ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>),
          },
          {
            title: '',
            width: 90,
            render: (_: unknown, c: ClientRecord) =>
              canWrite ? (
                <Button
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditing(c);
                    setOpen(true);
                  }}
                >
                  Edit
                </Button>
              ) : null,
          },
        ]}
      />
      <Modal
        title={editing ? 'Edit client' : 'Add client'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading || updateState.isLoading}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={editing ?? { active: true }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="Mimosa Mining Company" />
          </Form.Item>
          <Form.Item name="contactEmail" label="Contact email" rules={[{ type: 'email' }]}>
            <Input placeholder="accounts@client.co.zw" />
          </Form.Item>
          <Form.Item name="active" label="Active" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
