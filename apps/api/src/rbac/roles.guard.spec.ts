import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { RolesGuard } from './roles.guard';

function context(
  user: Partial<AuthenticatedUser> | undefined,
  method = 'GET',
  params: Record<string, string> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user, method, params }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const requireRoles = (roles: Role[] | undefined) =>
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);

  it('allows when no roles are required', () => {
    requireRoles(undefined);
    expect(guard.canActivate(context({ roles: [] }))).toBe(true);
  });

  it('allows a user holding a required global role', () => {
    requireRoles([Role.SYS_ADMIN]);
    const user = { roles: [{ siteId: null, role: Role.SYS_ADMIN }] };
    expect(guard.canActivate(context(user))).toBe(true);
  });

  it('denies a user missing the required role', () => {
    requireRoles([Role.SYS_ADMIN]);
    const user = { roles: [{ siteId: null, role: Role.SITE_CLERK }] };
    expect(() => guard.canActivate(context(user))).toThrow(ForbiddenException);
  });

  it('enforces per-site scoping', () => {
    requireRoles([Role.SITE_MANAGER]);
    const user = { roles: [{ siteId: 'site-A', role: Role.SITE_MANAGER }] };
    expect(guard.canActivate(context(user, 'GET', { siteId: 'site-A' }))).toBe(true);
    expect(() => guard.canActivate(context(user, 'GET', { siteId: 'site-B' }))).toThrow(
      ForbiddenException,
    );
  });

  it('treats a global assignment as valid for any site', () => {
    requireRoles([Role.FINANCE_DIRECTOR]);
    const user = { roles: [{ siteId: null, role: Role.FINANCE_DIRECTOR }] };
    expect(guard.canActivate(context(user, 'GET', { siteId: 'any-site' }))).toBe(true);
  });

  it('blocks AUDITOR from mutating requests but allows reads', () => {
    requireRoles([Role.AUDITOR]);
    const user = { roles: [{ siteId: null, role: Role.AUDITOR }] };
    expect(guard.canActivate(context(user, 'GET'))).toBe(true);
    expect(() => guard.canActivate(context(user, 'POST'))).toThrow(ForbiddenException);
  });
});
