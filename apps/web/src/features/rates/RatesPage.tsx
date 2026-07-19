import { Table, Typography } from 'antd';
import dayjs from 'dayjs';
import { useGetExchangeRatesQuery } from '../../api/api';

export function RatesPage() {
  const { data, isLoading } = useGetExchangeRatesQuery();

  return (
    <>
      <Typography.Title level={3}>Exchange Rates</Typography.Title>
      <Typography.Paragraph type="secondary">
        Official and street/parallel rates, effective-dated. Read-only.
      </Typography.Paragraph>
      <Table
        rowKey="id"
        loading={isLoading}
        dataSource={data}
        columns={[
          {
            title: 'Effective',
            dataIndex: 'dateEffective',
            render: (d: string) => dayjs(d).format('YYYY-MM-DD'),
          },
          { title: 'Pair', dataIndex: 'currencyPair' },
          { title: 'Official', dataIndex: 'officialRate' },
          { title: 'Street', dataIndex: 'parallelRate', render: (p) => p ?? '—' },
          { title: 'Source', dataIndex: 'source', render: (s) => s ?? '—' },
        ]}
      />
    </>
  );
}
