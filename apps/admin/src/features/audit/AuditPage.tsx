import { Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useGetAuditQuery } from '../../api/api';

const ACTION_COLOR: Record<string, string> = {
  CREATE: 'green',
  UPDATE: 'blue',
  DELETE: 'red',
  APPROVE: 'green',
  REJECT: 'red',
  STATUS_CHANGE: 'geekblue',
  LOGIN: 'default',
  LOGOUT: 'default',
};

export function AuditPage() {
  const { data, isLoading } = useGetAuditQuery({ take: 100 });

  return (
    <>
      <Typography.Title level={3}>Audit Log</Typography.Title>
      <Typography.Paragraph type="secondary">
        Append-only trail of logins and privileged mutations ({data?.total ?? 0} total).
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data?.items}
        pagination={{ pageSize: 20 }}
        columns={[
          {
            title: 'When',
            dataIndex: 'createdAt',
            render: (d: string) => dayjs(d).format('YYYY-MM-DD HH:mm:ss'),
          },
          {
            title: 'Action',
            dataIndex: 'action',
            render: (a: string) => <Tag color={ACTION_COLOR[a] ?? 'default'}>{a}</Tag>,
          },
          { title: 'Table', dataIndex: 'tableName' },
          { title: 'Record', dataIndex: 'recordId', render: (r) => r ?? '—' },
          { title: 'Actor', dataIndex: 'actorUserId', render: (a) => a ?? '—' },
        ]}
      />
    </>
  );
}
