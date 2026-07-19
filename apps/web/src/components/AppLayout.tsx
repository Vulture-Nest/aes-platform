import {
  BellOutlined,
  CheckSquareOutlined,
  DollarOutlined,
  FileTextOutlined,
  HomeOutlined,
  LogoutOutlined,
  ShoppingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Badge, Button, Dropdown, Layout, Menu, Tooltip } from 'antd';
import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLogoutMutation, useUnreadCountQuery } from '../api/api';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { loggedOut } from '../features/auth/authSlice';

const NAV = [
  { key: '/', label: 'Home', icon: <HomeOutlined /> },
  { key: '/notifications', label: 'Notifications', icon: <BellOutlined /> },
  { key: '/rates', label: 'Exchange Rates', icon: <DollarOutlined /> },
  // Light up as their backend lands (S2–S5).
  { key: '/approvals', label: 'Approvals', icon: <CheckSquareOutlined />, disabled: true },
  { key: '/requests', label: 'Requests', icon: <FileTextOutlined />, disabled: true },
  { key: '/orders', label: 'Orders', icon: <ShoppingOutlined />, disabled: true },
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
        <div style={{ color: '#fff', padding: 16, fontWeight: 700, fontSize: 20 }}>AES</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          onClick={({ key }) => navigate(key)}
          items={NAV.map((n) => ({
            key: n.key,
            icon: n.icon,
            disabled: n.disabled,
            label: n.disabled ? (
              <Tooltip title="Coming soon">
                <span>{n.label}</span>
              </Tooltip>
            ) : (
              n.label
            ),
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
