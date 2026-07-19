import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { Result } from 'antd';
import { useAppSelector } from '../app/hooks';
import { hasAnyRole, type Role } from '../rbac/roles';

export function ProtectedRoute({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const user = useAppSelector((s) => s.auth.user);
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !hasAnyRole(user, roles)) {
    return <Result status="403" title="403" subTitle="You don't have access to this section." />;
  }
  return <>{children}</>;
}
