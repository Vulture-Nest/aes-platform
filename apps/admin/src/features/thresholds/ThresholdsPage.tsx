import { PlusOutlined } from '@ant-design/icons';
import { App, Button, Form, InputNumber, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { useCreateThresholdMutation, useGetLookupsQuery, useGetThresholdsQuery } from '../../api/api';

export function ThresholdsPage() {
  const { data, isLoading } = useGetThresholdsQuery();
  const { data: keys } = useGetLookupsQuery('threshold_key');
  const [create, createState] = useCreateThresholdMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: { key: string; currency?: string; value?: number }) => {
    await create({ key: v.key, currency: v.currency, value: v.value }).unwrap();
    message.success('Threshold saved');
    setOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Thresholds &amp; Tunables
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Set threshold
        </Button>
      </Space>
      <Typography.Paragraph type="secondary">
        Effective-dated tunables: petty-cash FD threshold, SLA timers, danger-rule bands. Config, not code.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Key', dataIndex: 'key', render: (k: string) => <Tag color="purple">{k}</Tag> },
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
        title="Set threshold"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="key" label="Threshold key" rules={[{ required: true }]}>
            <Select
              showSearch
              options={(keys ?? []).filter((k) => k.active).map((k) => ({ label: `${k.code} — ${k.label}`, value: k.code }))}
            />
          </Form.Item>
          <Form.Item name="currency" label="Currency (optional)">
            <Select allowClear options={[{ label: 'USD', value: 'USD' }, { label: 'ZWG', value: 'ZWG' }]} />
          </Form.Item>
          <Form.Item name="value" label="Value" rules={[{ required: true }]}>
            <InputNumber step={0.01} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
