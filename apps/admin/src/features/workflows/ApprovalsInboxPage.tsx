import { CheckOutlined, CloseOutlined, RollbackOutlined } from '@ant-design/icons';
import { App, Button, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { useState } from 'react';
import {
  useDecideApprovalMutation,
  useGetApprovalInboxQuery,
  type ApprovalInboxItem,
} from '../../api/api';
import { errorMessage, money } from './shared';

const MODULE_LABEL: Record<string, string> = {
  requisition: 'Cash requisition',
  travel: 'Travel & allowances',
  petty_cash: 'Petty cash',
  budget: 'Budget',
  director_withdrawal: 'Director withdrawal',
  payroll_run: 'Payroll run',
  timesheet_period: 'Timesheet period',
};

export function ApprovalsInboxPage() {
  const { data, isLoading } = useGetApprovalInboxQuery();
  const [decide, decideState] = useDecideApprovalMutation();
  const { message } = App.useApp();
  const [reasonFor, setReasonFor] = useState<{ item: ApprovalInboxItem; decision: string } | null>(
    null,
  );
  const [comment, setComment] = useState('');

  const act = async (id: string, decision: string, note?: string) => {
    try {
      await decide({ id, decision, comment: note }).unwrap();
      message.success(`Marked ${decision.toLowerCase()}`);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const openReason = (item: ApprovalInboxItem, decision: string) => {
    setComment('');
    setReasonFor({ item, decision });
  };

  const confirmReason = async () => {
    if (!reasonFor) return;
    await act(reasonFor.item.id, reasonFor.decision, comment);
    setReasonFor(null);
  };

  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        My approvals
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        Requests awaiting your decision across all workflows. You cannot approve your own requests.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        locale={{ emptyText: 'Nothing awaiting your approval' }}
        columns={[
          {
            title: 'Type',
            render: (_: unknown, r: ApprovalInboxItem) =>
              MODULE_LABEL[r.chain.module] ?? r.chain.module,
          },
          {
            title: 'Amount',
            align: 'right',
            render: (_: unknown, r: ApprovalInboxItem) =>
              money(r.chain.amount, r.chain.currency ?? undefined),
          },
          {
            title: 'Step',
            render: (_: unknown, r: ApprovalInboxItem) => (
              <Tag>
                {r.step} · {r.approverRole.replace(/_/g, ' ')}
              </Tag>
            ),
          },
          {
            title: 'Reference',
            render: (_: unknown, r: ApprovalInboxItem) => (
              <Typography.Text code>{r.chain.subjectId.slice(0, 8)}</Typography.Text>
            ),
          },
          {
            title: '',
            render: (_: unknown, r: ApprovalInboxItem) => (
              <Space>
                <Button
                  size="small"
                  type="primary"
                  icon={<CheckOutlined />}
                  loading={decideState.isLoading}
                  onClick={() => act(r.id, 'APPROVED')}
                >
                  Approve
                </Button>
                <Button size="small" icon={<RollbackOutlined />} onClick={() => openReason(r, 'RETURNED')}>
                  Return
                </Button>
                <Button size="small" danger icon={<CloseOutlined />} onClick={() => openReason(r, 'REJECTED')}>
                  Reject
                </Button>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={reasonFor?.decision === 'REJECTED' ? 'Reject request' : 'Return request'}
        open={!!reasonFor}
        onCancel={() => setReasonFor(null)}
        onOk={confirmReason}
        confirmLoading={decideState.isLoading}
        okButtonProps={{ danger: reasonFor?.decision === 'REJECTED' }}
        okText={reasonFor?.decision === 'REJECTED' ? 'Reject' : 'Return'}
      >
        <Input.TextArea
          rows={3}
          placeholder="Reason (recommended)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
      </Modal>
    </>
  );
}
