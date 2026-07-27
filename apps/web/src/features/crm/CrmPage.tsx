import { Tabs, Typography } from 'antd';
import { AnalyticsTab } from './AnalyticsTab';
import { ContactsTab } from './ContactsTab';
import { InteractionsTab } from './InteractionsTab';
import { OrganisationsTab } from './OrganisationsTab';
import { PipelineTab } from './PipelineTab';

export function CrmPage() {
  return (
    <>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        Business Development
      </Typography.Title>
      <Tabs
        defaultActiveKey="pipeline"
        items={[
          { key: 'pipeline', label: 'Pipeline', children: <PipelineTab /> },
          { key: 'organisations', label: 'Organisations', children: <OrganisationsTab /> },
          { key: 'contacts', label: 'Contacts', children: <ContactsTab /> },
          { key: 'interactions', label: 'Interactions', children: <InteractionsTab /> },
          { key: 'analytics', label: 'Analytics', children: <AnalyticsTab /> },
        ]}
      />
    </>
  );
}
