import { describe, expect, it } from 'vitest';
import { hasAnyRole, type AuthUser } from './roles';

const user: AuthUser = {
  id: 'u1',
  email: 'clerk@aes.local',
  status: 'ACTIVE',
  roles: [{ siteId: 's1', role: 'SITE_CLERK' }],
};

describe('hasAnyRole', () => {
  it('is false for no user', () => expect(hasAnyRole(null, ['SYS_ADMIN'])).toBe(false));
  it('is true when no roles required', () => expect(hasAnyRole(user, [])).toBe(true));
  it('matches a held role', () => expect(hasAnyRole(user, ['SITE_CLERK'])).toBe(true));
  it('rejects a missing role', () => expect(hasAnyRole(user, ['FINANCE_DIRECTOR'])).toBe(false));
});
