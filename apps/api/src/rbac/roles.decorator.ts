import { SetMetadata } from '@nestjs/common';
import { Role } from '@prisma/client';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to users holding at least one of the given roles. Combine with a
 * `:siteId` route param to require the role to be scoped to that site (or a global role).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
