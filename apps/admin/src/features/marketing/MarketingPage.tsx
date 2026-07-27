import { Tabs, Typography } from 'antd';
import { AnalyticsTab } from './AnalyticsTab';
import { CampaignsTab } from './CampaignsTab';
import { ResponsesTab } from './ResponsesTab';

export function MarketingPage() {
  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Marketing Campaigns
      </Typography.Title>
      <Tabs
        defaultActiveKey="campaigns"
        items={[
          { key: 'campaigns', label: 'Campaigns', children: <CampaignsTab /> },
          { key: 'responses', label: 'Responses / Leads', children: <ResponsesTab /> },
          { key: 'analytics', label: 'Analytics', children: <AnalyticsTab /> },
        ]}
      />
    </>
  );
}

export default MarketingPage;
