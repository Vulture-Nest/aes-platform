import { DollarOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  useCreateRequisitionMutation,
  useDisburseRequisitionMutation,
  useGetAccountsQuery,
  useGetRequisitionsQuery,
  useGetSitesQuery,
  useSubmitRequisitionMutation,
  type RequisitionRecord,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { LookupSelect } from '../../components/LookupSelect';
import { hasAnyRole } from '../../rbac/roles';
import { errorMessage, money, StatusTag } from './shared';

interface ReqForm {
  purpose: string;
  amount: number;
  currency: string;
  requiredByDate: dayjs.Dayjs;
  siteId?: string;
}

export function RequisitionsPage() {
  const { data, isLoading } = useGetRequisitionsQuery();
  const { data: sites } = useGetSitesQuery();
  const { data: accounts } = useGetAccountsQuery();
  const [create, createState] = useCreateRequisitionMutation();
  const [submit] = useSubmitRequisitionMutation();
  const [disburse, disburseState] = useDisburseRequisitionMutation();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);
  const canDisburse = hasAnyRole(user, ['FINANCE_OFFICER', 'FINANCE_DIRECTOR']);

  const [addOpen, setAddOpen] = useState(false);
  const [disburseFor, setDisburseFor] = useState<RequisitionRecord | null>(null);
  const [form] = Form.useForm();
  const [disburseForm] = Form.useForm();

  const submitForm = async (v: ReqForm) => {
    try {
      await create({
        purpose: v.purpose,
        amount: v.amount,
        currency: v.currency,
        requiredByDate: v.requiredByDate.toISOString(),
        siteId: v.siteId,
      }).unwrap();
      message.success('Requisition created');
      setAddOpen(false);
      form.resetFields();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const onSubmit = async (id: string) => {
    try {
      await submit(id).unwrap();
      message.success('Submitted for approval');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const submitDisburse = async (v: { accountId: string; reference: string }) => {
    if (!disburseFor) return;
    try {
      await disburse({ id: disburseFor.id, ...v }).unwrap();
      message.success('Disbursed');
      setDisburseFor(null);
      disburseForm.resetFields();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Cash requisitions
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
          New requisition
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        Raise → submit for approval → Finance disburses once approved and funded.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Purpose', dataIndex: 'purpose' },
          {
            title: 'Amount',
            align: 'right',
            render: (_: unknown, r: RequisitionRecord) => money(r.amount, r.currency),
          },
          {
            title: 'Required by',
            dataIndex: 'requiredByDate',
            render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => <StatusTag status={s} />,
          },
          {
            title: '',
            render: (_: unknown, r: RequisitionRecord) => (
              <Space>
                {r.status === 'DRAFT' && (
                  <Popconfirm title="Submit for approval?" onConfirm={() => onSubmit(r.id)}>
                    <Button size="small" icon={<SendOutlined />}>
                      Submit
                    </Button>
                  </Popconfirm>
                )}
                {canDisburse && r.status === 'APPROVED_READY_TO_PAY' && (
                  <Button size="small" icon={<DollarOutlined />} onClick={() => setDisburseFor(r)}>
                    Disburse
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="New cash requisition"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submitForm}>
          <Form.Item name="purpose" label="Purpose" rules={[{ required: true }]}>
            <Input placeholder="Site fuel top-up for July haulage" />
          </Form.Item>
          <Space>
            <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>
          <Form.Item name="requiredByDate" label="Required by" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="siteId" label="Site (optional)">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select a site"
              options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Disburse requisition"
        open={!!disburseFor}
        onCancel={() => setDisburseFor(null)}
        onOk={() => disburseForm.submit()}
        confirmLoading={disburseState.isLoading}
        destroyOnClose
      >
        <Form form={disburseForm} layout="vertical" onFinish={submitDisburse}>
          <Form.Item name="accountId" label="Source account" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Bank / cash account"
              options={(accounts ?? []).map((a) => ({
                label: `${a.name} (${a.currency})`,
                value: a.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="reference" label="Payment reference" rules={[{ required: true }]}>
            <Input placeholder="EFT-99213" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
