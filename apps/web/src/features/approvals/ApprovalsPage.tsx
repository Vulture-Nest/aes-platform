import { App, Button, Empty, Space, Table, Tag, Typography } from 'antd';
import {
  useDecideApprovalMutation,
  useGetApprovalInboxQuery,
  type ApprovalInboxItem,
} from '../../api/api';

// Field-level approvals live in the web app; the money workflows are approved in
// the admin console. This inbox is scoped to the site-manager's remit.
const SITE_MODULES = ['timesheet_period', 'petty_cash'];
const MODULE_LABEL: Record<string, string> = {
  timesheet_period: 'Timesheet',
  petty_cash: 'Petty cash',
};

export function ApprovalsPage() {
  const { data, isLoading } = useGetApprovalInboxQuery();
  const [decide, decideState] = useDecideApprovalMutation();
  const { message } = App.useApp();

  const items = (data ?? []).filter((i) => SITE_MODULES.includes(i.chain.module));

  const act = async (id: string, decision: 'APPROVED' | 'REJECTED' | 'RETURNED') => {
    await decide({ id, decision }).unwrap();
    message.success(`Decision recorded: ${decision.toLowerCase()}`);
  };

  return (
    <>
      <Typography.Title level={3}>Approvals</Typography.Title>
      <Typography.Paragraph type="secondary">
        Timesheet and petty-cash approvals for your site (matched to your roles). Requisitions,
        travel and other money approvals are handled in the admin console. No self-approval.
      </Typography.Paragraph>
      {!isLoading && items.length === 0 ? (
        <Empty description="Nothing awaiting your approval" />
      ) : (
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={items}
          columns={[
            {
              title: 'Type',
              dataIndex: ['chain', 'module'],
              render: (m: string) => <Tag>{MODULE_LABEL[m] ?? m}</Tag>,
            },
            {
              title: 'Amount',
              render: (_: unknown, r: ApprovalInboxItem) =>
                r.chain.amount ? `${r.chain.currency} ${r.chain.amount}` : '—',
            },
            { title: 'Step', dataIndex: 'step' },
            { title: 'Your role', dataIndex: 'approverRole', render: (r: string) => <Tag color="blue">{r}</Tag> },
            {
              title: 'Decision',
              render: (_: unknown, r: ApprovalInboxItem) => (
                <Space>
                  <Button
                    size="small"
                    type="primary"
                    loading={decideState.isLoading}
                    onClick={() => act(r.id, 'APPROVED')}
                  >
                    Approve
                  </Button>
                  <Button size="small" onClick={() => act(r.id, 'RETURNED')}>
                    Return
                  </Button>
                  <Button size="small" danger onClick={() => act(r.id, 'REJECTED')}>
                    Reject
                  </Button>
                </Space>
              ),
            },
          ]}
        />
      )}
    </>
  );
}
