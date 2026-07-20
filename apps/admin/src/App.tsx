import { App as AntdApp, ConfigProvider, Spin } from 'antd';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { aesTheme } from './theme';
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
import { ApprovalMatrixPage } from './features/approval-matrix/ApprovalMatrixPage';
import { AccountsPage } from './features/accounts/AccountsPage';
import { EmployeesPage } from './features/employees/EmployeesPage';
import { ClientsPage } from './features/clients/ClientsPage';
import { ContractsPage } from './features/contracts/ContractsPage';
import { ExpensesPage } from './features/expenses/ExpensesPage';
import { OrdersPage } from './features/orders/OrdersPage';
import { PayrollPage } from './features/payroll/PayrollPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { TimesheetsPage } from './features/timesheets/TimesheetsPage';
import { BusinessDevelopmentPage } from './features/crm/BusinessDevelopmentPage';
import { DangerRulesPage } from './features/danger-rules/DangerRulesPage';
import { SettingsPage } from './features/settings/SettingsPage';

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
          path="/approval-matrix"
          element={
            <ProtectedRoute roles={['SYS_ADMIN', 'FINANCE_DIRECTOR']}>
              <ApprovalMatrixPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/danger-rules"
          element={
            <ProtectedRoute roles={['SYS_ADMIN', 'FINANCE_DIRECTOR']}>
              <DangerRulesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/accounts"
          element={
            <ProtectedRoute roles={['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER']}>
              <AccountsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/employees"
          element={
            <ProtectedRoute roles={['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER']}>
              <EmployeesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients"
          element={
            <ProtectedRoute roles={['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'AUDITOR']}>
              <ClientsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/contracts"
          element={
            <ProtectedRoute roles={['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'AUDITOR']}>
              <ContractsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedRoute roles={['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'AUDITOR']}>
              <OrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/expenses"
          element={
            <ProtectedRoute roles={['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'AUDITOR']}>
              <ExpensesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/timesheets"
          element={
            <ProtectedRoute
              roles={[
                'SITE_CLERK',
                'SITE_MANAGER',
                'OPS_STAFF',
                'OPS_DIRECTOR',
                'FINANCE_OFFICER',
                'FINANCE_DIRECTOR',
                'DIRECTOR',
                'SYS_ADMIN',
                'AUDITOR',
              ]}
            >
              <TimesheetsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payroll"
          element={
            <ProtectedRoute roles={['FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN']}>
              <PayrollPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute
              roles={[
                'SYS_ADMIN',
                'FINANCE_DIRECTOR',
                'FINANCE_OFFICER',
                'OPS_DIRECTOR',
                'DIRECTOR',
                'AUDITOR',
              ]}
            >
              <ReportsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/business-development"
          element={
            <ProtectedRoute
              roles={['OPS_STAFF', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN', 'FINANCE_DIRECTOR', 'AUDITOR']}
            >
              <BusinessDevelopmentPage />
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
        <Route
          path="/settings"
          element={
            <ProtectedRoute roles={['SYS_ADMIN']}>
              <SettingsPage />
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
    <ConfigProvider theme={aesTheme}>
      <AntdApp>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}
