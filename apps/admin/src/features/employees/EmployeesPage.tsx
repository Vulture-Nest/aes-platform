import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useCreateEmployeeMutation, useGetEmployeesQuery, useGetSitesQuery } from '../../api/api';

const EMPLOYMENT = ['PERMANENT', 'CONTRACT', 'CASUAL'];
const PAY_MODES = ['CLIENT_RATIO', 'FIXED_SPLIT'];

export function EmployeesPage() {
  const { data, isLoading } = useGetEmployeesQuery();
  const { data: sites } = useGetSitesQuery();
  const [create, createState] = useCreateEmployeeMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const payMode = Form.useWatch('payMode', form);

  const submit = async (v: Record<string, unknown>) => {
    await create(v).unwrap();
    message.success('Employee added');
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Employees (HR-lite)
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Add employee
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        Bank account numbers are masked; every view is audited (payroll privacy).
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Works no.', dataIndex: 'worksNo' },
          { title: 'Name', render: (_: unknown, r) => `${r.firstName} ${r.lastName}` },
          {
            title: 'Site',
            dataIndex: 'siteId',
            render: (id: string) => sites?.find((s) => s.id === id)?.name ?? id.slice(0, 8),
          },
          { title: 'Employment', dataIndex: 'employmentType', render: (t: string) => <Tag>{t}</Tag> },
          { title: 'Pay mode', dataIndex: 'payMode', render: (t: string) => <Tag color="blue">{t}</Tag> },
          { title: 'Account', dataIndex: 'accountNo', render: (a: string | null) => a ?? '—' },
        ]}
      />
      <Modal
        title="Add employee"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
        width={560}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={{ employmentType: 'PERMANENT', payMode: 'CLIENT_RATIO', accountCurrency: 'USD' }}
        >
          <Space>
            <Form.Item name="worksNo" label="Works no." rules={[{ required: true }]}>
              <Input placeholder="W-0421" />
            </Form.Item>
            <Form.Item name="firstName" label="First name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="lastName" label="Last name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
          </Space>
          <Form.Item name="siteId" label="Site" rules={[{ required: true }]}>
            <Select options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))} />
          </Form.Item>
          <Space>
            <Form.Item name="employmentType" label="Employment" rules={[{ required: true }]}>
              <Select style={{ width: 140 }} options={EMPLOYMENT.map((e) => ({ label: e, value: e }))} />
            </Form.Item>
            <Form.Item name="payMode" label="Pay mode" rules={[{ required: true }]}>
              <Select style={{ width: 150 }} options={PAY_MODES.map((p) => ({ label: p, value: p }))} />
            </Form.Item>
            {payMode === 'FIXED_SPLIT' && (
              <Form.Item name="fixedUsdPct" label="USD split %" rules={[{ required: true }]}>
                <InputNumber min={0} max={100} />
              </Form.Item>
            )}
          </Space>
          <Space>
            <Form.Item name="hourlyRate" label="Hourly rate">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="accountCurrency" label="Account currency">
              <Select style={{ width: 100 }} options={[{ label: 'USD', value: 'USD' }, { label: 'ZWG', value: 'ZWG' }]} />
            </Form.Item>
            <Form.Item name="accountNo" label="Account no.">
              <Input />
            </Form.Item>
          </Space>
          <Form.Item name="startDate" label="Start date" rules={[{ required: true }]}>
            <Input type="date" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
