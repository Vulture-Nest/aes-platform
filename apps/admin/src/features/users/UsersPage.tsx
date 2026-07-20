import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import {
  useAssignRoleMutation,
  useCreateUserMutation,
  useGetSitesQuery,
  useGetUsersQuery,
  type UserRecord,
} from '../../api/api';
import { LookupSelect } from '../../components/LookupSelect';
import { ROLE_LABELS } from '../../rbac/roles';

export function UsersPage() {
  const { data, isLoading } = useGetUsersQuery();
  const { data: sites } = useGetSitesQuery();
  const [createUser, createState] = useCreateUserMutation();
  const [assignRole, assignState] = useAssignRoleMutation();
  const { message } = App.useApp();

  const [createOpen, setCreateOpen] = useState(false);
  const [roleFor, setRoleFor] = useState<UserRecord | null>(null);
  const [createForm] = Form.useForm();
  const [roleForm] = Form.useForm();

  const siteOptions = (sites ?? []).map((s) => ({ label: s.name, value: s.id }));

  const submitCreate = async (v: {
    email: string;
    password: string;
    role: string;
    siteId?: string;
  }) => {
    await createUser({
      email: v.email,
      password: v.password,
      roles: [{ role: v.role, siteId: v.siteId }],
    }).unwrap();
    message.success('User created');
    setCreateOpen(false);
    createForm.resetFields();
  };

  const submitRole = async (v: { role: string; siteId?: string }) => {
    if (!roleFor) return;
    await assignRole({ id: roleFor.id, role: v.role, siteId: v.siteId }).unwrap();
    message.success('Role assigned');
    setRoleFor(null);
    roleForm.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Users &amp; Roles
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Add user
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={{ pageSize: 10 }}
        columns={[
          { title: 'Email', dataIndex: 'email' },
          { title: 'Status', dataIndex: 'status', render: (s: string) => <Tag>{s}</Tag> },
          {
            title: 'MFA',
            dataIndex: 'mfaRequired',
            render: (m: boolean) => (m ? <Tag color="gold">required</Tag> : '—'),
          },
          {
            title: 'Roles',
            dataIndex: 'siteRoles',
            render: (roles: UserRecord['siteRoles']) =>
              roles?.map((r) => (
                <Tag key={r.id} color="blue">
                  {ROLE_LABELS[r.role] ?? r.role}
                  {r.siteId ? '' : ' (global)'}
                </Tag>
              )),
          },
          {
            title: 'Actions',
            render: (_: unknown, row: UserRecord) => (
              <Button size="small" onClick={() => setRoleFor(row)}>
                Add role
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title="Add user"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={submitCreate}>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input placeholder="clerk.mimosa@aes.local" />
          </Form.Item>
          <Form.Item name="password" label="Temporary password" rules={[{ required: true, min: 10 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <LookupSelect category="role" placeholder="Select a role" />
          </Form.Item>
          <Form.Item name="siteId" label="Site (leave empty for a global role)">
            <Select allowClear options={siteOptions} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`Assign role — ${roleFor?.email ?? ''}`}
        open={!!roleFor}
        onCancel={() => setRoleFor(null)}
        onOk={() => roleForm.submit()}
        confirmLoading={assignState.isLoading}
        destroyOnClose
      >
        <Form form={roleForm} layout="vertical" onFinish={submitRole}>
          <Form.Item name="role" label="Role" rules={[{ required: true }]}>
            <LookupSelect category="role" placeholder="Select a role" />
          </Form.Item>
          <Form.Item name="siteId" label="Site (leave empty for a global role)">
            <Select allowClear options={siteOptions} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
