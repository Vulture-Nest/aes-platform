import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  useCreateContractMutation,
  useGetClientsQuery,
  useGetContractsQuery,
  useUpdateContractMutation,
  type ContractRecord,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { LookupSelect } from '../../components/LookupSelect';
import { hasAnyRole } from '../../rbac/roles';

// Contract lifecycle is an engine-defined state, not admin-configured.
const STATUS = ['UPCOMING', 'ACTIVE', 'COMPLETED'];
const STATUS_COLOR: Record<string, string> = {
  UPCOMING: 'blue',
  ACTIVE: 'green',
  COMPLETED: 'default',
};

interface ContractForm {
  clientId: string;
  reference: string;
  valueExVat: number;
  currency: string;
  startDate: dayjs.Dayjs;
  endDate: dayjs.Dayjs;
  status: string;
}

export function ContractsPage() {
  const { data, isLoading } = useGetContractsQuery();
  const { data: clients } = useGetClientsQuery();
  const [create, createState] = useCreateContractMutation();
  const [update, updateState] = useUpdateContractMutation();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);
  const canWrite = hasAnyRole(user, ['FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'SYS_ADMIN']);

  const [editing, setEditing] = useState<ContractRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const clientName = (id: string) => clients?.find((c) => c.id === id)?.name ?? id.slice(0, 8);

  const submit = async (v: ContractForm) => {
    const body = {
      clientId: v.clientId,
      reference: v.reference,
      valueExVat: v.valueExVat,
      currency: v.currency,
      startDate: v.startDate.toISOString(),
      endDate: v.endDate.toISOString(),
      status: v.status,
    };
    if (editing) {
      await update({ id: editing.id, ...body }).unwrap();
      message.success('Contract updated');
    } else {
      await create(body).unwrap();
      message.success('Contract created');
    }
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Contracts
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
            Add contract
          </Button>
        )}
      </Space>
      <Typography.Paragraph type="secondary">
        Client agreements that orders are raised against.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Reference', dataIndex: 'reference' },
          { title: 'Client', dataIndex: 'clientId', render: (id: string) => clientName(id) },
          {
            title: 'Value (ex VAT)',
            render: (_: unknown, r: ContractRecord) =>
              `${r.currency} ${Number(r.valueExVat).toLocaleString()}`,
          },
          {
            title: 'Period',
            render: (_: unknown, r: ContractRecord) =>
              `${dayjs(r.startDate).format('DD MMM YYYY')} – ${dayjs(r.endDate).format('DD MMM YYYY')}`,
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => <Tag color={STATUS_COLOR[s] ?? 'default'}>{s}</Tag>,
          },
          {
            title: '',
            width: 90,
            render: (_: unknown, c: ContractRecord) =>
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
        title={editing ? 'Edit contract' : 'Add contract'}
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading || updateState.isLoading}
        destroyOnClose
        width={560}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={
            editing
              ? {
                  ...editing,
                  valueExVat: Number(editing.valueExVat),
                  startDate: dayjs(editing.startDate),
                  endDate: dayjs(editing.endDate),
                }
              : { status: 'UPCOMING' }
          }
        >
          <Form.Item name="clientId" label="Client" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={(clients ?? []).map((c) => ({ label: c.name, value: c.id }))}
              placeholder="Select a client"
            />
          </Form.Item>
          <Form.Item name="reference" label="Reference" rules={[{ required: true }]}>
            <Input placeholder="CTR-2025-001" />
          </Form.Item>
          <Space>
            <Form.Item name="valueExVat" label="Value (ex VAT)" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>
          <Space>
            <Form.Item name="startDate" label="Start date" rules={[{ required: true }]}>
              <DatePicker style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="endDate" label="End date" rules={[{ required: true }]}>
              <DatePicker style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Form.Item name="status" label="Status" rules={[{ required: true }]}>
            <Select options={STATUS.map((s) => ({ label: s, value: s }))} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
