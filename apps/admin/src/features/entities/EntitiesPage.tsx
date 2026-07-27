import { DeleteOutlined, GlobalOutlined, PlusOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  useCreateEntityHolidayMutation,
  useCreateEntityMutation,
  useDeleteEntityHolidayMutation,
  useGetEntitiesQuery,
  useGetEntityHolidaysQuery,
  useGetEntitySummaryQuery,
  type EntityRecord,
  type HolidayRecord,
} from './entitiesApi';

function EntitySummaryPanel({ id }: { id: string }) {
  const { data, isLoading } = useGetEntitySummaryQuery(id);
  return (
    <Row gutter={16}>
      <Col span={8}>
        <Statistic title="Sites" value={data?.counts.sites ?? 0} loading={isLoading} />
      </Col>
      <Col span={8}>
        <Statistic title="Employees" value={data?.counts.employees ?? 0} loading={isLoading} />
      </Col>
      <Col span={8}>
        <Statistic title="Orders" value={data?.counts.orders ?? 0} loading={isLoading} />
      </Col>
    </Row>
  );
}

function HolidaysPanel({ entity }: { entity: EntityRecord }) {
  const { data, isLoading } = useGetEntityHolidaysQuery(entity.id);
  const [create, createState] = useCreateEntityHolidayMutation();
  const [remove] = useDeleteEntityHolidayMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: { date: dayjs.Dayjs; name: string }) => {
    await create({
      id: entity.id,
      body: { date: v.date.format('YYYY-MM-DD'), name: v.name },
    }).unwrap();
    message.success('Public holiday added');
    setOpen(false);
    form.resetFields();
  };

  const del = async (holidayId: string) => {
    await remove({ id: entity.id, holidayId }).unwrap();
    message.success('Public holiday removed');
  };

  return (
    <Card
      size="small"
      style={{ marginTop: 16 }}
      title={`Public holidays — ${entity.name} (${entity.country})`}
      extra={
        <Button size="small" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Add holiday
        </Button>
      }
    >
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        locale={{ emptyText: 'No public holidays configured for this entity' }}
        columns={[
          {
            title: 'Date',
            dataIndex: 'date',
            render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
          },
          { title: 'Name', dataIndex: 'name' },
          {
            title: '',
            width: 48,
            render: (_: unknown, r: HolidayRecord) => (
              <Popconfirm title="Remove this holiday?" onConfirm={() => del(r.id)}>
                <Button size="small" type="text" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            ),
          },
        ]}
      />
      <Modal
        title="Add public holiday"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit} preserve={false}>
          <Form.Item name="date" label="Date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, min: 2 }]}
          >
            <Input placeholder="e.g. Independence Day" />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}

function ExpandedEntity({ entity }: { entity: EntityRecord }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <EntitySummaryPanel id={entity.id} />
      <HolidaysPanel entity={entity} />
    </div>
  );
}

export function EntitiesPage() {
  const { data, isLoading } = useGetEntitiesQuery();
  const [create, createState] = useCreateEntityMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: {
    name: string;
    country: string;
    baseCurrency: string;
    timezone?: string;
    locale?: string;
    chartOfAccountsRef?: string;
  }) => {
    await create({
      name: v.name,
      country: v.country.toUpperCase(),
      baseCurrency: v.baseCurrency.toUpperCase(),
      timezone: v.timezone || undefined,
      locale: v.locale || undefined,
      chartOfAccountsRef: v.chartOfAccountsRef || undefined,
    }).unwrap();
    message.success('Entity created');
    setOpen(false);
    form.resetFields();
  };

  return (
    <div>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>
            <GlobalOutlined /> Legal Entities
          </Typography.Title>
          <Typography.Text type="secondary">
            Multinational operating entities — each with its own country, base currency, timezone
            and public-holiday calendar. Create a second entity in a new country with its own
            currency to operate multinationally.
          </Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          New entity
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        expandable={{
          expandedRowRender: (r: EntityRecord) => <ExpandedEntity entity={r} />,
        }}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          {
            title: 'Country',
            dataIndex: 'country',
            render: (v: string) => <Tag>{v}</Tag>,
          },
          {
            title: 'Base currency',
            dataIndex: 'baseCurrency',
            render: (v: string) => <Tag color="blue">{v}</Tag>,
          },
          { title: 'Timezone', dataIndex: 'timezone' },
          { title: 'Locale', dataIndex: 'locale' },
          {
            title: 'Active',
            dataIndex: 'active',
            render: (v: boolean) =>
              v ? <Tag color="green">Active</Tag> : <Tag>Inactive</Tag>,
          },
        ]}
      />

      <Modal
        title="New legal entity"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          preserve={false}
          initialValues={{ timezone: 'Africa/Harare', locale: 'en' }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="e.g. AES Zambia" />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item
                name="country"
                label="Country (ISO-3166 alpha-2)"
                rules={[{ required: true, len: 2 }]}
              >
                <Input placeholder="ZM" maxLength={2} style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="baseCurrency"
                label="Base currency (ISO-4217)"
                rules={[{ required: true, len: 3 }]}
              >
                <Input placeholder="ZMW" maxLength={3} style={{ textTransform: 'uppercase' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="timezone" label="Timezone">
                <Input placeholder="Africa/Lusaka" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="locale" label="Locale">
                <Input placeholder="en" />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="chartOfAccountsRef" label="Chart-of-accounts reference (optional)">
            <Input placeholder="External CoA ref" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

export default EntitiesPage;
