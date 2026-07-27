import { PlusOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useGetSitesQuery } from '../../api/api';
import {
  useCreatePpeIssueMutation,
  useCreateSiteKpiMutation,
  useCreateStoresWithdrawalMutation,
  useGetCrossSiteQuery,
  useGetPpeComplianceQuery,
  useGetPpeIssuesQuery,
  useGetSiteKpisQuery,
  useGetSitePerformanceQuery,
  useGetSiteReportPeriodQuery,
  useGetSiteReportPeriodsQuery,
  useGetStoresWithdrawalsQuery,
  useOpenSiteReportPeriodMutation,
  useSubmitSiteReportMutation,
  useUpdateSiteReportSectionMutation,
  useUpsertKpiActualMutation,
  useUpsertKpiTargetMutation,
  type PerfKpiRow,
  type Rag,
  type SiteReportPeriod,
  type SiteReportSection,
  type StoresWithdrawalRecord,
} from './siteReportsApi';

const money = (a: string | number, c?: string | null) =>
  `${c ?? ''} ${Number(a).toLocaleString(undefined, { maximumFractionDigits: 2 })}`.trim();

const ragColor: Record<Rag, string> = { GREEN: 'green', AMBER: 'gold', RED: 'red' };
const RagTag = ({ rag }: { rag: Rag }) => <Tag color={ragColor[rag]}>{rag}</Tag>;

const statusColor: Record<string, string> = { OPEN: 'blue', SUBMITTED: 'gold', LOCKED: 'default' };

function useSiteName() {
  const { data: sites } = useGetSitesQuery();
  return useMemo(() => {
    const map = new Map((sites ?? []).map((s) => [s.id, s.name]));
    return (id: string | null | undefined) => (id ? map.get(id) ?? id : '—');
  }, [sites]);
}

// --------------------------------------------------------------------------
// TAB 1: Monthly reports
// --------------------------------------------------------------------------
function SectionEditor({ period, section }: { period: SiteReportPeriod; section: SiteReportSection }) {
  const [update, updateState] = useUpdateSiteReportSectionMutation();
  const { message } = App.useApp();
  const locked = period.status !== 'OPEN';
  const [text, setText] = useState(() =>
    section.content ? JSON.stringify(section.content, null, 2) : '',
  );

  const parse = (): Record<string, unknown> | undefined => {
    if (!text.trim()) return {};
    try {
      const v = JSON.parse(text);
      if (typeof v !== 'object' || v === null || Array.isArray(v)) {
        message.error('Content must be a JSON object');
        return undefined;
      }
      return v as Record<string, unknown>;
    } catch {
      message.error('Invalid JSON');
      return undefined;
    }
  };

  const save = async (markComplete: boolean) => {
    const content = parse();
    if (content === undefined) return;
    await update({
      id: period.id,
      key: section.sectionKey,
      content,
      completedAt: markComplete ? new Date().toISOString() : undefined,
    }).unwrap();
    message.success(markComplete ? 'Section completed' : 'Section saved');
  };

  return (
    <Card
      size="small"
      title={
        <Space>
          <span>{section.title ?? section.sectionKey}</span>
          <Tag>{section.sectionKey}</Tag>
          {section.completedAt ? <Tag color="green">Complete</Tag> : <Tag>Incomplete</Tag>}
          {section.autoPopulated ? <Tag color="blue">Auto</Tag> : null}
        </Space>
      }
      style={{ marginBottom: 12 }}
    >
      <Input.TextArea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        disabled={locked}
        placeholder='{ "note": "..." }'
        style={{ fontFamily: 'monospace' }}
      />
      {!locked && (
        <Space style={{ marginTop: 8 }}>
          <Button size="small" onClick={() => save(false)} loading={updateState.isLoading}>
            Save
          </Button>
          <Button
            size="small"
            type="primary"
            onClick={() => save(true)}
            loading={updateState.isLoading}
          >
            Save &amp; mark complete
          </Button>
        </Space>
      )}
    </Card>
  );
}

function ReportDrawer({ periodId, onClose }: { periodId: string | null; onClose: () => void }) {
  const { data: period, isLoading } = useGetSiteReportPeriodQuery(periodId as string, {
    skip: !periodId,
  });
  const siteName = useSiteName();
  const [submit, submitState] = useSubmitSiteReportMutation();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const doSubmit = async (v: { narrative: string }) => {
    if (!period) return;
    const res = await submit({ id: period.id, narrative: v.narrative }).unwrap();
    message.success(res.late ? 'Submitted (late) & locked' : 'Submitted & locked');
    form.resetFields();
  };

  return (
    <Drawer
      title={period ? `${siteName(period.siteId)} — ${period.periodMonth}` : 'Report'}
      width={720}
      open={!!periodId}
      onClose={onClose}
      loading={isLoading}
    >
      {period && (
        <>
          <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label="Status">
              <Tag color={statusColor[period.status] ?? 'default'}>{period.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Deadline">
              {period.deadline ? dayjs(period.deadline).format('YYYY-MM-DD') : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Submitted">
              {period.submittedAt ? dayjs(period.submittedAt).format('YYYY-MM-DD HH:mm') : '—'}
            </Descriptions.Item>
            <Descriptions.Item label="Sections complete">
              {period.sections.filter((s) => s.completedAt).length}/{period.sections.length}
            </Descriptions.Item>
          </Descriptions>

          {period.sections.map((s) => (
            <SectionEditor key={s.id} period={period} section={s} />
          ))}

          <Card size="small" title="Site Manager narrative & submit" style={{ marginTop: 16 }}>
            {period.status === 'OPEN' ? (
              <Form form={form} layout="vertical" onFinish={doSubmit}>
                <Form.Item
                  name="narrative"
                  label="Overall narrative for the month"
                  rules={[{ required: true, message: 'Narrative is required' }]}
                >
                  <Input.TextArea rows={4} />
                </Form.Item>
                <Button
                  type="primary"
                  danger
                  htmlType="submit"
                  loading={submitState.isLoading}
                >
                  Submit &amp; lock report
                </Button>
              </Form>
            ) : (
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>
                {period.narrative ?? 'No narrative.'}
              </Typography.Paragraph>
            )}
          </Card>
        </>
      )}
    </Drawer>
  );
}

function MonthlyReportsTab() {
  const { data, isLoading } = useGetSiteReportPeriodsQuery();
  const { data: sites } = useGetSitesQuery();
  const siteName = useSiteName();
  const [open, openState] = useOpenSiteReportPeriodMutation();
  const { message } = App.useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [form] = Form.useForm();

  const submit = async (v: {
    siteId: string;
    periodMonth: dayjs.Dayjs;
    deadline?: dayjs.Dayjs;
  }) => {
    await open({
      siteId: v.siteId,
      periodMonth: v.periodMonth.format('YYYY-MM'),
      deadline: v.deadline ? v.deadline.toISOString() : undefined,
    }).unwrap();
    message.success('Report period opened');
    setModalOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Typography.Text type="secondary">
          Monthly site report periods with their standard sections & submission status.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Open period
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        onRow={(r) => ({ onClick: () => setDrawerId(r.id), style: { cursor: 'pointer' } })}
        columns={[
          { title: 'Site', render: (_: unknown, r: SiteReportPeriod) => siteName(r.siteId) },
          { title: 'Month', dataIndex: 'periodMonth' },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (v: string) => <Tag color={statusColor[v] ?? 'default'}>{v}</Tag>,
          },
          {
            title: 'Sections',
            render: (_: unknown, r: SiteReportPeriod) =>
              `${r.sections.filter((s) => s.completedAt).length}/${r.sections.length}`,
          },
          {
            title: 'Deadline',
            dataIndex: 'deadline',
            render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '—'),
          },
          {
            title: 'Submitted',
            dataIndex: 'submittedAt',
            render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '—'),
          },
        ]}
      />
      <Modal
        title="Open monthly report period"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={openState.isLoading}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={{ periodMonth: dayjs() }}
        >
          <Form.Item name="siteId" label="Site" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select site"
              options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
            />
          </Form.Item>
          <Form.Item name="periodMonth" label="Report month" rules={[{ required: true }]}>
            <DatePicker picker="month" style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="deadline" label="Submission deadline">
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
      <ReportDrawer periodId={drawerId} onClose={() => setDrawerId(null)} />
    </>
  );
}

// --------------------------------------------------------------------------
// TAB 2: Performance vs target
// --------------------------------------------------------------------------
function KpiActualModal({
  kpiId,
  period,
  onClose,
}: {
  kpiId: string | null;
  period: string;
  onClose: () => void;
}) {
  const [upsert, state] = useUpsertKpiActualMutation();
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const submit = async (v: { actualValue: number }) => {
    if (!kpiId) return;
    await upsert({ id: kpiId, periodMonth: period, actualValue: v.actualValue }).unwrap();
    message.success('Actual recorded');
    form.resetFields();
    onClose();
  };
  return (
    <Modal
      title="Record KPI actual"
      open={!!kpiId}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={state.isLoading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item label="Period">
          <Input value={period} disabled />
        </Form.Item>
        <Form.Item name="actualValue" label="Actual value" rules={[{ required: true }]}>
          <InputNumber style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function PerformanceTab() {
  const { data: sites } = useGetSitesQuery();
  const [siteId, setSiteId] = useState<string>();
  const [period, setPeriod] = useState(dayjs().format('YYYY-MM'));
  const { data: perf, isFetching } = useGetSitePerformanceQuery(
    { siteId: siteId as string, period },
    { skip: !siteId },
  );
  const [actualKpi, setActualKpi] = useState<string | null>(null);

  return (
    <>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          showSearch
          optionFilterProp="label"
          style={{ width: 240 }}
          placeholder="Select site"
          value={siteId}
          onChange={setSiteId}
          options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
        />
        <DatePicker
          picker="month"
          value={dayjs(period)}
          onChange={(d) => d && setPeriod(d.format('YYYY-MM'))}
        />
      </Space>

      {!siteId ? (
        <Typography.Text type="secondary">Select a site to view KPI performance.</Typography.Text>
      ) : (
        <>
          {perf && (
            <Row gutter={16} style={{ marginBottom: 16 }}>
              <Col>
                <Card size="small">
                  <Statistic
                    title="Weighted site score"
                    value={perf.weightedScore}
                    suffix="/ 100"
                  />
                </Card>
              </Col>
              <Col>
                <Card size="small">
                  <Statistic
                    title="Overall RAG"
                    valueRender={() => <RagTag rag={perf.rag} />}
                    value={perf.rag}
                  />
                </Card>
              </Col>
            </Row>
          )}
          <Table
            rowKey="kpiId"
            loading={isFetching}
            dataSource={perf?.kpis}
            pagination={false}
            columns={[
              { title: 'KPI', dataIndex: 'name' },
              { title: 'Key', dataIndex: 'kpiKey', render: (v: string) => <Tag>{v}</Tag> },
              { title: 'Unit', dataIndex: 'unit', render: (v: string | null) => v ?? '—' },
              { title: 'Weight', dataIndex: 'weight' },
              {
                title: 'Target',
                dataIndex: 'target',
                render: (v: number | null) => (v == null ? '—' : v),
              },
              {
                title: 'Tolerance',
                dataIndex: 'tolerance',
                render: (v: number | null) => (v == null ? '—' : `±${v}`),
              },
              {
                title: 'Actual',
                dataIndex: 'actual',
                render: (v: number | null) => (v == null ? '—' : v),
              },
              {
                title: 'RAG',
                dataIndex: 'rag',
                render: (v: Rag) => <RagTag rag={v} />,
              },
              {
                title: 'Action',
                render: (_: unknown, r: PerfKpiRow) => (
                  <Button size="small" onClick={() => setActualKpi(r.kpiId)}>
                    Record actual
                  </Button>
                ),
              },
            ]}
          />
        </>
      )}
      <KpiActualModal kpiId={actualKpi} period={period} onClose={() => setActualKpi(null)} />
    </>
  );
}

function CrossSiteTab() {
  const [period, setPeriod] = useState(dayjs().format('YYYY-MM'));
  const { data, isFetching } = useGetCrossSiteQuery(period);
  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <DatePicker
          picker="month"
          value={dayjs(period)}
          onChange={(d) => d && setPeriod(d.format('YYYY-MM'))}
        />
      </Space>
      <Table
        rowKey="siteId"
        loading={isFetching}
        dataSource={data?.sites}
        pagination={false}
        columns={[
          { title: 'Site', dataIndex: 'siteName' },
          {
            title: 'Weighted score',
            dataIndex: 'weightedScore',
            render: (v: number) => (
              <Progress percent={Math.round(v)} size="small" style={{ width: 160 }} />
            ),
            sorter: (a: { weightedScore: number }, b: { weightedScore: number }) =>
              a.weightedScore - b.weightedScore,
          },
          { title: 'RAG', dataIndex: 'rag', render: (v: Rag) => <RagTag rag={v} /> },
        ]}
      />
    </>
  );
}

function KpiSetupTab() {
  const { data: sites } = useGetSitesQuery();
  const [siteId, setSiteId] = useState<string>();
  const { data: kpis, isFetching } = useGetSiteKpisQuery(
    siteId ? { siteId } : undefined,
  );
  const siteName = useSiteName();
  const [createKpi, createState] = useCreateSiteKpiMutation();
  const [upsertTarget, targetState] = useUpsertKpiTargetMutation();
  const { message } = App.useApp();
  const [kpiModal, setKpiModal] = useState(false);
  const [targetKpi, setTargetKpi] = useState<string | null>(null);
  const [kpiForm] = Form.useForm();
  const [targetForm] = Form.useForm();

  const submitKpi = async (v: {
    kpiKey: string;
    name: string;
    unit?: string;
    weight?: number;
    direction?: string;
    siteId?: string;
  }) => {
    await createKpi({ ...v, siteId: v.siteId ?? siteId }).unwrap();
    message.success('KPI created');
    setKpiModal(false);
    kpiForm.resetFields();
  };

  const submitTarget = async (v: {
    targetValue: number;
    tolerance?: number;
    periodMonth?: dayjs.Dayjs;
  }) => {
    if (!targetKpi) return;
    await upsertTarget({
      id: targetKpi,
      targetValue: v.targetValue,
      tolerance: v.tolerance,
      periodMonth: v.periodMonth ? v.periodMonth.format('YYYY-MM') : undefined,
    }).unwrap();
    message.success('Target set');
    setTargetKpi(null);
    targetForm.resetFields();
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }} wrap>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 240 }}
          placeholder="Filter by site"
          value={siteId}
          onChange={setSiteId}
          options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
        />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setKpiModal(true)}>
          New KPI
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={kpis}
        pagination={false}
        columns={[
          { title: 'KPI', dataIndex: 'name' },
          { title: 'Key', dataIndex: 'kpiKey', render: (v: string) => <Tag>{v}</Tag> },
          { title: 'Unit', dataIndex: 'unit', render: (v: string | null) => v ?? '—' },
          { title: 'Weight', dataIndex: 'weight' },
          { title: 'Direction', dataIndex: 'direction' },
          {
            title: 'Site',
            dataIndex: 'siteId',
            render: (v: string | null) => (v ? siteName(v) : '—'),
          },
          {
            title: 'Action',
            render: (_: unknown, r: { id: string }) => (
              <Button size="small" onClick={() => setTargetKpi(r.id)}>
                Set target
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title="Create KPI"
        open={kpiModal}
        onCancel={() => setKpiModal(false)}
        onOk={() => kpiForm.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form
          form={kpiForm}
          layout="vertical"
          onFinish={submitKpi}
          initialValues={{ weight: 1, direction: 'HIGHER_BETTER' }}
        >
          <Form.Item name="kpiKey" label="Key" rules={[{ required: true }]}>
            <Input placeholder="timeliness" />
          </Form.Item>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Report Timeliness" />
          </Form.Item>
          <Space>
            <Form.Item name="unit" label="Unit">
              <Input placeholder="%" />
            </Form.Item>
            <Form.Item name="weight" label="Weight">
              <InputNumber min={0} />
            </Form.Item>
          </Space>
          <Form.Item name="direction" label="Direction">
            <Select
              options={[
                { label: 'Higher is better', value: 'HIGHER_BETTER' },
                { label: 'Lower is better', value: 'LOWER_BETTER' },
              ]}
            />
          </Form.Item>
          <Form.Item
            name="siteId"
            label="Site"
            extra="Defaults to the filtered site above."
          >
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="Site scope"
              options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="Set KPI target"
        open={!!targetKpi}
        onCancel={() => setTargetKpi(null)}
        onOk={() => targetForm.submit()}
        confirmLoading={targetState.isLoading}
        destroyOnClose
      >
        <Form form={targetForm} layout="vertical" onFinish={submitTarget}>
          <Form.Item name="targetValue" label="Target value" rules={[{ required: true }]}>
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="tolerance" label="Amber tolerance">
            <InputNumber style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="periodMonth"
            label="Month (optional — for stepped targets)"
          >
            <DatePicker picker="month" style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function PerformanceParent() {
  return (
    <Tabs
      defaultActiveKey="site"
      items={[
        { key: 'site', label: 'Site KPIs vs target', children: <PerformanceTab /> },
        { key: 'cross', label: 'Cross-site scores', children: <CrossSiteTab /> },
        { key: 'setup', label: 'KPI setup', children: <KpiSetupTab /> },
      ]}
    />
  );
}

// --------------------------------------------------------------------------
// TAB 3: PPE & Stores
// --------------------------------------------------------------------------
function PpeTab() {
  const { data: sites } = useGetSitesQuery();
  const [siteId, setSiteId] = useState<string>();
  const { data: compliance, isFetching } = useGetPpeComplianceQuery(
    siteId ? { siteId } : undefined,
  );
  const { data: issues, isFetching: issuesLoading } = useGetPpeIssuesQuery();
  const [create, createState] = useCreatePpeIssueMutation();
  const { message } = App.useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: {
    employeeId: string;
    itemType: string;
    issueDate: dayjs.Dayjs;
    size?: string;
    condition?: string;
    replacementDue?: dayjs.Dayjs;
  }) => {
    await create({
      employeeId: v.employeeId,
      itemType: v.itemType,
      issueDate: v.issueDate.toISOString(),
      size: v.size,
      condition: v.condition,
      replacementDue: v.replacementDue ? v.replacementDue.toISOString() : undefined,
    }).unwrap();
    message.success('PPE issue recorded');
    setModalOpen(false);
    form.resetFields();
  };

  return (
    <>
      <Space wrap style={{ marginBottom: 16 }}>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          style={{ width: 240 }}
          placeholder="Filter compliance by site"
          value={siteId}
          onChange={setSiteId}
          options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
        />
      </Space>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col>
          <Card size="small" loading={isFetching}>
            <Statistic
              title="PPE compliance"
              value={compliance?.compliancePercent ?? 0}
              suffix="%"
            />
          </Card>
        </Col>
        <Col>
          <Card size="small" loading={isFetching}>
            <Statistic
              title="Compliant / required"
              value={`${compliance?.compliantCount ?? 0} / ${compliance?.requiredCount ?? 0}`}
            />
          </Card>
        </Col>
        <Col flex="auto">
          <Card size="small" title="Expiring items" loading={isFetching}>
            {compliance && compliance.expiring.length ? (
              <Table
                rowKey={(r) => `${r.employeeId}-${r.itemType}-${r.replacementDue}`}
                size="small"
                pagination={false}
                dataSource={compliance.expiring}
                columns={[
                  { title: 'Employee', dataIndex: 'employeeId' },
                  { title: 'Item', dataIndex: 'itemType' },
                  {
                    title: 'Replacement due',
                    dataIndex: 'replacementDue',
                    render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '—'),
                  },
                ]}
              />
            ) : (
              <Typography.Text type="secondary">No items expiring soon.</Typography.Text>
            )}
          </Card>
        </Col>
      </Row>

      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Typography.Text type="secondary">PPE issues ledger.</Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Record issue
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={issuesLoading}
        dataSource={issues}
        columns={[
          { title: 'Employee', dataIndex: 'employeeId' },
          { title: 'Item', dataIndex: 'itemType' },
          {
            title: 'Issued',
            dataIndex: 'issueDate',
            render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
          },
          { title: 'Size', dataIndex: 'size', render: (v: string | null) => v ?? '—' },
          {
            title: 'Replacement due',
            dataIndex: 'replacementDue',
            render: (v: string | null) => (v ? dayjs(v).format('YYYY-MM-DD') : '—'),
          },
          { title: 'Condition', dataIndex: 'condition', render: (v: string | null) => v ?? '—' },
        ]}
      />
      <Modal
        title="Record PPE issue"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={{ issueDate: dayjs() }}
        >
          <Form.Item name="employeeId" label="Employee ID" rules={[{ required: true }]}>
            <Input placeholder="employee UUID" />
          </Form.Item>
          <Form.Item name="itemType" label="Item type" rules={[{ required: true }]}>
            <Input placeholder="HARD_HAT" />
          </Form.Item>
          <Form.Item name="issueDate" label="Issue date" rules={[{ required: true }]}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Space>
            <Form.Item name="size" label="Size">
              <Input placeholder="L" />
            </Form.Item>
            <Form.Item name="condition" label="Condition">
              <Input placeholder="GOOD" />
            </Form.Item>
          </Space>
          <Form.Item name="replacementDue" label="Replacement due (optional)">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function StoresTab() {
  const { data: sites } = useGetSitesQuery();
  const siteName = useSiteName();
  const [siteId, setSiteId] = useState<string>();
  const [itemType, setItemType] = useState<string>();
  const { data, isFetching } = useGetStoresWithdrawalsQuery({ siteId, itemType });
  const [create, createState] = useCreateStoresWithdrawalMutation();
  const { message } = App.useApp();
  const [modalOpen, setModalOpen] = useState(false);
  const [form] = Form.useForm();

  const submit = async (v: {
    siteId: string;
    itemType: string;
    description?: string;
    quantity: number;
    unit?: string;
    value: number;
    currency?: string;
    vehicleRef?: string;
    drawnAt: dayjs.Dayjs;
    allocation?: number;
  }) => {
    await create({
      ...v,
      drawnAt: v.drawnAt.toISOString(),
    }).unwrap();
    message.success('Withdrawal recorded');
    setModalOpen(false);
    form.resetFields();
  };

  const itemOptions = ['FUEL', 'OIL', 'MATERIAL', 'TOOL'].map((t) => ({ label: t, value: t }));

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }} wrap>
        <Space wrap>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            style={{ width: 220 }}
            placeholder="Filter by site"
            value={siteId}
            onChange={setSiteId}
            options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
          />
          <Select
            allowClear
            style={{ width: 160 }}
            placeholder="Item type"
            value={itemType}
            onChange={setItemType}
            options={itemOptions}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setModalOpen(true)}>
          Record withdrawal
        </Button>
      </Space>
      <Table
        rowKey="id"
        loading={isFetching}
        dataSource={data}
        columns={[
          {
            title: 'Drawn',
            dataIndex: 'drawnAt',
            render: (v: string) => dayjs(v).format('YYYY-MM-DD'),
          },
          { title: 'Site', render: (_: unknown, r: StoresWithdrawalRecord) => siteName(r.siteId) },
          { title: 'Item', dataIndex: 'itemType', render: (v: string) => <Tag>{v}</Tag> },
          {
            title: 'Qty',
            render: (_: unknown, r: StoresWithdrawalRecord) =>
              `${Number(r.quantity)}${r.unit ? ` ${r.unit}` : ''}`,
          },
          {
            title: 'Value',
            render: (_: unknown, r: StoresWithdrawalRecord) => money(r.value, r.currency),
          },
          { title: 'Vehicle', dataIndex: 'vehicleRef', render: (v: string | null) => v ?? '—' },
          {
            title: 'Allocation',
            dataIndex: 'allocation',
            render: (v: string | null) => (v == null ? '—' : Number(v)),
          },
          {
            title: 'Variance',
            render: (_: unknown, r: StoresWithdrawalRecord) => {
              if (r.allocation == null) return '—';
              const variance = Number(r.quantity) - Number(r.allocation);
              const over = r.overDrawn ?? variance > 0;
              return (
                <Tag color={over ? 'red' : 'green'}>
                  {variance > 0 ? `+${variance}` : variance}
                </Tag>
              );
            },
          },
        ]}
      />
      <Modal
        title="Record stores withdrawal"
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
        width={640}
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={submit}
          initialValues={{ drawnAt: dayjs(), itemType: 'FUEL', currency: 'USD' }}
        >
          <Form.Item name="siteId" label="Site" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select site"
              options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
            />
          </Form.Item>
          <Space>
            <Form.Item name="itemType" label="Item type" rules={[{ required: true }]}>
              <Select style={{ width: 160 }} options={itemOptions} />
            </Form.Item>
            <Form.Item name="description" label="Description">
              <Input placeholder="Diesel top-up" />
            </Form.Item>
          </Space>
          <Space>
            <Form.Item name="quantity" label="Quantity" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 140 }} />
            </Form.Item>
            <Form.Item name="unit" label="Unit">
              <Input placeholder="litres" style={{ width: 120 }} />
            </Form.Item>
            <Form.Item name="allocation" label="Allocation">
              <InputNumber min={0} style={{ width: 140 }} />
            </Form.Item>
          </Space>
          <Space>
            <Form.Item name="value" label="Value" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 160 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency">
              <Input style={{ width: 100 }} />
            </Form.Item>
            <Form.Item name="vehicleRef" label="Vehicle ref">
              <Input placeholder="AES-TRK-04" style={{ width: 160 }} />
            </Form.Item>
          </Space>
          <Form.Item name="drawnAt" label="Drawn at" rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

function PpeStoresParent() {
  return (
    <Tabs
      defaultActiveKey="ppe"
      items={[
        { key: 'ppe', label: 'PPE compliance', children: <PpeTab /> },
        { key: 'stores', label: 'Stores withdrawals', children: <StoresTab /> },
      ]}
    />
  );
}

// --------------------------------------------------------------------------
// PAGE
// --------------------------------------------------------------------------
export function SiteReportsPage() {
  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Site Reports &amp; Performance
      </Typography.Title>
      <Tabs
        defaultActiveKey="monthly"
        items={[
          { key: 'monthly', label: 'Monthly reports', children: <MonthlyReportsTab /> },
          { key: 'performance', label: 'Performance / RAG', children: <PerformanceParent /> },
          { key: 'ppe', label: 'PPE & Stores', children: <PpeStoresParent /> },
        ]}
      />
    </>
  );
}

export default SiteReportsPage;
