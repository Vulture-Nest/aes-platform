import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useCreateSiteMutation, useGetSitesQuery, useUpdateSiteMutation } from '../../api/api';

const TYPE_OPTIONS = [
  { label: 'Mine site', value: 'MINE_SITE' },
  { label: 'Head office', value: 'HEAD_OFFICE' },
];

export function SitesPage() {
  const { data, isLoading } = useGetSitesQuery();
  const [createSite, createState] = useCreateSiteMutation();
  const [updateSite] = useUpdateSiteMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: { name: string; type: 'MINE_SITE' | 'HEAD_OFFICE' }) => {
    await createSite(v).unwrap();
    message.success('Site created');
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Sites
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Add site
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          { title: 'Type', dataIndex: 'type', render: (t: string) => <Tag>{t}</Tag> },
          {
            title: 'Active',
            dataIndex: 'active',
            render: (a: boolean, row) => (
              <Select
                size="small"
                value={a}
                style={{ width: 110 }}
                onChange={(active) => updateSite({ id: row.id, active })}
                options={[
                  { label: 'Active', value: true },
                  { label: 'Inactive', value: false },
                ]}
              />
            ),
          },
        ]}
      />
      <Modal
        title="Add site"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="name" label="Name" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="Mimosa" />
          </Form.Item>
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select options={TYPE_OPTIONS} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
