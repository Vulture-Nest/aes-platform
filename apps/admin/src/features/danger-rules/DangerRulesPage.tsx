import { EditOutlined } from '@ant-design/icons';
import { App, Button, Form, InputNumber, Modal, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import { useGetDangerRulesQuery, useUpdateDangerRuleMutation, type DangerRuleRecord } from '../../api/api';

const SEVERITY_COLOR: Record<string, string> = { INFO: 'blue', WATCH: 'gold', DANGER: 'red' };
// Engine-defined alert severities — the danger engine escalates on these three.
const SEVERITIES = ['INFO', 'WATCH', 'DANGER'];

const prettyKey = (k: string) =>
  k
    .replace(/([A-Z])/g, ' $1')
    .replace(/pct/i, '%')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();

export function DangerRulesPage() {
  const { data, isLoading } = useGetDangerRulesQuery();
  const [update, updateState] = useUpdateDangerRuleMutation();
  const { message } = App.useApp();
  const [editing, setEditing] = useState<DangerRuleRecord | null>(null);
  const [form] = Form.useForm();

  const toggle = async (id: string, enabled: boolean) => {
    await update({ id, enabled }).unwrap();
    message.success(enabled ? 'Rule enabled' : 'Rule disabled');
  };

  const paramKeys = editing ? Object.keys((editing.params ?? {}) as Record<string, unknown>) : [];

  const save = async (v: Record<string, unknown>) => {
    if (!editing) return;
    const params: Record<string, unknown> = {};
    for (const k of paramKeys) params[k] = v[k];
    await update({ id: editing.id, severity: v.severity as string, params }).unwrap();
    message.success('Thresholds updated');
    setEditing(null);
  };

  return (
    <>
      <Typography.Title level={3}>Danger Rules</Typography.Title>
      <Typography.Paragraph type="secondary">
        Tunable thresholds the danger engine evaluates. Edit a rule&apos;s thresholds and severity,
        or toggle it on/off — the engine raises alerts and fans out to directors on breach.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        columns={[
          {
            title: 'Rule',
            dataIndex: 'ruleKey',
            render: (k: string) => <Tag color="geekblue">{k}</Tag>,
          },
          {
            title: 'Severity',
            dataIndex: 'severity',
            render: (s: string) => <Tag color={SEVERITY_COLOR[s] ?? 'default'}>{s}</Tag>,
          },
          {
            title: 'Thresholds',
            dataIndex: 'params',
            render: (p: Record<string, number>) => {
              const entries = Object.entries(p ?? {});
              if (!entries.length) return <Typography.Text type="secondary">—</Typography.Text>;
              return (
                <Space wrap size={4}>
                  {entries.map(([k, val]) => (
                    <Tag key={k}>
                      {prettyKey(k)}: <strong>{String(val)}</strong>
                    </Tag>
                  ))}
                </Space>
              );
            },
          },
          {
            title: 'Enabled',
            dataIndex: 'enabled',
            render: (enabled: boolean, r: DangerRuleRecord) => (
              <Switch checked={enabled} onChange={(v) => toggle(r.id, v)} />
            ),
          },
          {
            title: '',
            render: (_: unknown, r: DangerRuleRecord) => (
              <Button size="small" icon={<EditOutlined />} onClick={() => setEditing(r)}>
                Edit
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title={editing ? `Edit — ${editing.ruleKey}` : ''}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={() => form.submit()}
        confirmLoading={updateState.isLoading}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={save}
          initialValues={
            editing ? { severity: editing.severity, ...(editing.params as object) } : {}
          }
        >
          <Form.Item name="severity" label="Severity" rules={[{ required: true }]}>
            <Select options={SEVERITIES.map((s) => ({ label: s, value: s }))} />
          </Form.Item>
          {paramKeys.length === 0 ? (
            <Typography.Text type="secondary">This rule has no numeric thresholds.</Typography.Text>
          ) : (
            paramKeys.map((k) => (
              <Form.Item key={k} name={k} label={prettyKey(k)} rules={[{ required: true }]}>
                <InputNumber step={0.01} style={{ width: '100%' }} />
              </Form.Item>
            ))
          )}
        </Form>
      </Modal>
    </>
  );
}
