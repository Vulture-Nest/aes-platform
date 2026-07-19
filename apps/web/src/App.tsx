import { App as AntdApp, ConfigProvider, Spin } from 'antd';
import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { AppLayout } from './components/AppLayout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './features/auth/LoginPage';
import { useSession } from './features/auth/useSession';
import { HomePage } from './features/home/HomePage';
import { NotificationsPage } from './features/notifications/NotificationsPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { RatesPage } from './features/rates/RatesPage';

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
    <ConfigProvider theme={{ token: { colorPrimary: '#0B6E4F' } }}>
      <AntdApp>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </AntdApp>
    </ConfigProvider>
  );
}
