import { PlusOutlined, SwapOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import {
  useConvertOpportunityMutation,
  useCreateOpportunityMutation,
  useGetClientsQuery,
  useGetOpportunityBoardQuery,
  useGetOrganisationsQuery,
  useGetUsersQuery,
  useMoveOpportunityMutation,
  type CrmOpportunity,
} from '../../api/api';
import { LookupSelect } from '../../components/LookupSelect';
import { money, STAGE_COLOR, STAGE_LABEL, STAGES } from './crm-constants';

interface OppForm {
  title: string;
  organisationId?: string;
  estimatedValue?: number;
  currency?: string;
  ownerUserId?: string;
  expectedCloseDate?: dayjs.Dayjs;
}
interface ConvertForm {
  as: 'ORDER' | 'CONTRACT';
  reference: string;
  clientId: string;
  valueExVat?: number;
  currency?: string;
  closingDate?: dayjs.Dayjs;
  startDate?: dayjs.Dayjs;
  endDate?: dayjs.Dayjs;
}

export function PipelineTab() {
  const { data: board, isLoading } = useGetOpportunityBoardQuery();
  const { data: orgs } = useGetOrganisationsQuery();
  const { data: users } = useGetUsersQuery();
  const { data: clients } = useGetClientsQuery();
  const [create, createState] = useCreateOpportunityMutation();
  const [move] = useMoveOpportunityMutation();
  const [convert, convertState] = useConvertOpportunityMutation();
  const { message } = App.useApp();

  const [addOpen, setAddOpen] = useState(false);
  const [lostFor, setLostFor] = useState<CrmOpportunity | null>(null);
  const [convertFor, setConvertFor] = useState<CrmOpportunity | null>(null);
  const [addForm] = Form.useForm();
  const [lostForm] = Form.useForm();
  const [convertForm] = Form.useForm();
  const convertAs = Form.useWatch('as', convertForm);

  const orgName = (id: string | null) => (id ? (orgs?.find((o) => o.id === id)?.name ?? '') : '');
  const ownerEmail = (id: string | null) => (id ? (users?.find((u) => u.id === id)?.email ?? '') : '');

  const onMove = async (opp: CrmOpportunity, stage: string) => {
    if (stage === opp.stage) return;
    if (stage === 'LOST') {
      lostForm.resetFields();
      setLostFor(opp);
      return;
    }
    await move({ id: opp.id, stage }).unwrap();
    message.success(`Moved to ${STAGE_LABEL[stage]}`);
  };

  const submitLost = async (v: { lostReason?: string }) => {
    if (!lostFor) return;
    await move({ id: lostFor.id, stage: 'LOST', lostReason: v.lostReason }).unwrap();
    message.success('Marked lost');
    setLostFor(null);
  };

  const submitAdd = async (v: OppForm) => {
    await create({
      title: v.title,
      organisationId: v.organisationId,
      estimatedValue: v.estimatedValue,
      currency: v.currency,
      ownerUserId: v.ownerUserId,
      expectedCloseDate: v.expectedCloseDate?.toISOString(),
    }).unwrap();
    message.success('Opportunity created');
    setAddOpen(false);
    addForm.resetFields();
  };

  const submitConvert = async (v: ConvertForm) => {
    if (!convertFor) return;
    await convert({
      id: convertFor.id,
      as: v.as,
      reference: v.reference,
      clientId: v.clientId,
      valueExVat: v.valueExVat,
      currency: v.currency,
      closingDate: v.closingDate?.toISOString(),
      startDate: v.startDate?.toISOString(),
      endDate: v.endDate?.toISOString(),
    }).unwrap();
    message.success(`Converted to ${v.as.toLowerCase()}`);
    setConvertFor(null);
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Typography.Text type="secondary">
          Work deals through the pipeline; convert a Won deal into an order or contract.
        </Typography.Text>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            addForm.resetFields();
            setAddOpen(true);
          }}
        >
          New opportunity
        </Button>
      </Space>

      <div
        style={{
          display: 'flex',
          gap: 12,
          overflowX: 'auto',
          paddingBottom: 8,
          opacity: isLoading ? 0.5 : 1,
        }}
      >
        {STAGES.map((stage) => {
          const items = board?.[stage] ?? [];
          const total = items.reduce((s, o) => s + Number(o.estimatedValue ?? 0), 0);
          return (
            <div
              key={stage}
              style={{
                minWidth: 240,
                flex: '0 0 240px',
                background: '#f5f7f9',
                borderRadius: 10,
                padding: 8,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '4px 6px 8px',
                }}
              >
                <Tag color={STAGE_COLOR[stage]} style={{ marginInlineEnd: 0 }}>
                  {STAGE_LABEL[stage]}
                </Tag>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {items.length}
                  {total ? ` · ${total.toLocaleString()}` : ''}
                </Typography.Text>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {items.map((opp) => (
                  <Card key={opp.id} size="small" styles={{ body: { padding: 10 } }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{opp.title}</div>
                    {orgName(opp.organisationId) && (
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{orgName(opp.organisationId)}</div>
                    )}
                    <div style={{ fontSize: 12, marginTop: 4 }}>
                      {money(opp.estimatedValue, opp.currency)}
                    </div>
                    {ownerEmail(opp.ownerUserId) && (
                      <div style={{ fontSize: 11, color: '#9aa4af' }}>{ownerEmail(opp.ownerUserId)}</div>
                    )}
                    <div style={{ marginTop: 8 }}>
                      {opp.convertedOrderId || opp.convertedContractId ? (
                        <Tag color="green">converted</Tag>
                      ) : opp.stage === 'WON' ? (
                        <Button
                          size="small"
                          type="primary"
                          icon={<SwapOutlined />}
                          onClick={() => {
                            convertForm.resetFields();
                            setConvertFor(opp);
                          }}
                        >
                          Convert
                        </Button>
                      ) : (
                        <Select<string>
                          size="small"
                          value={undefined}
                          placeholder="Move…"
                          style={{ width: '100%' }}
                          onChange={(s) => onMove(opp, s)}
                          options={STAGES.filter((s) => s !== opp.stage).map((s) => ({
                            label: STAGE_LABEL[s],
                            value: s,
                          }))}
                        />
                      )}
                    </div>
                  </Card>
                ))}
                {items.length === 0 && (
                  <div style={{ fontSize: 12, color: '#c0c8d0', textAlign: 'center', padding: 8 }}>
                    —
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* New opportunity */}
      <Modal
        title="New opportunity"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => addForm.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
        width={520}
      >
        <Form form={addForm} layout="vertical" onFinish={submitAdd}>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input placeholder="Mimosa ventilation upgrade" />
          </Form.Item>
          <Form.Item name="organisationId" label="Organisation">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Select an organisation"
              options={(orgs ?? []).map((o) => ({ label: o.name, value: o.id }))}
            />
          </Form.Item>
          <Space>
            <Form.Item name="estimatedValue" label="Estimated value">
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency">
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>
          <Space>
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
            <Form.Item name="expectedCloseDate" label="Expected close">
              <DatePicker style={{ width: 160 }} />
            </Form.Item>
          </Space>
        </Form>
      </Modal>

      {/* Lost reason */}
      <Modal
        title="Mark opportunity lost"
        open={!!lostFor}
        onCancel={() => setLostFor(null)}
        onOk={() => lostForm.submit()}
        destroyOnClose
      >
        <Form form={lostForm} layout="vertical" onFinish={submitLost}>
          <Form.Item name="lostReason" label="Reason" rules={[{ required: true }]}>
            <Input.TextArea rows={2} placeholder="e.g. Lost on price to a competitor" />
          </Form.Item>
        </Form>
      </Modal>

      {/* Convert */}
      <Modal
        title={`Convert "${convertFor?.title ?? ''}"`}
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
          initialValues={{
            as: 'ORDER',
            valueExVat: convertFor ? Number(convertFor.estimatedValue ?? 0) || undefined : undefined,
            currency: convertFor?.currency ?? undefined,
          }}
        >
          <Form.Item name="as" label="Convert into" rules={[{ required: true }]}>
            <Select
              options={[
                { label: 'Order', value: 'ORDER' },
                { label: 'Contract', value: 'CONTRACT' },
              ]}
            />
          </Form.Item>
          <Form.Item name="reference" label="Reference" rules={[{ required: true }]}>
            <Input placeholder={convertAs === 'CONTRACT' ? 'CTR-2026-014' : 'ORD-2026-014'} />
          </Form.Item>
          <Form.Item name="clientId" label="Billed client" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select a client"
              options={(clients ?? []).map((c) => ({ label: c.name, value: c.id }))}
            />
          </Form.Item>
          <Space>
            <Form.Item name="valueExVat" label="Value (ex VAT)">
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency">
              <LookupSelect category="currency" style={{ width: 120 }} />
            </Form.Item>
          </Space>
          {convertAs === 'CONTRACT' ? (
            <Space>
              <Form.Item name="startDate" label="Start date" rules={[{ required: true }]}>
                <DatePicker style={{ width: 160 }} />
              </Form.Item>
              <Form.Item name="endDate" label="End date" rules={[{ required: true }]}>
                <DatePicker style={{ width: 160 }} />
              </Form.Item>
            </Space>
          ) : (
            <Form.Item name="closingDate" label="Closing date (optional)">
              <DatePicker style={{ width: '100%' }} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
