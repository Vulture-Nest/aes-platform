import { App, Button, Empty, Space, Table, Tag, Typography } from 'antd';
import {
  useDecideApprovalMutation,
  useGetApprovalInboxQuery,
  type ApprovalInboxItem,
} from '../../api/api';

export function ApprovalsPage() {
  const { data, isLoading } = useGetApprovalInboxQuery();
  const [decide, decideState] = useDecideApprovalMutation();
  const { message } = App.useApp();

  const act = async (id: string, decision: 'APPROVED' | 'REJECTED' | 'RETURNED') => {
    await decide({ id, decision }).unwrap();
    message.success(`Decision recorded: ${decision.toLowerCase()}`);
  };

  return (
    <>
      <Typography.Title level={3}>Approvals Inbox</Typography.Title>
      <Typography.Paragraph type="secondary">
        Items awaiting your decision (matched to your roles). No self-approval — you cannot
        approve a request you raised.
      </Typography.Paragraph>
      {data && data.length === 0 ? (
        <Empty description="Nothing awaiting your approval" />
      ) : (
        <Table
          rowKey="id"
          loading={isLoading}
          dataSource={data}
          columns={[
            { title: 'Module', dataIndex: ['chain', 'module'], render: (m: string) => <Tag>{m}</Tag> },
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
