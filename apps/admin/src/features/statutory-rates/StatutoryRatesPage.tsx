import { PlusOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Form, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useCreateStatutoryRateMutation, useGetStatutoryRatesQuery } from '../../api/api';

const COMMON_KEYS = [
  'vat_pct',
  'zimra_interest_pct',
  'aids_levy_pct',
  'zimdef_pct',
  'nssa_ceiling',
  'paye_bands',
];

export function StatutoryRatesPage() {
  const { data, isLoading } = useGetStatutoryRatesQuery();
  const [create, createState] = useCreateStatutoryRateMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: {
    key: string;
    currency?: string;
    value?: number;
    dateEffective: dayjs.Dayjs;
  }) => {
    await create({
      key: v.key,
      currency: v.currency,
      value: v.value,
      dateEffective: v.dateEffective.toISOString(),
    }).unwrap();
    message.success('Statutory parameter recorded');
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Statutory Rates
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Record value
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        Effective-dated config (VAT %, ZIMRA interest, PAYE bands, …). Confirm figures with a tax
        practitioner — never hardcoded.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Key', dataIndex: 'key', render: (k: string) => <Tag color="geekblue">{k}</Tag> },
          { title: 'Currency', dataIndex: 'currency', render: (c) => c ?? '—' },
          { title: 'Value', dataIndex: 'value', render: (v) => v ?? '(structured)' },
          {
            title: 'Effective',
            dataIndex: 'dateEffective',
            render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
          },
        ]}
      />
      <Modal
        title="Record statutory value"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="key" label="Parameter key" rules={[{ required: true }]}>
            <Select showSearch options={COMMON_KEYS.map((k) => ({ label: k, value: k }))} placeholder="vat_pct" />
          </Form.Item>
          <Form.Item name="currency" label="Currency (optional)">
            <Select allowClear options={[{ label: 'USD', value: 'USD' }, { label: 'ZWG', value: 'ZWG' }]} />
          </Form.Item>
          <Form.Item name="value" label="Value">
            <InputNumber step={0.01} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="dateEffective" label="Effective date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
