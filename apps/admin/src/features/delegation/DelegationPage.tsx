import { PlusOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Form, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useCreateDelegationMutation, useGetDelegationsQuery, useGetUsersQuery } from '../../api/api';

export function DelegationPage() {
  const { data, isLoading } = useGetDelegationsQuery();
  const { data: users } = useGetUsersQuery();
  const [create, createState] = useCreateDelegationMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const userOptions = (users ?? []).map((u) => ({ label: u.email, value: u.id }));
  const emailFor = (id: string) => users?.find((u) => u.id === id)?.email ?? id;

  const submit = async (v: {
    approverUserId: string;
    delegateUserId: string;
    range: [dayjs.Dayjs, dayjs.Dayjs];
  }) => {
    await create({
      approverUserId: v.approverUserId,
      delegateUserId: v.delegateUserId,
      dateFrom: v.range[0].toISOString(),
      dateTo: v.range[1].toISOString(),
    }).unwrap();
    message.success('Delegation window created');
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Delegation
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Add delegation
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        Approver → alternate substitution for a date range. The approval engine uses the active
        window automatically.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Approver', dataIndex: 'approverUserId', render: emailFor },
          { title: 'Delegate', dataIndex: 'delegateUserId', render: emailFor },
          { title: 'From', dataIndex: 'dateFrom', render: (d: string) => dayjs(d).format('YYYY-MM-DD') },
          { title: 'To', dataIndex: 'dateTo', render: (d: string) => dayjs(d).format('YYYY-MM-DD') },
          {
            title: 'Active',
            dataIndex: 'active',
            render: (a: boolean) => (a ? <Tag color="green">active</Tag> : <Tag>inactive</Tag>),
          },
        ]}
      />
      <Modal
        title="Add delegation"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="approverUserId" label="Approver" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={userOptions} />
          </Form.Item>
          <Form.Item name="delegateUserId" label="Delegate" rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={userOptions} />
          </Form.Item>
          <Form.Item name="range" label="Window" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
