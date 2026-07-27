import { PlusOutlined } from '@ant-design/icons';
import { App, Button, DatePicker, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  useCreateCrmInteractionMutation,
  useGetCrmContactsQuery,
  useGetCrmInteractionsQuery,
  useGetCrmOrganisationsQuery,
} from './crmApi';
import { INTERACTION_TYPES } from './crm-constants';

const TYPE_COLOR: Record<string, string> = {
  CALL: 'blue',
  VISIT: 'green',
  EMAIL: 'geekblue',
  TENDER: 'purple',
  MEETING: 'gold',
};

interface InteractionForm {
  type: string;
  organisationId?: string;
  contactId?: string;
  occurredAt: dayjs.Dayjs;
  outcome?: string;
  notes?: string;
}

export function InteractionsTab() {
  const { data, isLoading, refetch } = useGetCrmInteractionsQuery();
  const { data: orgs } = useGetCrmOrganisationsQuery();
  const { data: contacts } = useGetCrmContactsQuery();
  const [create, createState] = useCreateCrmInteractionMutation();
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const orgName = (id: string | null) => (id ? (orgs?.find((o) => o.id === id)?.name ?? '—') : '—');
  const contactName = (id: string | null) => {
    const c = contacts?.find((x) => x.id === id);
    return c ? `${c.firstName} ${c.lastName}` : '—';
  };

  const submit = async (v: InteractionForm) => {
    await create({
      type: v.type,
      organisationId: v.organisationId,
      contactId: v.contactId,
      occurredAt: v.occurredAt.toISOString(),
      outcome: v.outcome,
      notes: v.notes,
    }).unwrap();
    message.success('Interaction logged');
    setOpen(false);
    form.resetFields();
    refetch();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Typography.Text type="secondary">Calls, visits, emails, tenders and meetings.</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Log interaction
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          {
            title: 'When',
            dataIndex: 'occurredAt',
            render: (d: string) => dayjs(d).format('DD MMM YYYY, HH:mm'),
          },
          {
            title: 'Type',
            dataIndex: 'type',
            render: (t: string) => <Tag color={TYPE_COLOR[t] ?? 'default'}>{t}</Tag>,
          },
          {
            title: 'Organisation',
            dataIndex: 'organisationId',
            render: (id: string | null) => orgName(id),
          },
          {
            title: 'Contact',
            dataIndex: 'contactId',
            render: (id: string | null) => contactName(id),
          },
          { title: 'Outcome', dataIndex: 'outcome', render: (v: string | null) => v ?? '—' },
        ]}
      />
      <Modal
        title="Log interaction"
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
          initialValues={{ occurredAt: dayjs() }}
        >
          <Space>
            <Form.Item name="type" label="Type" rules={[{ required: true }]}>
              <Select
                style={{ width: 160 }}
                placeholder="Type"
                options={INTERACTION_TYPES.map((t) => ({ label: t, value: t }))}
              />
            </Form.Item>
            <Form.Item name="occurredAt" label="When" rules={[{ required: true }]}>
              <DatePicker showTime style={{ width: 200 }} />
            </Form.Item>
          </Space>
          <Form.Item name="organisationId" label="Organisation">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select an organisation"
              options={(orgs ?? []).map((o) => ({ label: o.name, value: o.id }))}
            />
          </Form.Item>
          <Form.Item name="contactId" label="Contact">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select a contact"
              options={(contacts ?? []).map((c) => ({
                label: `${c.firstName} ${c.lastName}`,
                value: c.id,
              }))}
            />
          </Form.Item>
          <Form.Item name="outcome" label="Outcome">
            <Input placeholder="e.g. Requested a quotation" />
          </Form.Item>
          <Form.Item name="notes" label="Notes">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
