import { PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { LookupSelect } from '../../components/LookupSelect';
import {
  useCreateWhtRateMutation,
  useGetReturnsHubQuery,
  useGetReturnsSummaryQuery,
  useGetWhtCreditsQuery,
  useListWhtRatesQuery,
  usePostFromPayrollMutation,
  usePostVatMutation,
  useRemitReturnMutation,
  useWhtPayableMutation,
  useWhtSufferedMutation,
  type ReturnStatus,
  type StatutoryReturnRow,
  type WhtRate,
} from './returnsHubApi';

const money = (a: number | string, c?: string) =>
  `${c ? c + ' ' : ''}${Number(a).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const STATUS_COLORS: Record<ReturnStatus, string> = {
  DUE: 'gold',
  OVERDUE: 'red',
  PAID: 'green',
  PARTIAL: 'blue',
};

// ---------------------------------------------------------------------------
// Tab 1 — Returns
// ---------------------------------------------------------------------------

function ReturnsTab() {
  const { message } = App.useApp();
  const [period, setPeriod] = useState(() => dayjs().format('YYYY-MM'));
  const { data, isLoading, isFetching } = useGetReturnsHubQuery({ period });
  const [postPayroll, postPayrollState] = usePostFromPayrollMutation();
  const [postVat, postVatState] = usePostVatMutation();
  const [remit, remitState] = useRemitReturnMutation();

  const [remitRow, setRemitRow] = useState<StatutoryReturnRow | null>(null);
  const [form] = Form.useForm();

  const doPostPayroll = async () => {
    try {
      await postPayroll({ period }).unwrap();
      message.success('Returns posted from payroll');
    } catch {
      message.error('Failed to post from payroll');
    }
  };

  const doPostVat = async () => {
    try {
      await postVat({ period }).unwrap();
      message.success('VAT return posted');
    } catch {
      message.error('Failed to post VAT');
    }
  };

  const submitRemit = async (v: {
    paidAt: dayjs.Dayjs;
    amount: number;
    currency: string;
    reference?: string;
    proofAttachmentKey?: string;
  }) => {
    if (!remitRow) return;
    try {
      await remit({
        id: remitRow.id,
        body: {
          paidAt: v.paidAt.toISOString(),
          amount: v.amount,
          currency: v.currency,
          reference: v.reference,
          proofAttachmentKey: v.proofAttachmentKey,
        },
      }).unwrap();
      message.success('Remittance recorded');
      setRemitRow(null);
      form.resetFields();
    } catch {
      message.error('Failed to record remittance');
    }
  };

  return (
    <>
      <Space wrap style={{ marginBottom: 16 }}>
        <DatePicker
          picker="month"
          value={dayjs(period, 'YYYY-MM')}
          onChange={(d) => d && setPeriod(d.format('YYYY-MM'))}
          allowClear={false}
        />
        <Button
          type="primary"
          onClick={doPostPayroll}
          loading={postPayrollState.isLoading}
        >
          Post from payroll
        </Button>
        <Button onClick={doPostVat} loading={postVatState.isLoading}>
          Post VAT
        </Button>
      </Space>

      <Table<StatutoryReturnRow>
        rowKey="id"
        loading={isLoading || isFetching}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'Tax type', dataIndex: 'taxType' },
          { title: 'Period', dataIndex: 'periodMonth' },
          { title: 'Currency', dataIndex: 'currency' },
          {
            title: 'Amount due',
            dataIndex: 'amountDue',
            align: 'right',
            render: (v: number) => money(v),
          },
          {
            title: 'Amount paid',
            dataIndex: 'amountPaid',
            align: 'right',
            render: (v: number) => money(v),
          },
          {
            title: 'Balance',
            dataIndex: 'balance',
            align: 'right',
            render: (v: number) => money(v),
          },
          {
            title: 'Filing deadline',
            dataIndex: 'filingDeadline',
            render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '—'),
          },
          {
            title: 'Days to deadline',
            dataIndex: 'daysToDeadline',
            align: 'right',
            render: (v: number | null) =>
              v === null || v === undefined ? '—' : (
                <span style={{ color: v < 0 ? '#cf1322' : undefined }}>{v}</span>
              ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: ReturnStatus) => <Tag color={STATUS_COLORS[s]}>{s}</Tag>,
          },
          {
            title: 'Action',
            render: (_: unknown, r: StatutoryReturnRow) => (
              <Button
                size="small"
                disabled={r.status === 'PAID'}
                onClick={() => {
                  setRemitRow(r);
                  form.setFieldsValue({
                    paidAt: dayjs(),
                    amount: r.balance,
                    currency: r.currency,
                  });
                }}
              >
                Remit
              </Button>
            ),
          },
        ]}
      />

      <Modal
        title={remitRow ? `Remit — ${remitRow.taxType} ${remitRow.periodMonth}` : 'Remit'}
        open={!!remitRow}
        onCancel={() => {
          setRemitRow(null);
          form.resetFields();
        }}
        onOk={() => form.submit()}
        confirmLoading={remitState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submitRemit}>
          <Form.Item name="paidAt" label="Paid at" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Space>
            <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>
          <Form.Item name="reference" label="Reference">
            <Input placeholder="ZIMRA-REF-0001" />
          </Form.Item>
          <Form.Item name="proofAttachmentKey" label="Proof (attachment key)">
            <Input placeholder="Object storage key" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

// ---------------------------------------------------------------------------
// Tab 2 — WHT
// ---------------------------------------------------------------------------

function WhtPayableSubTab() {
  const { message } = App.useApp();
  const [payable, payableState] = useWhtPayableMutation();
  const [form] = Form.useForm();
  const [lastWithheld, setLastWithheld] = useState<{
    amount: number;
    rate: number;
    currency: string;
    withheld: boolean;
  } | null>(null);

  const submit = async (v: {
    counterparty: string;
    taxBase: number;
    category: string;
    supplierTaxClearanceHeld?: boolean;
    currency: string;
    relatedPaymentRef?: string;
    country?: string;
    paymentDate?: dayjs.Dayjs;
  }) => {
    try {
      const res = await payable({
        counterparty: v.counterparty,
        taxBase: v.taxBase,
        category: v.category,
        supplierTaxClearanceHeld: v.supplierTaxClearanceHeld ?? false,
        currency: v.currency,
        relatedPaymentRef: v.relatedPaymentRef,
        country: v.country,
        paymentDate: v.paymentDate?.toISOString(),
      }).unwrap();
      setLastWithheld({
        amount: res.transaction.amount,
        rate: res.transaction.rate,
        currency: res.transaction.currency,
        withheld: res.withheld,
      });
      message.success(
        res.withheld
          ? `Withheld ${money(res.transaction.amount, res.transaction.currency)}`
          : 'Recorded — no WHT withheld',
      );
      form.resetFields();
    } catch {
      message.error('Failed to record payable (is a WHT rate configured?)');
    }
  };

  return (
    <Row gutter={24}>
      <Col xs={24} md={14}>
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={{ supplierTaxClearanceHeld: false, country: 'ZW' }}
        >
          <Form.Item name="counterparty" label="Counterparty" rules={[{ required: true }]}>
            <Input placeholder="Acme Suppliers Ltd" />
          </Form.Item>
          <Space wrap>
            <Form.Item name="taxBase" label="Tax base (gross)" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>
          <Form.Item name="category" label="Category" rules={[{ required: true }]}>
            <Input placeholder="CONTRACTS" />
          </Form.Item>
          <Space wrap>
            <Form.Item name="country" label="Country">
              <Input placeholder="ZW" style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="paymentDate" label="Payment date">
              <DatePicker style={{ width: 200 }} />
            </Form.Item>
          </Space>
          <Form.Item name="relatedPaymentRef" label="Related payment ref">
            <Input placeholder="PMT-2026-0001" />
          </Form.Item>
          <Form.Item
            name="supplierTaxClearanceHeld"
            label="Supplier holds tax clearance"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            loading={payableState.isLoading}
            icon={<PlusOutlined />}
          >
            Record payable
          </Button>
        </Form>
      </Col>
      <Col xs={24} md={10}>
        {lastWithheld && (
          <Card size="small" title="Last computed">
            <Statistic
              title={lastWithheld.withheld ? 'Auto-withheld WHT' : 'No WHT withheld'}
              value={money(lastWithheld.amount, lastWithheld.currency)}
            />
            <Typography.Text type="secondary">
              Rate: {(lastWithheld.rate * 100).toFixed(2)}%
            </Typography.Text>
          </Card>
        )}
      </Col>
    </Row>
  );
}

function WhtSufferedSubTab() {
  const { message } = App.useApp();
  const [suffered, sufferedState] = useWhtSufferedMutation();
  const { data: credits, isLoading } = useGetWhtCreditsQuery();
  const [form] = Form.useForm();

  const submit = async (v: {
    counterparty: string;
    amount: number;
    currency: string;
    certificateRef?: string;
    taxPeriod: dayjs.Dayjs;
  }) => {
    try {
      await suffered({
        counterparty: v.counterparty,
        amount: v.amount,
        currency: v.currency,
        certificateRef: v.certificateRef,
        taxPeriod: v.taxPeriod.format('YYYY-MM'),
      }).unwrap();
      message.success('WHT suffered recorded');
      form.resetFields();
    } catch {
      message.error('Failed to record WHT suffered');
    }
  };

  const creditRows = credits
    ? Object.entries(credits.byCurrency).map(([currency, v]) => ({ currency, ...v }))
    : [];

  return (
    <Row gutter={24}>
      <Col xs={24} md={12}>
        <Typography.Title level={5}>Record WHT suffered</Typography.Title>
        <Form form={form} layout="vertical" onFinish={submit}>
          <Form.Item name="counterparty" label="Counterparty" rules={[{ required: true }]}>
            <Input placeholder="Big Mine Co" />
          </Form.Item>
          <Space wrap>
            <Form.Item name="amount" label="Amount withheld" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>
          <Form.Item name="certificateRef" label="Certificate ref">
            <Input placeholder="CERT-2026-0007" />
          </Form.Item>
          <Form.Item name="taxPeriod" label="Tax period" rules={[{ required: true }]}>
            <DatePicker picker="month" style={{ width: '100%' }} />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={sufferedState.isLoading}>
            Record suffered
          </Button>
        </Form>
      </Col>
      <Col xs={24} md={12}>
        <Typography.Title level={5}>Credits summary</Typography.Title>
        <Table
          rowKey="currency"
          size="small"
          loading={isLoading}
          dataSource={creditRows}
          pagination={false}
          columns={[
            { title: 'Currency', dataIndex: 'currency' },
            {
              title: 'Total credit',
              dataIndex: 'totalCredit',
              align: 'right',
              render: (v: number) => money(v),
            },
            {
              title: 'Certificated',
              dataIndex: 'certificatedCredit',
              align: 'right',
              render: (v: number) => money(v),
            },
            {
              title: 'Pending cert.',
              dataIndex: 'pendingCertificateCredit',
              align: 'right',
              render: (v: number) => money(v),
            },
            { title: 'Count', dataIndex: 'count', align: 'right' },
          ]}
        />
      </Col>
    </Row>
  );
}

function WhtRatesSubTab() {
  const { message } = App.useApp();
  const { data, isLoading } = useListWhtRatesQuery();
  const [create, createState] = useCreateWhtRateMutation();
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: {
    country?: string;
    category: string;
    rate: number;
    thresholdAmount?: number;
    effectiveFrom: dayjs.Dayjs;
  }) => {
    try {
      await create({
        country: v.country || 'ZW',
        category: v.category,
        rate: v.rate,
        thresholdAmount: v.thresholdAmount,
        effectiveFrom: v.effectiveFrom.toISOString(),
      }).unwrap();
      message.success('Rate added');
      setOpen(false);
      form.resetFields();
    } catch {
      message.error('Failed to add rate');
    }
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Typography.Text type="secondary">Effective-dated WHT rates by country + category.</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
          Add rate
        </Button>
      </Space>
      <Table<WhtRate>
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'Country', dataIndex: 'country' },
          { title: 'Category', dataIndex: 'category' },
          {
            title: 'Rate',
            dataIndex: 'rate',
            align: 'right',
            render: (v: number | string) => `${(Number(v) * 100).toFixed(2)}%`,
          },
          {
            title: 'Threshold',
            dataIndex: 'thresholdAmount',
            align: 'right',
            render: (v: number | string | null) => (v === null || v === undefined ? '—' : money(v)),
          },
          {
            title: 'Effective from',
            dataIndex: 'effectiveFrom',
            render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
          },
        ]}
      />
      <Modal
        title="Add WHT rate"
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
          initialValues={{ country: 'ZW', effectiveFrom: dayjs() }}
        >
          <Space wrap>
            <Form.Item name="country" label="Country" rules={[{ required: true }]}>
              <Input placeholder="ZW" style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="category" label="Category" rules={[{ required: true }]}>
              <Input placeholder="CONTRACTS" style={{ width: 200 }} />
            </Form.Item>
          </Space>
          <Space wrap>
            <Form.Item
              name="rate"
              label="Rate (fraction, e.g. 0.10)"
              rules={[{ required: true }]}
            >
              <InputNumber min={0} max={1} step={0.01} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="thresholdAmount" label="Threshold">
              <InputNumber min={0} style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Form.Item name="effectiveFrom" label="Effective from" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function WhtTab() {
  return (
    <Tabs
      defaultActiveKey="payable"
      items={[
        { key: 'payable', label: 'Payable', children: <WhtPayableSubTab /> },
        { key: 'suffered', label: 'Suffered', children: <WhtSufferedSubTab /> },
        { key: 'rates', label: 'Rates', children: <WhtRatesSubTab /> },
      ]}
    />
  );
}

// ---------------------------------------------------------------------------
// Tab 3 — Summary
// ---------------------------------------------------------------------------

function SummaryTab() {
  const [period, setPeriod] = useState(() => dayjs().format('YYYY-MM'));
  const { data, isLoading, isFetching } = useGetReturnsSummaryQuery({ period });

  const byTaxTypeRows = useMemo(
    () =>
      data
        ? Object.entries(data.ytdByTaxType).map(([taxType, v]) => ({ taxType, ...v }))
        : [],
    [data],
  );

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <DatePicker
          picker="month"
          value={dayjs(period, 'YYYY-MM')}
          onChange={(d) => d && setPeriod(d.format('YYYY-MM'))}
          allowClear={false}
        />
      </Space>

      {data && (
        <>
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            message={`Year-to-date ${data.year} (through ${data.anchorPeriod})`}
          />
          <Row gutter={16} style={{ marginBottom: 24 }}>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic title="YTD due" value={money(data.ytd.due)} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic title="YTD paid" value={money(data.ytd.paid)} />
              </Card>
            </Col>
            <Col xs={24} sm={8}>
              <Card>
                <Statistic
                  title="YTD balance"
                  value={money(data.ytd.balance)}
                  valueStyle={{ color: data.ytd.balance > 0 ? '#cf1322' : undefined }}
                />
              </Card>
            </Col>
          </Row>
        </>
      )}

      <Descriptions title="By tax type (YTD)" style={{ marginBottom: 8 }} />
      <Table
        rowKey="taxType"
        size="small"
        loading={isLoading || isFetching}
        dataSource={byTaxTypeRows}
        pagination={false}
        columns={[
          { title: 'Tax type', dataIndex: 'taxType' },
          { title: 'Due', dataIndex: 'due', align: 'right', render: (v: number) => money(v) },
          { title: 'Paid', dataIndex: 'paid', align: 'right', render: (v: number) => money(v) },
          {
            title: 'Balance',
            dataIndex: 'balance',
            align: 'right',
            render: (v: number) => money(v),
          },
        ]}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function ReturnsHubPage() {
  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Statutory Returns Hub
      </Typography.Title>
      <Tabs
        defaultActiveKey="returns"
        items={[
          { key: 'returns', label: 'Returns', children: <ReturnsTab /> },
          { key: 'wht', label: 'WHT', children: <WhtTab /> },
          { key: 'summary', label: 'Summary', children: <SummaryTab /> },
        ]}
      />
    </>
  );
}

export default ReturnsHubPage;
