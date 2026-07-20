import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import { useState } from 'react';
import {
  useCreateApprovalRuleMutation,
  useDeleteApprovalRuleMutation,
  useGetApprovalMatrixQuery,
  useGetApprovalOptionsQuery,
  useUpdateApprovalRuleMutation,
} from '../../api/api';
import { LookupSelect } from '../../components/LookupSelect';

export function ApprovalMatrixPage() {
  const { data, isLoading } = useGetApprovalMatrixQuery();
  const { data: options } = useGetApprovalOptionsQuery();
  const [create, createState] = useCreateApprovalRuleMutation();
  const [update] = useUpdateApprovalRuleMutation();
  const [remove] = useDeleteApprovalRuleMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: Record<string, unknown>) => {
    await create(v).unwrap();
    message.success('Approval rule added');
    setOpen(false);
    form.resetFields();
  };

  const toggle = async (id: string, active: boolean) => {
    await update({ id, active }).unwrap();
    message.success(active ? 'Rule enabled' : 'Rule disabled');
  };

  const onRemove = async (id: string) => {
    await remove(id).unwrap();
    message.success('Rule deleted');
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
          {
            title: 'Active',
            dataIndex: 'active',
            render: (active: boolean, r) => (
              <Switch checked={active} onChange={(v) => toggle(r.id, v)} />
            ),
          },
          {
            title: '',
            width: 48,
            render: (_: unknown, r) => (
              <Popconfirm title="Delete this rule?" onConfirm={() => onRemove(r.id)}>
                <Button size="small" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
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
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ stepOrder: 1 }}>
          <Form.Item name="module" label="Module" rules={[{ required: true }]}>
            <Select showSearch options={options?.modules ?? []} placeholder="Select a module" />
          </Form.Item>
          <Space>
            <Form.Item name="minAmount" label="Min amount">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="maxAmount" label="Max amount">
              <InputNumber min={0} />
            </Form.Item>
            <Form.Item name="currency" label="Currency">
              <LookupSelect category="currency" allowClear style={{ width: 90 }} />
            </Form.Item>
          </Space>
          <Form.Item name="stepOrder" label="Step order" rules={[{ required: true }]}>
            <InputNumber min={1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="approverRole" label="Approver role" rules={[{ required: true }]}>
            <LookupSelect category="role" placeholder="Select a role" />
          </Form.Item>
          <Form.Item name="mode" label="Mode" rules={[{ required: true }]}>
            <Select options={options?.modes ?? []} placeholder="Select a mode" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
