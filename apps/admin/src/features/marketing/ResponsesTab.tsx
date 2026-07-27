import { PlusOutlined, SwapOutlined } from '@ant-design/icons';
import {
  App,
  Button,
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
import { useGetOrganisationsQuery, useGetUsersQuery } from '../../api/api';
import { RESPONSE_STATUS_COLOR } from './marketing-constants';
import {
  RESPONSE_STATUSES,
  useConvertResponseMutation,
  useCreateResponseMutation,
  useGetCampaignsQuery,
  useGetChannelsQuery,
  useGetResponsesQuery,
  useUpdateResponseStatusMutation,
  type CampaignResponse,
  type ResponseStatus,
} from './marketingApi';

interface ResponseForm {
  personName?: string;
  orgName?: string;
  contactEmail?: string;
  contactPhone?: string;
  howHeard: string;
  campaignId?: string;
  channelId?: string;
}

interface ConvertForm {
  title: string;
  organisationId?: string;
  estimatedValue?: number;
  currency?: string;
  ownerUserId?: string;
}

export function ResponsesTab() {
  const [statusFilter, setStatusFilter] = useState<ResponseStatus | undefined>(undefined);
  const { data, isLoading } = useGetResponsesQuery(
    statusFilter ? { status: statusFilter } : undefined,
  );
  const { data: campaigns } = useGetCampaignsQuery();
  const { data: orgs } = useGetOrganisationsQuery();
  const { data: users } = useGetUsersQuery();
  const [create, createState] = useCreateResponseMutation();
  const [updateStatus] = useUpdateResponseStatusMutation();
  const [convert, convertState] = useConvertResponseMutation();
  const { message } = App.useApp();

  const [open, setOpen] = useState(false);
  const [convertFor, setConvertFor] = useState<CampaignResponse | null>(null);
  const [form] = Form.useForm<ResponseForm>();
  const [convertForm] = Form.useForm<ConvertForm>();
  const formCampaignId = Form.useWatch('campaignId', form);

  // Channels for the campaign selected inside the create form.
  const { data: formChannels } = useGetChannelsQuery(formCampaignId ?? '', {
    skip: !formCampaignId,
  });

  const campaignName = (id?: string | null) =>
    id ? (campaigns?.find((c) => c.id === id)?.name ?? '—') : '—';

  const submit = async (v: ResponseForm) => {
    await create({
      personName: v.personName,
      orgName: v.orgName,
      contactEmail: v.contactEmail,
      contactPhone: v.contactPhone,
      howHeard: v.howHeard,
      campaignId: v.campaignId,
      channelId: v.channelId,
    }).unwrap();
    message.success('Lead captured');
    setOpen(false);
    form.resetFields();
  };

  const changeStatus = async (r: CampaignResponse, status: ResponseStatus) => {
    if (status === r.status) return;
    await updateStatus({ id: r.id, status }).unwrap();
    message.success(`Moved to ${status}`);
  };

  const submitConvert = async (v: ConvertForm) => {
    if (!convertFor) return;
    await convert({
      id: convertFor.id,
      title: v.title,
      organisationId: v.organisationId,
      estimatedValue: v.estimatedValue,
      currency: v.currency,
      ownerUserId: v.ownerUserId,
    }).unwrap();
    message.success('Converted to opportunity');
    setConvertFor(null);
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Space>
          <Typography.Text type="secondary">
            Inbound leads from campaigns. Progress status or convert into a CRM opportunity.
          </Typography.Text>
          <Select<ResponseStatus>
            allowClear
            placeholder="All statuses"
            style={{ width: 160 }}
            value={statusFilter}
            onChange={setStatusFilter}
            options={RESPONSE_STATUSES.map((s) => ({ label: s, value: s }))}
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
          Capture lead
        </Button>
      </Space>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Person', dataIndex: 'personName', render: (v: string | null) => v ?? '—' },
          { title: 'Organisation', dataIndex: 'orgName', render: (v: string | null) => v ?? '—' },
          {
            title: 'Contact',
            render: (_: unknown, r: CampaignResponse) =>
              r.contactEmail || r.contactPhone || '—',
          },
          { title: 'How heard', dataIndex: 'howHeard', render: (v: string) => v ?? '—' },
          {
            title: 'Campaign',
            dataIndex: 'campaignId',
            render: (id: string | null) => campaignName(id),
          },
          {
            title: 'Received',
            dataIndex: 'receivedAt',
            render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '—'),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            width: 160,
            render: (status: ResponseStatus, r: CampaignResponse) => (
              <Select<ResponseStatus>
                size="small"
                value={status}
                style={{ width: 140 }}
                onChange={(s) => changeStatus(r, s)}
                options={RESPONSE_STATUSES.map((s) => ({
                  label: (
                    <Tag color={RESPONSE_STATUS_COLOR[s]} style={{ marginInlineEnd: 0 }}>
                      {s}
                    </Tag>
                  ),
                  value: s,
                }))}
              />
            ),
          },
          {
            title: '',
            width: 130,
            render: (_: unknown, r: CampaignResponse) => (
              <Button
                size="small"
                icon={<SwapOutlined />}
                onClick={() => {
                  convertForm.resetFields();
                  setConvertFor(r);
                }}
              >
                Convert
              </Button>
            ),
          },
        ]}
      />

      {/* Capture lead */}
      <Modal
        title="Capture lead"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
        width={560}
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Space wrap>
            <Form.Item name="personName" label="Person">
              <Input style={{ width: 240 }} placeholder="Tendai Moyo" />
            </Form.Item>
            <Form.Item name="orgName" label="Organisation">
              <Input style={{ width: 240 }} placeholder="Mimosa Mining Co" />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item name="contactEmail" label="Email" rules={[{ type: 'email' }]}>
              <Input style={{ width: 240 }} placeholder="tendai@mimosa.co.zw" />
            </Form.Item>
            <Form.Item name="contactPhone" label="Phone">
              <Input style={{ width: 240 }} placeholder="+263771234567" />
            </Form.Item>
          </Space>
          <Form.Item
            name="howHeard"
            label="How heard"
            rules={[{ required: true, message: 'How heard is required' }]}
          >
            <Input placeholder="Facebook ad / flier AES-FL-001 / expo" />
          </Form.Item>
          <Form.Item name="campaignId" label="Campaign">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Attribute to a campaign"
              onChange={() => form.setFieldValue('channelId', undefined)}
              options={(campaigns ?? []).map((c) => ({ label: c.name, value: c.id }))}
            />
          </Form.Item>
          <Form.Item name="channelId" label="Channel">
            <Select
              allowClear
              disabled={!formCampaignId}
              placeholder={formCampaignId ? 'Channel' : 'Pick a campaign first'}
              options={(formChannels ?? []).map((ch) => ({
                label: `${ch.channelType}${ch.flierCode ? ` (${ch.flierCode})` : ''}`,
                value: ch.id,
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* Convert to opportunity */}
      <Modal
        title="Convert to opportunity"
        open={!!convertFor}
        onCancel={() => setConvertFor(null)}
        onOk={() => convertForm.submit()}
        confirmLoading={convertState.isLoading}
        destroyOnClose
        width={520}
      >
        <Form
          form={convertForm}
          layout="vertical"
          onFinish={submitConvert}
          initialValues={{ currency: 'USD' }}
        >
          <Form.Item name="title" label="Opportunity title" rules={[{ required: true, min: 2 }]}>
            <Input placeholder="Mimosa water-treatment plant upgrade" />
          </Form.Item>
          <Form.Item name="organisationId" label="Organisation">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Attach an organisation"
              options={(orgs ?? []).map((o) => ({ label: o.name, value: o.id }))}
            />
          </Form.Item>
          <Space wrap>
            <Form.Item name="estimatedValue" label="Estimated value">
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency">
              <Input style={{ width: 120 }} placeholder="USD" />
            </Form.Item>
          </Space>
          <Form.Item name="ownerUserId" label="Owner">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Deal owner"
              options={(users ?? []).map((u) => ({ label: u.email, value: u.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
