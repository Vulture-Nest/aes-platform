import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Select, Space, Table, Typography } from 'antd';
import { useState } from 'react';
import {
  useCreateOrganisationMutation,
  useGetOrganisationsQuery,
  useGetUsersQuery,
  useUpdateOrganisationMutation,
  type CrmOrganisation,
} from '../../api/api';

export function OrganisationsTab() {
  const { data, isLoading } = useGetOrganisationsQuery();
  const { data: users } = useGetUsersQuery();
  const [create, createState] = useCreateOrganisationMutation();
  const [update, updateState] = useUpdateOrganisationMutation();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<CrmOrganisation | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const ownerEmail = (id: string | null) =>
    id ? (users?.find((u) => u.id === id)?.email ?? '—') : '—';

  const submit = async (v: Record<string, unknown>) => {
    if (editing) {
      await update({ id: editing.id, ...v }).unwrap();
      message.success('Organisation updated');
    } else {
      await create(v).unwrap();
      message.success('Organisation created');
    }
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Typography.Text type="secondary">Prospects and clients you do business with.</Typography.Text>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          Add organisation
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          { title: 'Industry', dataIndex: 'industry', render: (v: string | null) => v ?? '—' },
          { title: 'Source', dataIndex: 'source', render: (v: string | null) => v ?? '—' },
          {
            title: 'Owner',
            dataIndex: 'ownerUserId',
            render: (id: string | null) => ownerEmail(id),
          },
          {
            title: '',
            width: 90,
            render: (_: unknown, r: CrmOrganisation) => (
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
        title={editing ? 'Edit organisation' : 'Add organisation'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading || updateState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit} initialValues={editing ?? {}}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Mimosa Mining Company" />
          </Form.Item>
          <Space>
            <Form.Item name="industry" label="Industry">
              <Input placeholder="Mining" />
            </Form.Item>
            <Form.Item name="source" label="Source">
              <Input placeholder="Referral / tender" />
            </Form.Item>
          </Space>
          <Form.Item name="ownerUserId" label="Owner">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Assign an owner"
              options={(users ?? []).map((u) => ({ label: u.email, value: u.id }))}
            />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
