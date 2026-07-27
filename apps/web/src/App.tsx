import { App as AntdApp, ConfigProvider, Spin } from 'antd';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { aesTheme } from './theme';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './features/auth/LoginPage';
import { useSession } from './features/auth/useSession';
import { HomePage } from './features/home/HomePage';
import { NotificationsPage } from './features/notifications/NotificationsPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { RatesPage } from './features/rates/RatesPage';
import { RequestsPage } from './features/requests/RequestsPage';
import { TravelPage } from './features/travel/TravelPage';
import { PettyCashPage } from './features/petty-cash/PettyCashPage';
import { TimesheetsPage } from './features/timesheets/TimesheetsPage';
import { ApprovalsPage } from './features/approvals/ApprovalsPage';
import { MyOrdersPage } from './features/my-orders/MyOrdersPage';
import { CommandCentrePage } from './features/command-centre/CommandCentrePage';
import { CrmPage } from './features/crm/CrmPage';
import { MarketingPage } from './features/marketing/MarketingPage';
import { BoardsPage } from './features/boards/BoardsPage';
import { ProjectsPage } from './features/projects/ProjectsPage';
import { SiteReportsPage } from './features/site-reports/SiteReportsPage';
import { ReturnsHubPage } from './features/returns-hub/ReturnsHubPage';

function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <AppLayout>
        <Outlet />
      </AppLayout>
    </ProtectedRoute>
  );
}

function Shell() {
  const { initializing } = useSession();
  if (initializing) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/requests" element={<RequestsPage />} />
        <Route path="/travel" element={<TravelPage />} />
        <Route path="/petty-cash" element={<PettyCashPage />} />
        <Route path="/timesheets" element={<TimesheetsPage />} />
        <Route path="/approvals" element={<ApprovalsPage />} />
        <Route path="/my-orders" element={<MyOrdersPage />} />
        <Route path="/command-centre" element={<CommandCentrePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/boards" element={<BoardsPage />} />
        <Route path="/site-reports" element={<SiteReportsPage />} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/marketing" element={<MarketingPage />} />
        <Route path="/returns-hub" element={<ReturnsHubPage />} />
        <Route path="/notifications" element={<NotificationsPage />} />
        <Route path="/rates" element={<RatesPage />} />
        <Route path="/profile" element={<ProfilePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ConfigProvider theme={aesTheme}>
      <AntdApp>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}
