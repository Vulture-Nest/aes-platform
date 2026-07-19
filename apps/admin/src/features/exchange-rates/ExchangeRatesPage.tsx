import { PlusOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Form, Input, InputNumber, Modal, Space, Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useCreateExchangeRateMutation, useGetExchangeRatesQuery } from '../../api/api';

export function ExchangeRatesPage() {
  const { data, isLoading } = useGetExchangeRatesQuery();
  const [create, createState] = useCreateExchangeRateMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: {
    dateEffective: dayjs.Dayjs;
    currencyPair: string;
    officialRate: number;
    parallelRate?: number;
    source?: string;
  }) => {
    await create({
      dateEffective: v.dateEffective.toISOString(),
      currencyPair: v.currencyPair.toUpperCase(),
      officialRate: String(v.officialRate),
      parallelRate: v.parallelRate != null ? String(v.parallelRate) : null,
      source: v.source ?? null,
    }).unwrap();
    message.success('Exchange rate recorded');
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Exchange Rates
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Record rate
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        Append-only &amp; effective-dated — a newer effective date supersedes; history is preserved.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          {
            title: 'Effective',
            dataIndex: 'dateEffective',
            render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
          },
          { title: 'Pair', dataIndex: 'currencyPair' },
          { title: 'Official', dataIndex: 'officialRate' },
          { title: 'Parallel (street)', dataIndex: 'parallelRate', render: (p) => p ?? '—' },
          { title: 'Source', dataIndex: 'source', render: (s) => s ?? '—' },
        ]}
      />
      <Modal
        title="Record exchange rate"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit} initialValues={{ currencyPair: 'USD/ZWG' }}>
          <Form.Item name="dateEffective" label="Effective date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="currencyPair" label="Currency pair" rules={[{ required: true }]}>
            <Input placeholder="USD/ZWG" />
          </Form.Item>
          <Form.Item name="officialRate" label="Official rate" rules={[{ required: true }]}>
            <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="parallelRate" label="Parallel / street rate">
            <InputNumber min={0} step={0.0001} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="source" label="Source">
            <Input placeholder="RBZ / market" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
