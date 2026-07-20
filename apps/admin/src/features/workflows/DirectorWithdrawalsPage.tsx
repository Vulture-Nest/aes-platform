import { CheckCircleOutlined, PlusOutlined, SendOutlined } from '@ant-design/icons';
import {
  App,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Space,
  Table,
  Typography,
} from 'antd';
import { useState } from 'react';
import {
  useCompleteDirectorWithdrawalMutation,
  useCreateDirectorWithdrawalMutation,
  useGetDirectorWithdrawalsQuery,
  useSubmitDirectorWithdrawalMutation,
  type DirectorWithdrawalRecord,
} from '../../api/api';
import { useAppSelector } from '../../app/hooks';
import { LookupSelect } from '../../components/LookupSelect';
import { hasAnyRole } from '../../rbac/roles';
import { errorMessage, money, StatusTag } from './shared';

interface WithdrawalForm {
  amount: number;
  currency: string;
  destinationAccount: string;
  reason: string;
}

export function DirectorWithdrawalsPage() {
  const { data, isLoading } = useGetDirectorWithdrawalsQuery();
  const [create, createState] = useCreateDirectorWithdrawalMutation();
  const [submit] = useSubmitDirectorWithdrawalMutation();
  const [complete, completeState] = useCompleteDirectorWithdrawalMutation();
  const { message } = App.useApp();
  const user = useAppSelector((s) => s.auth.user);
  const canManage = hasAnyRole(user, ['DIRECTOR', 'SYS_ADMIN']);

  const [addOpen, setAddOpen] = useState(false);
  const [completeFor, setCompleteFor] = useState<DirectorWithdrawalRecord | null>(null);
  const [form] = Form.useForm();
  const [completeForm] = Form.useForm();

  const guard = async (p: Promise<unknown>, ok: string) => {
    try {
      await p;
      message.success(ok);
      return true;
    } catch (e) {
      message.error(errorMessage(e));
      return false;
    }
  };

  const submitForm = async (v: WithdrawalForm) => {
    const body = {
      amount: v.amount,
      currency: v.currency,
      destinationAccount: v.destinationAccount,
      reason: v.reason,
    };
    if (await guard(create(body).unwrap(), 'Withdrawal raised')) {
      setAddOpen(false);
      form.resetFields();
    }
  };

  const submitComplete = async (v: { transferMethod: string; transferReference: string }) => {
    if (!completeFor) return;
    if (await guard(complete({ id: completeFor.id, ...v }).unwrap(), 'Transfer recorded')) {
      setCompleteFor(null);
      completeForm.resetFields();
    }
  };

  return (
    <>
      <Space style={{ justifyContent: 'space-between', width: '100%', marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          Director withdrawals
        </Typography.Title>
        {canManage && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setAddOpen(true)}>
            Raise withdrawal
          </Button>
        )}
      </Space>
      <Typography.Paragraph type="secondary">
        Requires co-approval by a second director. After it posts, a different director records the
        transfer.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          {
            title: 'Amount',
            align: 'right',
            render: (_: unknown, r: DirectorWithdrawalRecord) => money(r.amount, r.currency),
          },
          { title: 'Destination', dataIndex: 'destinationAccount' },
          { title: 'Reason', dataIndex: 'reason' },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s: string) => <StatusTag status={s} />,
          },
          {
            title: '',
            render: (_: unknown, r: DirectorWithdrawalRecord) =>
              canManage ? (
                <Space>
                  {r.status === 'DRAFT' && (
                    <Popconfirm
                      title="Submit for co-approval by a second director?"
                      onConfirm={() => guard(submit(r.id).unwrap(), 'Submitted for co-approval')}
                    >
                      <Button size="small" icon={<SendOutlined />}>
                        Submit
                      </Button>
                    </Popconfirm>
                  )}
                  {r.status === 'POSTED_AWAITING_TRANSFER' && (
                    <Button
                      size="small"
                      icon={<CheckCircleOutlined />}
                      onClick={() => setCompleteFor(r)}
                    >
                      Record transfer
                    </Button>
                  )}
                </Space>
              ) : null,
          },
        ]}
      />

      <Modal
        title="Raise director withdrawal"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={createState.isLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submitForm}>
          <Space>
            <Form.Item name="amount" label="Amount" rules={[{ required: true }]}>
              <InputNumber min={0} style={{ width: 200 }} />
            </Form.Item>
            <Form.Item name="currency" label="Currency" rules={[{ required: true }]}>
              <LookupSelect category="currency" style={{ width: 120 }} placeholder="Currency" />
            </Form.Item>
          </Space>
          <Form.Item name="destinationAccount" label="Destination account" rules={[{ required: true }]}>
            <Input placeholder="CBZ ***4471" />
          </Form.Item>
          <Form.Item name="reason" label="Reason" rules={[{ required: true }]}>
            <Input placeholder="Director quarterly drawing" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="Record transfer"
        open={!!completeFor}
        onCancel={() => setCompleteFor(null)}
        onOk={() => completeForm.submit()}
        confirmLoading={completeState.isLoading}
        destroyOnClose
      >
        <Typography.Paragraph type="secondary">
          The completer must be a different director than the requester.
        </Typography.Paragraph>
        <Form form={completeForm} layout="vertical" onFinish={submitComplete}>
          <Form.Item name="transferMethod" label="Transfer method" rules={[{ required: true }]}>
            <Input placeholder="EFT" />
          </Form.Item>
          <Form.Item name="transferReference" label="Transfer reference" rules={[{ required: true }]}>
            <Input placeholder="EFT-99182" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
