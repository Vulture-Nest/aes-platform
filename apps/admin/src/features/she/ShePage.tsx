import { PlusOutlined, SafetyOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  Col,
  DatePicker,
  Form,
  Input,
  Modal,
  Row,
  Select,
  Space,
  Statistic,
  Switch,
  Table,
  Tag,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { useGetSitesQuery } from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { hasAnyRole } from '../../rbac/roles';
import {
  SHE_STATUSES,
  SHE_TYPES,
  useCreateSheRecordMutation,
  useGetSheRecordsQuery,
  useGetSheStatsQuery,
  useUpdateSheRecordMutation,
  type SheRecord,
  type SheStatus,
  type SheType,
} from './sheApi';

const CAPTURE_ROLES = ['SITE_CLERK', 'SITE_MANAGER', 'OPS_STAFF', 'SYS_ADMIN'] as const;
const INVESTIGATE_ROLES = ['SITE_MANAGER', 'OPS_DIRECTOR', 'SYS_ADMIN'] as const;

const TYPE_LABELS: Record<SheType, string> = {
  INCIDENT: 'Incident',
  NEAR_MISS: 'Near miss',
  TOOLBOX_TALK: 'Toolbox talk',
  MEDICAL: 'Medical',
  DRILL: 'Drill',
  HAZARD: 'Hazard',
};

const typeColor: Record<SheType, string> = {
  INCIDENT: 'red',
  NEAR_MISS: 'volcano',
  TOOLBOX_TALK: 'blue',
  MEDICAL: 'magenta',
  DRILL: 'geekblue',
  HAZARD: 'orange',
};

const statusColor: Record<SheStatus, string> = {
  OPEN: 'red',
  IN_PROGRESS: 'gold',
  CLOSED: 'green',
};

function useSiteName() {
  const { data: sites } = useGetSitesQuery();
  return useMemo(() => {
    const map = new Map((sites ?? []).map((s) => [s.id, s.name]));
    return (id: string | null | undefined) => (id ? (map.get(id) ?? id) : '—');
  }, [sites]);
}

export function ShePage() {
  const { data: sites } = useGetSitesQuery();
  const siteName = useSiteName();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);
  const canCapture = hasAnyRole(user, [...CAPTURE_ROLES]);
  const canInvestigate = hasAnyRole(user, [...INVESTIGATE_ROLES]);

  const [siteId, setSiteId] = useState<string>();
  const [type, setType] = useState<SheType>();
  const [status, setStatus] = useState<SheStatus>();

  const filter = {
    ...(siteId ? { siteId } : {}),
    ...(type ? { type } : {}),
    ...(status ? { status } : {}),
  };
  const { data: records, isLoading } = useGetSheRecordsQuery(
    Object.keys(filter).length ? filter : undefined,
  );
  const { data: stats } = useGetSheStatsQuery(siteId ? { siteId } : undefined);

  const [create, createState] = useCreateSheRecordMutation();
  const [update, updateState] = useUpdateSheRecordMutation();

  const [logOpen, setLogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<SheRecord | null>(null);
  const [logForm] = Form.useForm();
  const [editForm] = Form.useForm();

  const onLog = async (v: {
    type: SheType;
    siteId: string;
    title: string;
    description?: string;
    severity?: string;
    occurredAt: dayjs.Dayjs;
    lti?: boolean;
  }) => {
    try {
      await create({
        type: v.type,
        siteId: v.siteId,
        title: v.title,
        description: v.description,
        severity: v.severity,
        occurredAt: v.occurredAt.toISOString(),
        lti: v.lti ?? false,
      }).unwrap();
      message.success('SHE record logged');
      setLogOpen(false);
      logForm.resetFields();
    } catch (e) {
      const err = e as { data?: { message?: string } };
      message.error(err.data?.message ?? 'Could not log SHE record');
    }
  };

  const onEdit = async (v: { status?: SheStatus; investigation?: string; lti?: boolean }) => {
    if (!editRecord) return;
    try {
      await update({
        id: editRecord.id,
        status: v.status,
        investigation: v.investigation,
        lti: v.lti,
      }).unwrap();
      message.success('SHE record updated');
      setEditRecord(null);
      editForm.resetFields();
    } catch (e) {
      const err = e as { data?: { message?: string } };
      message.error(err.data?.message ?? 'Could not update SHE record');
    }
  };

  const openEdit = (r: SheRecord) => {
    setEditRecord(r);
    editForm.setFieldsValue({ status: r.status, investigation: r.investigation, lti: r.lti });
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          <SafetyOutlined /> Safety, Health &amp; Environment
        </Typography.Title>
        {canCapture && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setLogOpen(true)}>
            Log SHE record
          </Button>
        )}
      </Space>
      <Typography.Paragraph type="secondary">
        Structured SHE records (incidents, near misses, toolbox talks, medicals, drills, hazards)
        captured per site, with LTI tracking and investigations. The summary below is a TRIFR-style
        snapshot for the selected scope.
      </Typography.Paragraph>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic title="Total records" value={stats?.total ?? 0} />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic title="Incidents" value={stats?.incidentCount ?? 0} />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic
              title="Lost-time injuries"
              value={stats?.ltiCount ?? 0}
              valueStyle={{ color: (stats?.ltiCount ?? 0) > 0 ? '#cf1322' : undefined }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6} md={4}>
          <Card size="small">
            <Statistic title="Open investigations" value={stats?.openInvestigations ?? 0} />
          </Card>
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Card size="small">
            <Space size={[4, 4]} wrap>
              {SHE_TYPES.map((t) => (
                <Tag key={t} color={typeColor[t]}>
                  {TYPE_LABELS[t]}: {stats?.byType?.[t] ?? 0}
                </Tag>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>

      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          allowClear
          showSearch
          optionFilterProp="label"
          placeholder="All sites"
          style={{ width: 220 }}
          value={siteId}
          onChange={(v) => setSiteId(v)}
          options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
        />
        <Select
          allowClear
          placeholder="All types"
          style={{ width: 160 }}
          value={type}
          onChange={(v) => setType(v)}
          options={SHE_TYPES.map((t) => ({ label: TYPE_LABELS[t], value: t }))}
        />
        <Select
          allowClear
          placeholder="All statuses"
          style={{ width: 160 }}
          value={status}
          onChange={(v) => setStatus(v)}
          options={SHE_STATUSES.map((s) => ({ label: s, value: s }))}
        />
      </Space>

      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={records}
        columns={[
          {
            title: 'Occurred',
            dataIndex: 'occurredAt',
            width: 160,
            render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm'),
          },
          { title: 'Site', render: (_: unknown, r: SheRecord) => siteName(r.siteId) },
          {
            title: 'Type',
            dataIndex: 'type',
            render: (t: SheType) => <Tag color={typeColor[t]}>{TYPE_LABELS[t]}</Tag>,
          },
          { title: 'Title', dataIndex: 'title' },
          {
            title: 'Severity',
            dataIndex: 'severity',
            render: (v: string | null) => v || '—',
          },
          {
            title: 'LTI',
            dataIndex: 'lti',
            width: 70,
            render: (v: boolean) => (v ? <Tag color="red">LTI</Tag> : '—'),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: SheStatus) => <Tag color={statusColor[s]}>{s}</Tag>,
          },
          {
            title: '',
            width: 90,
            render: (_: unknown, r: SheRecord) =>
              canInvestigate ? (
                <Button size="small" onClick={() => openEdit(r)}>
                  Update
                </Button>
              ) : null,
          },
        ]}
      />

      <Modal
        title="Log SHE record"
        open={logOpen}
        onCancel={() => setLogOpen(false)}
        onOk={() => logForm.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form
          form={logForm}
          layout="vertical"
          onFinish={onLog}
          initialValues={{ occurredAt: dayjs(), lti: false }}
        >
          <Form.Item name="type" label="Type" rules={[{ required: true }]}>
            <Select
              placeholder="Select type"
              options={SHE_TYPES.map((t) => ({ label: TYPE_LABELS[t], value: t }))}
            />
          </Form.Item>
          <Form.Item name="siteId" label="Site" rules={[{ required: true }]}>
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select site"
              options={(sites ?? []).map((s) => ({ label: s.name, value: s.id }))}
            />
          </Form.Item>
          <Form.Item name="title" label="Title" rules={[{ required: true }]}>
            <Input placeholder="e.g. Slip near the wash bay" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={3} placeholder="What happened?" />
          </Form.Item>
          <Form.Item name="severity" label="Severity">
            <Input placeholder="e.g. MINOR / MODERATE / SEVERE" />
          </Form.Item>
          <Form.Item name="occurredAt" label="Occurred at" rules={[{ required: true }]}>
            <DatePicker showTime style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="lti" label="Lost-time injury (LTI)" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Update SHE record"
        open={!!editRecord}
        onCancel={() => setEditRecord(null)}
        onOk={() => editForm.submit()}
        confirmLoading={updateState.isLoading}
        destroyOnClose
      >
        {editRecord && (
          <Typography.Paragraph type="secondary">
            {TYPE_LABELS[editRecord.type]} · {siteName(editRecord.siteId)} · {editRecord.title}
          </Typography.Paragraph>
        )}
        <Form form={editForm} layout="vertical" onFinish={onEdit}>
          <Form.Item name="status" label="Status">
            <Select options={SHE_STATUSES.map((s) => ({ label: s, value: s }))} />
          </Form.Item>
          <Form.Item name="investigation" label="Investigation notes">
            <Input.TextArea rows={4} placeholder="Findings, root cause, corrective actions…" />
          </Form.Item>
          <Form.Item name="lti" label="Lost-time injury (LTI)" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
