import { PlusOutlined } from '@ant-design/icons';
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
  useCreateTravelMutation,
  useGetSitesQuery,
  useGetTravelRequestsQuery,
  useSubmitTravelMutation,
  type TravelRecord,
} from '../../api/api';
import { LookupSelect } from '../../components/LookupSelect';

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'default',
  SUBMITTED: 'processing',
  APPROVED_READY_TO_PAY: 'green',
  APPROVED_PENDING_FUNDS: 'gold',
  DISBURSED: 'blue',
  RETIRED: 'purple',
  CLOSED: 'default',
  REJECTED: 'red',
  RETURNED: 'orange',
};

interface TravelForm {
  destination: string;
  dates: [dayjs.Dayjs, dayjs.Dayjs];
  days: number;
  currency: string;
  siteId?: string;
}

export function TravelPage() {
  const { data, isLoading } = useGetTravelRequestsQuery();
  const { data: sites } = useGetSitesQuery();
  const [create, createState] = useCreateTravelMutation();
  const [submit] = useSubmitTravelMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const onCreate = async (v: TravelForm) => {
    try {
      await create({
        destination: v.destination,
        dateFrom: v.dates[0].toISOString(),
        dateTo: v.dates[1].toISOString(),
        days: v.days,
        currency: v.currency,
        siteId: v.siteId,
      }).unwrap();
      message.success('Travel request created');
      setOpen(false);
      form.resetFields();
    } catch (e) {
      const err = e as { data?: { message?: string } };
      message.error(err.data?.message ?? 'Could not create request');
    }
  };

  const onSubmit = async (id: string) => {
    try {
      await submit(id).unwrap();
      message.success('Submitted for approval');
    } catch (e) {
      const err = e as { data?: { message?: string } };
      message.error(err.data?.message ?? 'Could not submit');
    }
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Travel &amp; Allowances
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          New travel request
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        Raise a per-diem advance and submit it for approval. Finance disburses and retires it once
        approved.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Destination', dataIndex: 'destination' },
          {
            title: 'Dates',
            render: (_: unknown, r: TravelRecord) =>
              `${dayjs(r.dateFrom).format('DD MMM')} – ${dayjs(r.dateTo).format('DD MMM')}`,
          },
          { title: 'Days', dataIndex: 'days' },
          {
            title: 'Advance',
            render: (_: unknown, r: TravelRecord) => `${r.currency} ${r.advanceAmount}`,
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => (
              <Tag color={STATUS_COLOR[s] ?? 'default'}>{s.replaceAll('_', ' ')}</Tag>
            ),
          },
          {
            title: 'Actions',
            render: (_: unknown, r: TravelRecord) =>
              r.status === 'DRAFT' ? (
                <Button size="small" type="primary" onClick={() => onSubmit(r.id)}>
                  Submit
                </Button>
              ) : (
                '—'
              ),
          },
        ]}
      />
      <Modal
        title="New travel request"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={onCreate}>
          <Form.Item name="destination" label="Destination" rules={[{ required: true }]}>
            <Input placeholder="Bulawayo depot audit" />
          </Form.Item>
          <Form.Item name="dates" label="From – to" rules={[{ required: true }]}>
            <DatePicker.RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="days" label="Days" rules={[{ required: true }]}>
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
            <LookupSelect category="currency" placeholder="Select a currency" />
          </Form.Item>
          <Form.Item
            name="siteId"
            label="Site (optional)"
            help="Per-diem is resolved from the rate table at submit."
          >
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
    </>
  );
}
