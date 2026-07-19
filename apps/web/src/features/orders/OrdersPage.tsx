import { Table, Tag, Typography } from 'antd';
import dayjs from 'dayjs';
import { useGetOrdersQuery, type OrderRecord } from '../../api/api';

export function OrdersPage() {
  const { data, isLoading } = useGetOrdersQuery();

  return (
    <>
      <Typography.Title level={3}>Orders</Typography.Title>
      <Typography.Paragraph type="secondary">Order book with servicing status.</Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          { title: 'Reference', dataIndex: 'reference' },
          {
            title: 'Value (ex VAT)',
            render: (_: unknown, r: OrderRecord) => `${r.currency} ${r.valueExVat}`,
          },
          {
            title: 'Serviced',
            dataIndex: 'serviced',
            render: (s: boolean) =>
              s ? <Tag color="green">serviced</Tag> : <Tag color="gold">open</Tag>,
          },
          {
            title: 'Closing date',
            dataIndex: 'closingDate',
            render: (d: string | null) => (d ? dayjs(d).format('YYYY-MM-DD') : '—'),
          },
        ]}
      />
    </>
  );
}
