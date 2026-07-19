import { UserStatus } from '@prisma/client';

/** A single RBAC assignment. siteId null = applies across all sites. */
export interface SiteRole {
  siteId: string | null;
  role: string;
}

/**
 * The shape attached to `request.user` after JWT validation. Roles are loaded fresh
 * from the DB per request (not embedded in the token) so revocation takes effect
 * immediately — important for a finance system.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  status: UserStatus;
  roles: SiteRole[];
}

/** Access-token JWT payload — kept minimal; no roles/PII embedded. */
export interface AccessTokenPayload {
  sub: string;
  email: string;
}
