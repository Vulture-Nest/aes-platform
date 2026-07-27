import { PlusOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Divider,
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
  CAMPAIGN_STATUS_COLOR,
  CAMPAIGN_STATUSES,
  CHANNEL_TYPES,
  money,
  num,
} from './marketing-constants';
import {
  useCreateCampaignMutation,
  useCreateChannelMutation,
  useCreateMetricMutation,
  useGetCampaignsQuery,
  useGetChannelsQuery,
  useGetMetricsQuery,
  useGetMktUsersQuery,
  type Campaign,
  type CampaignChannel,
} from './marketingApi';

interface CampaignForm {
  name: string;
  objective?: string;
  audience?: string;
  budget?: number;
  currency?: string;
  dates?: [dayjs.Dayjs, dayjs.Dayjs];
  status?: string;
  ownerUserId?: string;
}

interface ChannelForm {
  channelType: string;
  cost?: number;
  currency?: string;
  printRunQty?: number;
  trackingLink?: string;
}

interface MetricForm {
  weekOf: dayjs.Dayjs;
  impressions?: number;
  engagements?: number;
  clicks?: number;
  spend?: number;
}

function MetricsPanel({ channel }: { channel: CampaignChannel }) {
  const { data, isLoading } = useGetMetricsQuery(channel.id);
  const [create, createState] = useCreateMetricMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<MetricForm>();

  const submit = async (v: MetricForm) => {
    await create({
      channelId: channel.id,
      weekOf: v.weekOf.toISOString(),
      impressions: v.impressions,
      engagements: v.engagements,
      clicks: v.clicks,
      spend: v.spend,
    }).unwrap();
    message.success('Metric recorded');
    setOpen(false);
    form.resetFields();
  };

  return (
    <div style={{ padding: '4px 0 8px' }}>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 8 }}>
        <Typography.Text type="secondary">
          Weekly metrics for {channel.channelType}
          {channel.flierCode ? ` (${channel.flierCode})` : ''}
        </Typography.Text>
        <Button
          size="small"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            setOpen(true);
          }}
        >
          Add metric
        </Button>
      </Space>
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        pagination={false}
        dataSource={data}
        locale={{ emptyText: 'No metrics yet' }}
        columns={[
          {
            title: 'Week of',
            dataIndex: 'weekOf',
            render: (v: string) => (v ? dayjs(v).format('YYYY-MM-DD') : '—'),
          },
          { title: 'Impressions', dataIndex: 'impressions', render: (v: number) => num(v) },
          { title: 'Engagements', dataIndex: 'engagements', render: (v: number) => num(v) },
          { title: 'Clicks', dataIndex: 'clicks', render: (v: number) => num(v) },
          {
            title: 'Spend',
            dataIndex: 'spend',
            render: (v: string | number) => money(v, channel.currency),
          },
        ]}
      />
      <Modal
        title="Record weekly metric"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="weekOf" label="Week of (Monday)" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Space wrap>
            <Form.Item name="impressions" label="Impressions">
              <InputNumber min={0} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="engagements" label="Engagements">
              <InputNumber min={0} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="clicks" label="Clicks">
              <InputNumber min={0} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="spend" label="Spend">
              <InputNumber min={0} style={{ width: 160 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </div>
  );
}

function CampaignDetail({ campaign }: { campaign: Campaign }) {
  const { data: channels, isLoading } = useGetChannelsQuery(campaign.id);
  const [create, createState] = useCreateChannelMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<ChannelForm>();
  const channelType = Form.useWatch('channelType', form);

  const submit = async (v: ChannelForm) => {
    await create({
      campaignId: campaign.id,
      channelType: v.channelType,
      cost: v.cost,
      currency: v.currency,
      printRunQty: v.printRunQty,
      trackingLink: v.trackingLink,
    }).unwrap();
    message.success('Channel added');
    setOpen(false);
    form.resetFields();
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <span>Channels</span>
          <Typography.Text type="secondary" style={{ fontWeight: 400 }}>
            {campaign.name}
          </Typography.Text>
        </Space>
      }
      extra={
        <Button
          size="small"
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            setOpen(true);
          }}
        >
          Add channel
        </Button>
      }
      style={{ marginTop: 12 }}
    >
      <Descriptions size="small" column={3} style={{ marginBottom: 12 }}>
        <Descriptions.Item label="Objective">{campaign.objective ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Audience">{campaign.audience ?? '—'}</Descriptions.Item>
        <Descriptions.Item label="Budget">
          {money(campaign.budget, campaign.currency)}
        </Descriptions.Item>
      </Descriptions>
      <Table
        rowKey="id"
        size="small"
        loading={isLoading}
        pagination={false}
        dataSource={channels}
        locale={{ emptyText: 'No channels yet' }}
        expandable={{
          expandedRowRender: (r) => <MetricsPanel channel={r} />,
        }}
        columns={[
          { title: 'Type', dataIndex: 'channelType', render: (v: string) => <Tag>{v}</Tag> },
          {
            title: 'Cost',
            dataIndex: 'cost',
            render: (v: string | number, r: CampaignChannel) => money(v, r.currency),
          },
          {
            title: 'Flier code',
            dataIndex: 'flierCode',
            render: (v: string | null) => v ?? '—',
          },
          {
            title: 'Print run',
            dataIndex: 'printRunQty',
            render: (v: number | null) => num(v),
          },
          {
            title: 'Tracking link',
            dataIndex: 'trackingLink',
            render: (v: string | null) => v ?? '—',
          },
        ]}
      />
      <Modal
        title="Add channel"
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
          initialValues={{ currency: campaign.currency ?? 'USD' }}
        >
          <Form.Item name="channelType" label="Channel type" rules={[{ required: true }]}>
            <Select
              showSearch
              placeholder="Facebook / LinkedIn / Flier…"
              options={CHANNEL_TYPES.map((t) => ({ label: t, value: t }))}
            />
          </Form.Item>
          <Space wrap>
            <Form.Item name="cost" label="Cost">
              <InputNumber min={0} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency">
              <Input style={{ width: 120 }} placeholder="USD" />
            </Form.Item>
          </Space>
          {channelType === 'Flier' && (
            <Form.Item
              name="printRunQty"
              label="Print run quantity"
              extra="Flier code is auto-generated (AES-FL-…)"
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
          )}
          <Form.Item name="trackingLink" label="Tracking link (optional)">
            <Input placeholder="https://…" />
          </Form.Item>
        </Form>
      </Modal>
      <Divider style={{ margin: '12px 0 0' }} />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        Expand a channel row to record weekly metrics.
      </Typography.Text>
    </Card>
  );
}

export function CampaignsTab() {
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const { data, isLoading } = useGetCampaignsQuery(
    statusFilter ? { status: statusFilter } : undefined,
  );
  const { data: users } = useGetMktUsersQuery();
  const [create, createState] = useCreateCampaignMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Campaign | null>(null);
  const [form] = Form.useForm<CampaignForm>();

  const ownerEmail = (id?: string | null) =>
    id ? (users?.find((u) => u.id === id)?.email ?? '—') : '—';

  const submit = async (v: CampaignForm) => {
    await create({
      name: v.name,
      objective: v.objective,
      audience: v.audience,
      budget: v.budget,
      currency: v.currency,
      status: v.status,
      ownerUserId: v.ownerUserId,
      startDate: v.dates?.[0]?.toISOString(),
      endDate: v.dates?.[1]?.toISOString(),
    }).unwrap();
    message.success('Campaign created');
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Space>
          <Typography.Text type="secondary">
            Plan campaigns; select one to manage its channels and weekly metrics.
          </Typography.Text>
          <Select<string>
            allowClear
            placeholder="All statuses"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={CAMPAIGN_STATUSES.map((s) => ({ label: s, value: s }))}
          />
        </Space>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            form.resetFields();
            setOpen(true);
          }}
        >
          New campaign
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        rowClassName={(r) => (r.id === selected?.id ? 'ant-table-row-selected' : '')}
        onRow={(r) => ({ onClick: () => setSelected(r), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          { title: 'Objective', dataIndex: 'objective', render: (v: string | null) => v ?? '—' },
          {
            title: 'Budget',
            dataIndex: 'budget',
            render: (v: string | number, r: Campaign) => money(v, r.currency),
          },
          {
            title: 'Window',
            render: (_: unknown, r: Campaign) =>
              r.startDate
                ? `${dayjs(r.startDate).format('YYYY-MM-DD')} → ${
                    r.endDate ? dayjs(r.endDate).format('YYYY-MM-DD') : '…'
                  }`
                : '—',
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (v: string | null) =>
              v ? <Tag color={CAMPAIGN_STATUS_COLOR[v] ?? 'default'}>{v}</Tag> : '—',
          },
          {
            title: 'Owner',
            dataIndex: 'ownerUserId',
            render: (id: string | null) => ownerEmail(id),
          },
        ]}
      />

      {selected && <CampaignDetail campaign={selected} />}

      <Modal
        title="New campaign"
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
          initialValues={{ status: 'PLANNED', currency: 'USD' }}
        >
          <Form.Item name="name" label="Name" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="Q3 Mining-sector water-treatment push" />
          </Form.Item>
          <Form.Item name="objective" label="Objective">
            <Input placeholder="Generate 20 qualified leads from the platinum belt" />
          </Form.Item>
          <Form.Item name="audience" label="Audience">
            <Input placeholder="Mine procurement + facilities managers" />
          </Form.Item>
          <Space wrap>
            <Form.Item name="budget" label="Budget">
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency">
              <Input style={{ width: 120 }} placeholder="USD" />
            </Form.Item>
          </Space>
          <Form.Item name="dates" label="Start / end">
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Space wrap>
            <Form.Item name="status" label="Status">
              <Select
                style={{ width: 200 }}
                options={CAMPAIGN_STATUSES.map((s) => ({ label: s, value: s }))}
              />
            </Form.Item>
            <Form.Item name="ownerUserId" label="Owner">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                style={{ width: 220 }}
                placeholder="Owner"
                options={(users ?? []).map((u) => ({ label: u.email, value: u.id }))}
              />
            </Form.Item>
          </Space>
        </Form>
      </Modal>
    </>
  );
}
