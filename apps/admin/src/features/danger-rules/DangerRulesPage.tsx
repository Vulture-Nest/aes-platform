import { App, Switch, Table, Tag, Typography } from 'antd';
import { useGetDangerRulesQuery, useUpdateDangerRuleMutation, type DangerRuleRecord } from '../../api/api';

const SEVERITY_COLOR: Record<string, string> = { INFO: 'blue', WATCH: 'gold', DANGER: 'red' };

export function DangerRulesPage() {
  const { data, isLoading } = useGetDangerRulesQuery();
  const [update] = useUpdateDangerRuleMutation();
  const { message } = App.useApp();

  const toggle = async (id: string, enabled: boolean) => {
    await update({ id, enabled }).unwrap();
    message.success(enabled ? 'Rule enabled' : 'Rule disabled');
  };

  return (
    <>
      <Typography.Title level={3}>Danger Rules</Typography.Title>
      <Typography.Paragraph type="secondary">
        Tunable thresholds the danger engine evaluates. Toggle rules on/off; the engine raises
        alerts and fans out to directors on breach.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        pagination={false}
        columns={[
          { title: 'Rule', dataIndex: 'ruleKey', render: (k: string) => <Tag color="geekblue">{k}</Tag> },
          {
            title: 'Severity',
            dataIndex: 'severity',
            render: (s: string) => <Tag color={SEVERITY_COLOR[s] ?? 'default'}>{s}</Tag>,
          },
          {
            title: 'Params',
            dataIndex: 'params',
            render: (p: unknown) => (
              <Typography.Text type="secondary" code>
                {JSON.stringify(p)}
              </Typography.Text>
            ),
          },
          {
            title: 'Enabled',
            dataIndex: 'enabled',
            render: (enabled: boolean, r: DangerRuleRecord) => (
              <Switch checked={enabled} onChange={(v) => toggle(r.id, v)} />
            ),
          },
        ]}
      />
    </>
  );
}
