import {
  BellOutlined,
  CheckSquareOutlined,
  DashboardOutlined,
  DollarOutlined,
  FileTextOutlined,
  HomeOutlined,
  LogoutOutlined,
  ShoppingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Badge, Button, Dropdown, Layout, Menu } from 'antd';
import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLogoutMutation, useUnreadCountQuery } from '../api/api';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { loggedOut } from '../features/auth/authSlice';
import { hasAnyRole, type Role } from '../rbac/roles';
import { AES } from '../theme';
import logoWhite from '../assets/aes-logo-white.png';

// Business Health Command Centre is leadership-only (mirrors the API's @Roles).
const LEADERSHIP: Role[] = [
  'FINANCE_OFFICER',
  'FINANCE_DIRECTOR',
  'OPS_DIRECTOR',
  'DIRECTOR',
  'SYS_ADMIN',
];

const NAV: { key: string; label: string; icon: ReactNode; roles?: Role[] }[] = [
  { key: '/', label: 'Home', icon: <HomeOutlined /> },
  { key: '/requests', label: 'Requests', icon: <FileTextOutlined /> },
  { key: '/approvals', label: 'Approvals', icon: <CheckSquareOutlined /> },
  { key: '/my-orders', label: 'My Orders', icon: <ShoppingOutlined /> },
  { key: '/command-centre', label: 'Command Centre', icon: <DashboardOutlined />, roles: LEADERSHIP },
  { key: '/rates', label: 'Exchange Rates', icon: <DollarOutlined /> },
  { key: '/notifications', label: 'Notifications', icon: <BellOutlined /> },
  { key: '/profile', label: 'Profile', icon: <UserOutlined /> },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const refreshToken = useAppSelector((s) => s.auth.refreshToken);
  const [logout] = useLogoutMutation();
  const { data: unread } = useUnreadCountQuery();

  const onLogout = async () => {
    if (refreshToken) await logout({ refreshToken }).catch(() => undefined);
    dispatch(loggedOut());
    navigate('/login', { replace: true });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Sider breakpoint="lg" collapsedWidth="0" theme="dark">
        <div style={{ padding: '22px 16px 14px', textAlign: 'center' }}>
          <img
            src={logoWhite}
            alt="AES"
            style={{ height: 34, maxWidth: '78%', objectFit: 'contain' }}
          />
          <div
            style={{
              color: AES.green,
              fontSize: 10,
              letterSpacing: 2,
              marginTop: 8,
              fontWeight: 600,
            }}
          >
            OPERATIONS &amp; FINANCE
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          onClick={({ key }) => navigate(key)}
          items={NAV.filter((n) => hasAnyRole(user, n.roles ?? [])).map((n) => ({
            key: n.key,
            icon: n.icon,
            label: n.label,
          }))}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{ background: '#fff', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 16, paddingInline: 24 }}
        >
          <Badge count={unread?.count ?? 0} size="small">
            <Button type="text" icon={<BellOutlined />} onClick={() => navigate('/notifications')} />
          </Badge>
          <Dropdown
            menu={{
              items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Sign out', onClick: onLogout }],
            }}
          >
            <Button type="text" icon={<UserOutlined />}>
              {user?.email}
            </Button>
          </Dropdown>
        </Layout.Header>
        <Layout.Content style={{ margin: 24 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, minHeight: '100%' }}>
            {children}
          </div>
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
