import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ROLES_KEY } from './roles.decorator';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Self-managed authorization. Runs after JwtAuthGuard, so request.user is populated.
 *
 * - No @Roles() metadata → authenticated access is enough.
 * - Otherwise the user must hold one of the required roles. If the route carries a
 *   `siteId` param, the role must be assigned to that site OR be a global assignment
 *   (site_id NULL, e.g. SYS_ADMIN / AUDITOR).
 * - AUDITOR is read-only: it can never satisfy a mutating (non-GET) request.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user as AuthenticatedUser | undefined;
    if (!user) {
      throw new ForbiddenException('Not authenticated');
    }

    const siteId = (request.params?.siteId as string | undefined) ?? undefined;
    const isWrite = !READ_METHODS.has(request.method);

    const satisfied = user.roles.some((assignment) => {
      if (!required.includes(assignment.role)) {
        return false;
      }
      if (assignment.role === Role.AUDITOR && isWrite) {
        return false; // auditor is read-only
      }
      // Global assignment (site_id NULL) applies everywhere; otherwise must match the site.
      return assignment.siteId === null || !siteId || assignment.siteId === siteId;
    });

    if (!satisfied) {
      throw new ForbiddenException('Insufficient role for this action');
    }
    return true;
  }
}
