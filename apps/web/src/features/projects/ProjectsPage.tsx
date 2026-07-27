import { PlusOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Progress,
  Select,
  Slider,
  Space,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useGetSitesQuery } from '../../api/api';
import {
  useAddProjectNodeMutation,
  useCreateProjectFromTemplateMutation,
  useCreateProjectMutation,
  useGetPortfolioQuery,
  useGetProjectHealthQuery,
  useGetProjectQuery,
  useGetTemplatesQuery,
  useUpdateNodeProgressMutation,
  type PortfolioRow,
  type ProjectNodeRecord,
  type ProjectNodeType,
  type Rag,
} from './projectsApi';

const RAG_COLOR: Record<Rag, string> = { GREEN: 'green', AMBER: 'orange', RED: 'red' };

function ragTag(rag: Rag) {
  return <Tag color={RAG_COLOR[rag]}>{rag}</Tag>;
}

function progressStatus(rag: Rag): 'success' | 'normal' | 'exception' | 'active' {
  if (rag === 'RED') return 'exception';
  if (rag === 'AMBER') return 'active';
  return 'normal';
}

function daysLabel(days: number | null): ReactNode {
  if (days === null) return <Typography.Text type="secondary">—</Typography.Text>;
  const rounded = Math.round(days);
  if (rounded === 0) return <Tag>On schedule</Tag>;
  if (rounded > 0) return <Tag color="green">{rounded}d ahead</Tag>;
  return <Tag color="red">{Math.abs(rounded)}d behind</Tag>;
}

const fmtDate = (d: string | null) => (d ? dayjs(d).format('YYYY-MM-DD') : '—');
const pct = (v: string | number) => Number(v);

// ---------------------------------------------------------------------------
// WBS tree helpers
// ---------------------------------------------------------------------------
interface TreeNode extends ProjectNodeRecord {
  children?: TreeNode[];
}

function buildTree(nodes: ProjectNodeRecord[]): TreeNode[] {
  const byParent = new Map<string | null, ProjectNodeRecord[]>();
  for (const n of nodes) {
    const key = n.parentId ?? null;
    const list = byParent.get(key);
    if (list) list.push(n);
    else byParent.set(key, [n]);
  }
  const build = (parentId: string | null): TreeNode[] =>
    (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((n) => {
        const kids = build(n.id);
        return kids.length > 0 ? { ...n, children: kids } : { ...n };
      });
  return build(null);
}

const NODE_TYPE_COLOR: Record<ProjectNodeType, string> = {
  PHASE: 'geekblue',
  TASK: 'cyan',
  SUBTASK: 'default',
};

// ---------------------------------------------------------------------------
// Create project modal
// ---------------------------------------------------------------------------
function CreateProjectModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [create, createState] = useCreateProjectMutation();
  const { data: sites } = useGetSitesQuery();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const submit = async (v: {
    name: string;
    description?: string;
    siteId?: string;
    planned?: [dayjs.Dayjs, dayjs.Dayjs];
  }) => {
    await create({
      name: v.name,
      description: v.description,
      siteId: v.siteId,
      plannedStart: v.planned?.[0]?.toISOString(),
      plannedFinish: v.planned?.[1]?.toISOString(),
    }).unwrap();
    message.success('Project created');
    form.resetFields();
    onClose();
  };

  return (
    <Modal
      title="Create project"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={createState.isLoading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="name" label="Name" rules={[{ required: true }]}>
          <Input placeholder="Unki Tailings Dam Wall Raise" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="siteId" label="Site">
          <Select
            allowClear
            placeholder="Select site"
            options={(sites ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
        </Form.Item>
        <Form.Item name="planned" label="Planned start → finish">
          <DatePicker.RangePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Add node modal
// ---------------------------------------------------------------------------
function AddNodeModal({
  open,
  projectId,
  nodes,
  onClose,
  onDone,
}: {
  open: boolean;
  projectId: string;
  nodes: ProjectNodeRecord[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [addNode, addState] = useAddProjectNodeMutation();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const submit = async (v: {
    type: ProjectNodeType;
    title: string;
    parentId?: string;
    weight?: number;
    planned?: [dayjs.Dayjs, dayjs.Dayjs];
  }) => {
    await addNode({
      projectId,
      type: v.type,
      title: v.title,
      parentId: v.parentId,
      weight: v.weight,
      plannedStart: v.planned?.[0]?.toISOString(),
      plannedFinish: v.planned?.[1]?.toISOString(),
    }).unwrap();
    message.success('Node added');
    form.resetFields();
    onDone();
    onClose();
  };

  return (
    <Modal
      title="Add WBS node"
      open={open}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={addState.isLoading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={submit} initialValues={{ type: 'PHASE', weight: 1 }}>
        <Form.Item name="type" label="Type" rules={[{ required: true }]}>
          <Select
            options={[
              { value: 'PHASE', label: 'Phase' },
              { value: 'TASK', label: 'Task' },
              { value: 'SUBTASK', label: 'Subtask' },
            ]}
          />
        </Form.Item>
        <Form.Item name="title" label="Title" rules={[{ required: true }]}>
          <Input placeholder="Excavation" />
        </Form.Item>
        <Form.Item name="parentId" label="Parent node (leave empty for top-level phase)">
          <Select
            allowClear
            placeholder="Top-level"
            options={nodes.map((n) => ({ value: n.id, label: `${n.type} · ${n.title}` }))}
          />
        </Form.Item>
        <Form.Item name="weight" label="Weight (relative to siblings)">
          <Input type="number" min={0} />
        </Form.Item>
        <Form.Item name="planned" label="Planned start → finish">
          <DatePicker.RangePicker style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Update progress modal
// ---------------------------------------------------------------------------
function UpdateProgressModal({
  node,
  projectId,
  onClose,
  onDone,
}: {
  node: ProjectNodeRecord | null;
  projectId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [update, updateState] = useUpdateNodeProgressMutation();
  const { message } = App.useApp();
  const [percent, setPercent] = useState(0);
  const [note, setNote] = useState('');
  const [complete, setComplete] = useState(false);

  // Reset local state each time a node is opened.
  const nodeId = node?.id ?? null;
  useEffect(() => {
    if (node) {
      setPercent(Number(node.percentComplete));
      setNote('');
      setComplete(Number(node.percentComplete) >= 100);
    }
  }, [nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!node) return;
    await update({
      projectId,
      nodeId: node.id,
      percentComplete: percent,
      note: note.trim() || undefined,
      complete,
    }).unwrap();
    message.success('Progress updated');
    onDone();
    onClose();
  };

  return (
    <Modal
      title={node ? `Update progress — ${node.title}` : 'Update progress'}
      open={!!node}
      onCancel={onClose}
      onOk={submit}
      confirmLoading={updateState.isLoading}
      destroyOnClose
    >
      <Form layout="vertical">
        <Form.Item label={`Percent complete: ${complete ? 100 : percent}%`}>
          <Slider
            min={0}
            max={100}
            value={complete ? 100 : percent}
            disabled={complete}
            onChange={(v) => setPercent(v)}
          />
        </Form.Item>
        <Form.Item label="Note (optional)">
          <Input
            placeholder="One-line progress note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Form.Item>
        <Form.Item label="Mark complete (forces 100% and rolls up)">
          <Switch checked={complete} onChange={setComplete} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Schedule health panel
// ---------------------------------------------------------------------------
function HealthPanel({ projectId }: { projectId: string }) {
  const { data, isLoading } = useGetProjectHealthQuery(projectId);
  if (!data && isLoading) return <Card loading style={{ marginBottom: 16 }} />;
  if (!data) return null;
  return (
    <Card size="small" title="Schedule health" style={{ marginBottom: 16 }}>
      <Space size="large" wrap>
        <Statistic title="Planned %" value={data.plannedPercent} suffix="%" precision={1} />
        <Statistic title="Actual %" value={data.actualPercent} suffix="%" precision={1} />
        <Statistic
          title="Variance"
          value={data.variancePercent}
          suffix="%"
          precision={1}
          valueStyle={{ color: data.variancePercent < 0 ? '#cf1322' : '#3f8600' }}
        />
        <div>
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 14 }}>
            Schedule
          </Typography.Text>
          <div style={{ marginTop: 4 }}>{daysLabel(data.daysAheadBehind)}</div>
        </div>
        <div>
          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 14 }}>
            RAG
          </Typography.Text>
          <div style={{ marginTop: 4 }}>{ragTag(data.rag)}</div>
        </div>
      </Space>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Project detail drawer (WBS tree)
// ---------------------------------------------------------------------------
function ProjectDetailDrawer({
  projectId,
  open,
  onClose,
}: {
  projectId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isFetching, refetch } = useGetProjectQuery(projectId ?? '', {
    skip: !projectId,
  });
  const [addOpen, setAddOpen] = useState(false);
  const [progressNode, setProgressNode] = useState<ProjectNodeRecord | null>(null);

  const tree = useMemo(() => buildTree(data?.nodes ?? []), [data?.nodes]);

  const columns: ColumnsType<TreeNode> = [
    {
      title: 'Node',
      dataIndex: 'title',
      key: 'title',
      render: (title: string, r) => (
        <Space>
          <Tag color={NODE_TYPE_COLOR[r.type]}>{r.type}</Tag>
          <span>{title}</span>
        </Space>
      ),
    },
    {
      title: '% Complete',
      dataIndex: 'percentComplete',
      key: 'percentComplete',
      width: 180,
      render: (v: string) => (
        <Progress percent={Math.round(pct(v))} size="small" style={{ width: 140 }} />
      ),
    },
    { title: 'Weight', dataIndex: 'weight', key: 'weight', width: 80, render: (v: string) => pct(v) },
    {
      title: 'Planned',
      key: 'planned',
      width: 200,
      render: (_: unknown, r) => `${fmtDate(r.plannedStart)} → ${fmtDate(r.plannedFinish)}`,
    },
    {
      title: 'Actual',
      key: 'actual',
      width: 200,
      render: (_: unknown, r) => `${fmtDate(r.actualStart)} → ${fmtDate(r.actualFinish)}`,
    },
    {
      title: 'Action',
      key: 'action',
      width: 130,
      render: (_: unknown, r) => (
        <Button size="small" onClick={() => setProgressNode(r)}>
          Update progress
        </Button>
      ),
    },
  ];

  return (
    <Drawer
      title={data?.name ?? 'Project'}
      width={960}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      {projectId && (
        <>
          <HealthPanel projectId={projectId} />
          {data && (
            <Descriptions size="small" column={3} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Status">{data.status}</Descriptions.Item>
              <Descriptions.Item label="Overall %">
                {Math.round(pct(data.percentComplete))}%
              </Descriptions.Item>
              <Descriptions.Item label="Planned">
                {fmtDate(data.plannedStart)} → {fmtDate(data.plannedFinish)}
              </Descriptions.Item>
            </Descriptions>
          )}
          <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
            <Typography.Text type="secondary">
              Work breakdown structure — phases › tasks › subtasks. Roll-up reflects up the tree.
            </Typography.Text>
            <Button icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
              Add node
            </Button>
          </Space>
          <Table<TreeNode>
            rowKey="id"
            loading={isFetching}
            dataSource={tree}
            columns={columns}
            pagination={false}
            expandable={{ defaultExpandAllRows: true }}
            size="small"
          />
          <AddNodeModal
            open={addOpen}
            projectId={projectId}
            nodes={data?.nodes ?? []}
            onClose={() => setAddOpen(false)}
            onDone={() => refetch()}
          />
          <UpdateProgressModal
            node={progressNode}
            projectId={projectId}
            onClose={() => setProgressNode(null)}
            onDone={() => refetch()}
          />
        </>
      )}
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// Portfolio tab
// ---------------------------------------------------------------------------
function PortfolioTab() {
  const { data, isLoading, refetch } = useGetPortfolioQuery();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const columns: ColumnsType<PortfolioRow> = [
    {
      title: 'Project',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, r) => (
        <Button type="link" style={{ padding: 0 }} onClick={() => setSelectedId(r.projectId)}>
          {name}
        </Button>
      ),
    },
    { title: 'Status', dataIndex: 'status', key: 'status', render: (s: string) => <Tag>{s}</Tag> },
    {
      title: 'Progress',
      dataIndex: 'percentComplete',
      key: 'progress',
      width: 220,
      render: (v: number, r) => (
        <Progress
          percent={Math.round(v)}
          size="small"
          status={progressStatus(r.rag)}
          style={{ width: 180 }}
        />
      ),
    },
    {
      title: 'Schedule',
      dataIndex: 'daysAheadBehind',
      key: 'days',
      render: (v: number | null) => daysLabel(v),
    },
    { title: 'RAG', dataIndex: 'rag', key: 'rag', render: (r: Rag) => ragTag(r) },
  ];

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 12 }}>
        <Typography.Text type="secondary">
          Portfolio — every project with % complete, days ahead/behind and RAG health.
        </Typography.Text>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Create project
        </Button>
      </Space>
      <Table<PortfolioRow>
        rowKey="projectId"
        loading={isLoading}
        dataSource={data}
        columns={columns}
      />
      <CreateProjectModal
        open={createOpen}
        onClose={() => {
          setCreateOpen(false);
          refetch();
        }}
      />
      <ProjectDetailDrawer
        projectId={selectedId}
        open={!!selectedId}
        onClose={() => {
          setSelectedId(null);
          refetch();
        }}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Templates tab
// ---------------------------------------------------------------------------
function FromTemplateModal({
  templateId,
  onClose,
  onDone,
}: {
  templateId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [create, createState] = useCreateProjectFromTemplateMutation();
  const { data: sites } = useGetSitesQuery();
  const { message } = App.useApp();
  const [form] = Form.useForm();

  const submit = async (v: { name: string; description?: string; siteId?: string }) => {
    if (!templateId) return;
    await create({ templateId, ...v }).unwrap();
    message.success('Project created from template');
    form.resetFields();
    onDone();
    onClose();
  };

  return (
    <Modal
      title="Create project from template"
      open={!!templateId}
      onCancel={onClose}
      onOk={() => form.submit()}
      confirmLoading={createState.isLoading}
      destroyOnClose
    >
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="name" label="Project name" rules={[{ required: true }]}>
          <Input placeholder="New project from template" />
        </Form.Item>
        <Form.Item name="description" label="Description">
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="siteId" label="Site">
          <Select
            allowClear
            placeholder="Select site"
            options={(sites ?? []).map((s) => ({ value: s.id, label: s.name }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function TemplatesTab() {
  const { data, isLoading } = useGetTemplatesQuery();
  const [fromTemplateId, setFromTemplateId] = useState<string | null>(null);

  return (
    <>
      <Typography.Text type="secondary">
        Reusable WBS templates. Create a project by exploding a template into nodes.
      </Typography.Text>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        style={{ marginTop: 12 }}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          { title: 'Job type', dataIndex: 'jobType', render: (v: string | null) => v ?? '—' },
          {
            title: 'Created',
            dataIndex: 'createdAt',
            render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
          },
          {
            title: 'Action',
            key: 'action',
            render: (_: unknown, r: { id: string }) => (
              <Button size="small" type="primary" onClick={() => setFromTemplateId(r.id)}>
                Create project from template
              </Button>
            ),
          },
        ]}
      />
      <FromTemplateModal
        templateId={fromTemplateId}
        onClose={() => setFromTemplateId(null)}
        onDone={() => setFromTemplateId(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export function ProjectsPage() {
  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Project WBS &amp; Progress
      </Typography.Title>
      <Tabs
        defaultActiveKey="portfolio"
        items={[
          { key: 'portfolio', label: 'Portfolio', children: <PortfolioTab /> },
          { key: 'templates', label: 'Templates', children: <TemplatesTab /> },
        ]}
      />
    </>
  );
}

export default ProjectsPage;
