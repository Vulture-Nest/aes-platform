import { EyeOutlined, MinusCircleOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  DatePicker,
  Descriptions,
  Divider,
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
  useCreateBudgetMutation,
  useGetBudgetQuery,
  useGetBudgetsQuery,
  useGetSitesQuery,
  useSubmitBudgetMutation,
  type BudgetActualRow,
  type BudgetLineRecord,
  type BudgetRecord,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { LookupSelect } from '../../components/LookupSelect';
import { hasAnyRole } from '../../rbac/roles';
import { errorMessage, money, StatusTag } from './shared';

function BudgetDetailView({ id, siteName }: { id: string; siteName: (id: string) => string }) {
  const { data, isFetching } = useGetBudgetQuery(id);
  if (isFetching || !data) return <Typography.Text type="secondary">Loading…</Typography.Text>;
  return (
    <>
      <Descriptions column={2} size="small" bordered style={{ marginBottom: 16 }}>
        <Descriptions.Item label="Name">{data.name}</Descriptions.Item>
        <Descriptions.Item label="Status">
          <StatusTag status={data.status} />
        </Descriptions.Item>
        <Descriptions.Item label="Period">{data.periodMonth ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Site">
          {data.siteId ? siteName(data.siteId) : 'All sites'}
        </Descriptions.Item>
        <Descriptions.Item label="Version">{data.version}</Descriptions.Item>
        <Descriptions.Item label="Currency">{data.currency}</Descriptions.Item>
      </Descriptions>
      <Typography.Title level={5}>Lines</Typography.Title>
      <Table
        rowKey="id"
        size="small"
        pagination={false}
        dataSource={data.lines}
        columns={[
          { title: 'Category', dataIndex: 'category' },
          { title: 'Description', dataIndex: 'description', render: (v: string | null) => v ?? '—' },
          {
            title: 'Amount',
            align: 'right',
            render: (_: unknown, r: BudgetLineRecord) => money(r.amount, r.currency),
          },
        ]}
      />
      {data.actuals && data.actuals.length > 0 && (
        <>
          <Typography.Title level={5} style={{ marginTop: 16 }}>
            Actuals vs budget
          </Typography.Title>
          <Table
            rowKey="category"
            size="small"
            pagination={false}
            dataSource={data.actuals}
            columns={[
              { title: 'Category', dataIndex: 'category' },
              { title: 'Budget', align: 'right', render: (_: unknown, r: BudgetActualRow) => money(r.budget) },
              { title: 'Actual', align: 'right', render: (_: unknown, r: BudgetActualRow) => money(r.actual) },
              {
                title: 'Variance',
                align: 'right',
                render: (_: unknown, r: BudgetActualRow) => (
                  <Typography.Text type={r.variance < 0 ? 'danger' : 'success'}>
                    {money(r.variance)}
                  </Typography.Text>
                ),
              },
            ]}
          />
        </>
      )}
    </>
  );
}

interface BudgetForm {
  name: string;
  periodMonth?: dayjs.Dayjs;
  siteId?: string;
  currency: string;
  lines: { category: string; description?: string; amount: number }[];
}

export function BudgetsPage() {
  const { data, isLoading } = useGetBudgetsQuery();
  const { data: sites } = useGetSitesQuery();
  const [create, createState] = useCreateBudgetMutation();
  const [submit] = useSubmitBudgetMutation();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);
  const canManage = hasAnyRole(user, ['FINANCE_OFFICER', 'FINANCE_DIRECTOR']);

  const [addOpen, setAddOpen] = useState(false);
  const [viewId, setViewId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const siteName = (id: string) => sites?.find((s) => s.id === id)?.name ?? id.slice(0, 8);

  const submitForm = async (v: BudgetForm) => {
    try {
      await create({
        name: v.name,
        periodMonth: v.periodMonth ? v.periodMonth.format('YYYY-MM') : undefined,
        siteId: v.siteId,
        currency: v.currency,
        lines: v.lines,
      }).unwrap();
      message.success('Budget created');
      setAddOpen(false);
      form.resetFields();
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const onSubmit = async (id: string) => {
    try {
      await submit(id).unwrap();
      message.success('Submitted for OD + FD co-approval');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Budgets
        </Typography.Title>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            New budget
          </Button>
        )}
      </Space>
      <Typography.Paragraph type="secondary">
        Create with line items → submit for parallel Ops-Director + Finance-Director approval.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          { title: 'Period', dataIndex: 'periodMonth', render: (v: string | null) => v ?? '—' },
          {
            title: 'Site',
            dataIndex: 'siteId',
            render: (v: string | null) => (v ? siteName(v) : 'All sites'),
          },
          { title: 'Ver.', dataIndex: 'version', align: 'right' },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => <StatusTag status={s} />,
          },
          {
            title: '',
            render: (_: unknown, r: BudgetRecord) => (
              <Space>
                <Button size="small" icon={<EyeOutlined />} onClick={() => setViewId(r.id)}>
                  View
                </Button>
                {canManage && r.status === 'DRAFT' && (
                  <Popconfirm title="Submit for co-approval?" onConfirm={() => onSubmit(r.id)}>
                    <Button size="small" icon={<SendOutlined />}>
                      Submit
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title="New budget"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
        width={640}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submitForm}
          initialValues={{ lines: [{ category: '', amount: undefined }] }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="July 2026 Site Operating Budget" />
          </Form.Item>
          <Space>
            <Form.Item name="periodMonth" label="Period (optional)">
              <DatePicker picker="month" />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
            <Form.Item name="siteId" label="Site (optional)">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder="All sites"
                style={{ width: 180 }}
                options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
              />
            </Form.Item>
          </Space>
          <Divider>Line items</Divider>
          <Form.List name="lines">
            {(fields, { add, remove }) => (
              <>
                {fields.map((field) => (
                  <Space key={field.key} align="baseline" style={{ display: 'flex' }}>
                    <Form.Item
                      name={[field.name, 'category']}
                      rules={[{ required: true, message: 'Category' }]}
                    >
                      <Input placeholder="Category (e.g. Fuel)" style={{ width: 180 }} />
                    </Form.Item>
                    <Form.Item name={[field.name, 'description']}>
                      <Input placeholder="Description" style={{ width: 200 }} />
                    </Form.Item>
                    <Form.Item
                      name={[field.name, 'amount']}
                      rules={[{ required: true, message: 'Amount' }]}
                    >
                      <InputNumber min={0} placeholder="Amount" style={{ width: 130 }} />
                    </Form.Item>
                    {fields.length > 1 && (
                      <MinusCircleOutlined onClick={() => remove(field.name)} />
                    )}
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                  Add line
                </Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      <Modal
        title="Budget"
        open={!!viewId}
        onCancel={() => setViewId(null)}
        footer={
          <Button type="primary" onClick={() => setViewId(null)}>
            Close
          </Button>
        }
        width={720}
        destroyOnClose
      >
        {viewId && <BudgetDetailView id={viewId} siteName={siteName} />}
      </Modal>
    </>
  );
}
