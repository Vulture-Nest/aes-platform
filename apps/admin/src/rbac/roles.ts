// Mirrors the API's Role enum (self-managed RBAC). The API enforces these server-side;
// the admin UI hides what the caller cannot do.
export type Role =
  | 'SITE_CLERK'
  | 'SITE_MANAGER'
  | 'OPS_STAFF'
  | 'FINANCE_OFFICER'
  | 'FINANCE_DIRECTOR'
  | 'OPS_DIRECTOR'
  | 'DIRECTOR'
  | 'SYS_ADMIN'
  | 'AUDITOR';

export const ROLE_LABELS: Record<Role, string> = {
  SITE_CLERK: 'Site Clerk',
  SITE_MANAGER: 'Site Manager',
  OPS_STAFF: 'Operations Staff',
  FINANCE_OFFICER: 'Finance Officer',
  FINANCE_DIRECTOR: 'Finance Director',
  OPS_DIRECTOR: 'Operations Director',
  DIRECTOR: 'Director',
  SYS_ADMIN: 'System Administrator',
  AUDITOR: 'Auditor (read-only)',
};

export const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];

export interface SiteRole {
  siteId: string | null;
  role: Role;
}

export interface AuthUser {
  id: string;
  email: string;
  status: string;
  roles: SiteRole[];
}

/** True if the user holds any of the given roles (site scope is enforced by the API). */
export function hasAnyRole(user: AuthUser | null, roles: Role[]): boolean {
  if (!user) return false;
  if (roles.length === 0) return true;
  return user.roles.some((assignment) => roles.includes(assignment.role));
}
