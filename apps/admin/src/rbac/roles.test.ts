import { describe, expect, it } from 'vitest';
import { hasAnyRole, type AuthUser } from './roles';

const user: AuthUser = {
  id: 'u1',
  email: 'fd@aes.local',
  status: 'ACTIVE',
  roles: [{ siteId: null, role: 'FINANCE_DIRECTOR' }],
};

describe('hasAnyRole', () => {
  it('is false for no user', () => {
    expect(hasAnyRole(null, ['SYS_ADMIN'])).toBe(false);
  });
  it('is true when no roles are required', () => {
    expect(hasAnyRole(user, [])).toBe(true);
  });
  it('matches a held role', () => {
    expect(hasAnyRole(user, ['FINANCE_DIRECTOR', 'SYS_ADMIN'])).toBe(true);
  });
  it('rejects a role the user lacks', () => {
    expect(hasAnyRole(user, ['SYS_ADMIN'])).toBe(false);
  });
});
