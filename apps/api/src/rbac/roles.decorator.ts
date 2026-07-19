import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to users holding at least one of the given roles. Combine with a
 * `:siteId` route param to require the role to be scoped to that site (or a global role).
 * Roles are plain strings validated at runtime against the settings lookup catalog
 * (category 'role'); they are no longer a Prisma enum.
 */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);
