import {
  AlertOutlined,
  ApartmentOutlined,
  AuditOutlined,
  BankOutlined,
  CalendarOutlined,
  CarOutlined,
  CheckSquareOutlined,
  ClockCircleOutlined,
  ContactsOutlined,
  CreditCardOutlined,
  DashboardOutlined,
  DeploymentUnitOutlined,
  DollarOutlined,
  DownloadOutlined,
  ExportOutlined,
  FileDoneOutlined,
  FundProjectionScreenOutlined,
  IdcardOutlined,
  ImportOutlined,
  LogoutOutlined,
  MoneyCollectOutlined,
  NodeIndexOutlined,
  NotificationOutlined,
  PercentageOutlined,
  PieChartOutlined,
  ProfileOutlined,
  ProjectOutlined,
  ReconciliationOutlined,
  RiseOutlined,
  SolutionOutlined,
  SettingOutlined,
  ShopOutlined,
  ShoppingOutlined,
  SlidersOutlined,
  SnippetsOutlined,
  TableOutlined,
  TeamOutlined,
  ToolOutlined,
  WalletOutlined,
} from '@ant-design/icons';
import { Button, Dropdown, Layout, Menu, Typography } from 'antd';
import { ReactNode, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLogoutMutation } from '../api/api';
import { useAppDispatch, useAppSelector } from '../app/hooks';
import { loggedOut } from '../features/auth/authSlice';
import { hasAnyRole, type Role } from '../rbac/roles';
import { AES } from '../theme';
import logoWhite from '../assets/aes-logo-white.png';

interface NavLeaf {
  key: string;
  label: string;
  icon: ReactNode;
  roles?: Role[];
}
interface NavGroup {
  key: string;
  label: string;
  icon: ReactNode;
  children: NavLeaf[];
}
type NavNode = NavLeaf | NavGroup;

const isGroup = (n: NavNode): n is NavGroup => 'children' in n;

const FINANCE_VIEW: Role[] = ['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'AUDITOR'];
const ALL_STAFF: Role[] = [
  'SITE_CLERK',
  'SITE_MANAGER',
  'OPS_STAFF',
  'OPS_DIRECTOR',
  'FINANCE_OFFICER',
  'FINANCE_DIRECTOR',
  'DIRECTOR',
  'SYS_ADMIN',
  'AUDITOR',
];

// Two quick-access items stay top-level; everything else is grouped into collapsible
// submenus. A group is only shown when the user can see at least one of its children.
const NAV: NavNode[] = [
  { key: '/', label: 'Dashboard', icon: <DashboardOutlined /> },
  { key: '/approvals', label: 'My Approvals', icon: <CheckSquareOutlined /> },
  {
    key: 'grp:sales',
    label: 'Sales & CRM',
    icon: <ShopOutlined />,
    children: [
      { key: '/clients', label: 'Clients', icon: <ContactsOutlined />, roles: FINANCE_VIEW },
      { key: '/contracts', label: 'Contracts', icon: <FileDoneOutlined />, roles: FINANCE_VIEW },
      { key: '/orders', label: 'Orders', icon: <ShoppingOutlined />, roles: FINANCE_VIEW },
      {
        key: '/business-development',
        label: 'Business Dev',
        icon: <FundProjectionScreenOutlined />,
        roles: ['OPS_STAFF', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN', 'FINANCE_DIRECTOR', 'AUDITOR'],
      },
    ],
  },
  {
    key: 'grp:growth',
    label: 'Growth',
    icon: <RiseOutlined />,
    children: [
      {
        key: '/marketing',
        label: 'Marketing',
        icon: <NotificationOutlined />,
        roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR', 'OPS_DIRECTOR'],
      },
      { key: '/boards', label: 'Boards', icon: <TableOutlined />, roles: ALL_STAFF },
      {
        key: '/projects',
        label: 'Projects',
        icon: <ProjectOutlined />,
        roles: ['SITE_MANAGER', 'OPS_DIRECTOR', 'FINANCE_DIRECTOR', 'SYS_ADMIN'],
      },
    ],
  },
  {
    key: 'grp:finance',
    label: 'Finance',
    icon: <DollarOutlined />,
    children: [
      { key: '/expenses', label: 'Expenses', icon: <CreditCardOutlined />, roles: FINANCE_VIEW },
      {
        key: '/accounts',
        label: 'Ledger Accounts',
        icon: <WalletOutlined />,
        roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER'],
      },
      {
        key: '/reports',
        label: 'Reports',
        icon: <DownloadOutlined />,
        roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'OPS_DIRECTOR', 'DIRECTOR', 'AUDITOR'],
      },
      {
        key: '/returns-hub',
        label: 'Returns Hub',
        icon: <ReconciliationOutlined />,
        roles: ['FINANCE_DIRECTOR', 'FINANCE_OFFICER', 'SYS_ADMIN'],
      },
      {
        key: '/payroll-adjustments',
        label: 'Payroll Adjustments',
        icon: <SnippetsOutlined />,
        roles: ['FINANCE_DIRECTOR', 'SYS_ADMIN'],
      },
    ],
  },
  {
    key: 'grp:operations',
    label: 'Operations',
    icon: <DeploymentUnitOutlined />,
    children: [
      {
        key: '/site-reports',
        label: 'Site Reports',
        icon: <ReconciliationOutlined />,
        roles: ['OPS_DIRECTOR', 'SITE_MANAGER', 'SYS_ADMIN'],
      },
    ],
  },
  {
    key: 'grp:workflows',
    label: 'Workflows',
    icon: <DeploymentUnitOutlined />,
    children: [
      { key: '/requisitions', label: 'Requisitions', icon: <ProfileOutlined />, roles: ALL_STAFF },
      { key: '/travel', label: 'Travel', icon: <CarOutlined />, roles: ALL_STAFF },
      { key: '/petty-cash', label: 'Petty Cash', icon: <MoneyCollectOutlined />, roles: ALL_STAFF },
      {
        key: '/budgets',
        label: 'Budgets',
        icon: <PieChartOutlined />,
        roles: ['FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'OPS_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN', 'AUDITOR'],
      },
      {
        key: '/director-withdrawals',
        label: 'Dir. Withdrawals',
        icon: <ExportOutlined />,
        roles: ['DIRECTOR', 'SYS_ADMIN', 'AUDITOR'],
      },
    ],
  },
  {
    key: 'grp:people',
    label: 'People & Payroll',
    icon: <TeamOutlined />,
    children: [
      {
        key: '/employees',
        label: 'Employees',
        icon: <IdcardOutlined />,
        roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER'],
      },
      { key: '/timesheets', label: 'Timesheets', icon: <ClockCircleOutlined />, roles: ALL_STAFF },
      {
        key: '/payroll',
        label: 'Payroll',
        icon: <SolutionOutlined />,
        roles: ['FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN'],
      },
      {
        key: '/compliance-calendar',
        label: 'Compliance Calendar',
        icon: <CalendarOutlined />,
        roles: ['FINANCE_OFFICER', 'FINANCE_DIRECTOR', 'DIRECTOR', 'SYS_ADMIN', 'AUDITOR'],
      },
    ],
  },
  {
    key: 'grp:config',
    label: 'Configuration',
    icon: <ToolOutlined />,
    children: [
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
      { key: '/users', label: 'Users & Roles', icon: <TeamOutlined />, roles: ['SYS_ADMIN'] },
      { key: '/sites', label: 'Sites', icon: <BankOutlined />, roles: ['SYS_ADMIN'] },
      { key: '/entities', label: 'Entities', icon: <ApartmentOutlined />, roles: ['SYS_ADMIN'] },
      {
        key: '/data-import',
        label: 'Data Import',
        icon: <ImportOutlined />,
        roles: ['SYS_ADMIN', 'FINANCE_DIRECTOR'],
      },
      { key: '/audit', label: 'Audit Log', icon: <AuditOutlined />, roles: ['SYS_ADMIN', 'AUDITOR'] },
      { key: '/settings', label: 'Settings', icon: <SettingOutlined />, roles: ['SYS_ADMIN'] },
    ],
  },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((s) => s.auth.user);
  const refreshToken = useAppSelector((s) => s.auth.refreshToken);
  const [logout] = useLogoutMutation();

  const leaf = (n: NavLeaf) => ({ key: n.key, icon: n.icon, label: n.label });

  // Build the menu: leaves the user can see, and groups that still have ≥1 visible child.
  const items = NAV.flatMap((n) => {
    if (!isGroup(n)) {
      return hasAnyRole(user, n.roles ?? []) ? [leaf(n)] : [];
    }
    const visible = n.children.filter((c) => hasAnyRole(user, c.roles ?? []));
    return visible.length > 0
      ? [{ key: n.key, icon: n.icon, label: n.label, children: visible.map(leaf) }]
      : [];
  });

  // Keep the group that owns the current route expanded (users can still toggle others).
  const activeGroup = useMemo(
    () =>
      NAV.find(
        (n): n is NavGroup => isGroup(n) && n.children.some((c) => c.key === location.pathname),
      )?.key,
    [location.pathname],
  );
  const [openKeys, setOpenKeys] = useState<string[]>(activeGroup ? [activeGroup] : []);
  useEffect(() => {
    if (activeGroup && !openKeys.includes(activeGroup)) {
      setOpenKeys((keys) => [...keys, activeGroup]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeGroup]);

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
          openKeys={openKeys}
          onOpenChange={(keys) => setOpenKeys(keys)}
          items={items}
          onClick={({ key }) => {
            if (!key.startsWith('grp:')) navigate(key);
          }}
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
