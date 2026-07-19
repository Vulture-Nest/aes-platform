import { App as AntdApp, ConfigProvider, Spin } from 'antd';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuditPage } from './features/audit/AuditPage';
import { LoginPage } from './features/auth/LoginPage';
import { useSession } from './features/auth/useSession';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { DelegationPage } from './features/delegation/DelegationPage';
import { ExchangeRatesPage } from './features/exchange-rates/ExchangeRatesPage';
import { SitesPage } from './features/sites/SitesPage';
import { StatutoryRatesPage } from './features/statutory-rates/StatutoryRatesPage';
import { ThresholdsPage } from './features/thresholds/ThresholdsPage';
import { UsersPage } from './features/users/UsersPage';

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
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/users"
          element={
            <ProtectedRoute roles={['SYS_ADMIN']}>
              <UsersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sites"
          element={
            <ProtectedRoute roles={['SYS_ADMIN']}>
              <SitesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/exchange-rates"
          element={
            <ProtectedRoute roles={['FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN']}>
              <ExchangeRatesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/statutory-rates"
          element={
            <ProtectedRoute roles={['FINANCE_DIRECTOR', 'SYS_ADMIN']}>
              <StatutoryRatesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/thresholds"
          element={
            <ProtectedRoute roles={['FINANCE_DIRECTOR', 'SYS_ADMIN']}>
              <ThresholdsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/delegation"
          element={
            <ProtectedRoute roles={['FINANCE_DIRECTOR', 'OPS_DIRECTOR', 'SYS_ADMIN']}>
              <DelegationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/audit"
          element={
            <ProtectedRoute roles={['SYS_ADMIN', 'AUDITOR']}>
              <AuditPage />
            </ProtectedRoute>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#0B6E4F' } }}>
      <AntdApp>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}
