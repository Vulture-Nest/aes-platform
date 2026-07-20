import {
  AlertOutlined,
  ApartmentOutlined,
  AuditOutlined,
  BankOutlined,
  ContactsOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  DollarOutlined,
  DownloadOutlined,
  FileDoneOutlined,
  FundProjectionScreenOutlined,
  IdcardOutlined,
  LogoutOutlined,
  NodeIndexOutlined,
  PercentageOutlined,
  SettingOutlined,
  ShoppingOutlined,
  SlidersOutlined,
  TeamOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Layout, Menu, Typography } from 'antd';
import { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLogoutMutation } from '../api/api';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { loggedOut } from '../features/auth/authSlice';
import { hasAnyRole, type Role } from '../rbac/roles';
import { AES } from '../theme';
import logoWhite from '../assets/aes-logo-white.png';

interface NavItem {
  key: string;
  label: string;
  icon: ReactNode;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { key: '/', label: 'Dashboard', icon: <DashboardOutlined /> },
  { key: '/users', label: 'Users & Roles', icon: <TeamOutlined />, roles: ['SYS_ADMIN'] },
  { key: '/sites', label: 'Sites', icon: <BankOutlined />, roles: ['SYS_ADMIN'] },
  {
    key: '/exchange-rates',
    label: 'Exchange Rates',
    icon: <DollarOutlined />,
    roles: ['FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN'],
  },
  {
    key: '/statutory-rates',
    label: 'Statutory Rates',
    icon: <PercentageOutlined />,
    roles: ['FINANCE_DIRECTOR', 'SYS_ADMIN'],
  },
  {
    key: '/thresholds',
    label: 'Thresholds',
    icon: <SlidersOutlined />,
    roles: ['FINANCE_DIRECTOR', 'SYS_ADMIN'],
  },
  {
    key: '/delegation',
    label: 'Delegation',
    icon: <ApartmentOutlined />,
    roles: ['FINANCE_DIRECTOR', 'OPS_DIRECTOR', 'SYS_ADMIN'],
  },
  {
    key: '/approval-matrix',
    label: 'Approval Matrix',
    icon: <NodeIndexOutlined />,
    roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR'],
  },
  {
    key: '/danger-rules',
    label: 'Danger Rules',
    icon: <AlertOutlined />,
    roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR'],
  },
  {
    key: '/accounts',
    label: 'Ledger Accounts',
    icon: <WalletOutlined />,
    roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER'],
  },
  {
    key: '/employees',
    label: 'Employees',
    icon: <IdcardOutlined />,
    roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER'],
  },
  {
    key: '/clients',
    label: 'Clients',
    icon: <ContactsOutlined />,
    roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'AUDITOR'],
  },
  {
    key: '/contracts',
    label: 'Contracts',
    icon: <FileDoneOutlined />,
    roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'AUDITOR'],
  },
  {
    key: '/orders',
    label: 'Orders',
    icon: <ShoppingOutlined />,
    roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'AUDITOR'],
  },
  {
    key: '/expenses',
    label: 'Expenses',
    icon: <CreditCardOutlined />,
    roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'AUDITOR'],
  },
  {
    key: '/reports',
    label: 'Reports',
    icon: <DownloadOutlined />,
    roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'OPS_DIRECTOR', 'DIRECTOR', 'AUDITOR'],
  },
  {
    key: '/business-development',
    label: 'Business Dev',
    icon: <FundProjectionScreenOutlined />,
    roles: ['OPS_STAFF', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN', 'FINANCE_DIRECTOR', 'AUDITOR'],
  },
  { key: '/audit', label: 'Audit Log', icon: <AuditOutlined />, roles: ['SYS_ADMIN', 'AUDITOR'] },
  { key: '/settings', label: 'Settings', icon: <SettingOutlined />, roles: ['SYS_ADMIN'] },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const refreshToken = useAppSelector((s) => s.auth.refreshToken);
  const [logout] = useLogoutMutation();

  const items = NAV.filter((n) => hasAnyRole(user, n.roles ?? [])).map((n) => ({
    key: n.key,
    icon: n.icon,
    label: n.label,
  }));

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
              letterSpacing: 3,
              marginTop: 8,
              fontWeight: 600,
            }}
          >
            ADMIN CONSOLE
          </div>
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={items}
          onClick={({ key }) => navigate(key)}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header
          style={{ background: '#fff', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', paddingInline: 24 }}
        >
          <Dropdown
            menu={{
              items: [{ key: 'logout', icon: <LogoutOutlined />, label: 'Sign out', onClick: onLogout }],
            }}
          >
            <Button type="text">{user?.email}</Button>
          </Dropdown>
        </Layout.Header>
        <Layout.Content style={{ margin: 24 }}>
          <div style={{ background: '#fff', padding: 24, borderRadius: 8, minHeight: '100%' }}>
            {children}
          </div>
        </Layout.Content>
        <Layout.Footer style={{ textAlign: 'center' }}>
          <Typography.Text type="secondary">AES Operations &amp; Finance — Admin</Typography.Text>
        </Layout.Footer>
      </Layout>
    </Layout>
  );
}
