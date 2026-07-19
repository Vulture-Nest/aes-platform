import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useCreateApprovalRuleMutation, useGetApprovalMatrixQuery } from '../../api/api';
import { ALL_ROLES, ROLE_LABELS } from '../../rbac/roles';

const MODULES = ['requisition', 'travel', 'petty_cash', 'budget', 'director_withdrawal', 'payroll_run', 'timesheet_period'];
const MODES = ['SEQUENTIAL', 'PARALLEL', 'EITHER'];

export function ApprovalMatrixPage() {
  const { data, isLoading } = useGetApprovalMatrixQuery();
  const [create, createState] = useCreateApprovalRuleMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: Record<string, unknown>) => {
    await create(v).unwrap();
    message.success('Approval rule added');
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Approval Matrix
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Add rule
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        Routing rules for the approval engine — who approves what, in which order. Change routing
        here without any code change.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Module', dataIndex: 'module', render: (m: string) => <Tag color="geekblue">{m}</Tag> },
          {
            title: 'Amount band',
            render: (_: unknown, r) =>
              r.minAmount || r.maxAmount ? `${r.minAmount ?? '0'} – ${r.maxAmount ?? '∞'} ${r.currency ?? ''}` : 'any',
          },
          { title: 'Step', dataIndex: 'stepOrder' },
          { title: 'Approver role', dataIndex: 'approverRole', render: (r: string) => <Tag color="blue">{r}</Tag> },
          { title: 'Mode', dataIndex: 'mode', render: (m: string) => <Tag>{m}</Tag> },
        ]}
      />
      <Modal
        title="Add approval rule"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ stepOrder: 1, mode: 'SEQUENTIAL' }}>
          <Form.Item name="module" label="Module" rules={[{ required: true }]}>
            <Select showSearch options={MODULES.map((m) => ({ label: m, value: m }))} />
          </Form.Item>
          <Space>
            <Form.Item name="minAmount" label="Min amount">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="maxAmount" label="Max amount">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="currency" label="Currency">
              <Select allowClear style={{ width: 90 }} options={[{ label: 'USD', value: 'USD' }, { label: 'ZWG', value: 'ZWG' }]} />
            </Form.Item>
          </Space>
          <Form.Item name="stepOrder" label="Step order" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="approverRole" label="Approver role" rules={[{ required: true }]}>
            <Select options={ALL_ROLES.map((r) => ({ label: ROLE_LABELS[r], value: r }))} />
          </Form.Item>
          <Form.Item name="mode" label="Mode" rules={[{ required: true }]}>
            <Select options={MODES.map((m) => ({ label: m, value: m }))} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
