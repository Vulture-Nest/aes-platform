import { BoardVisibility } from '@prisma/client';
import {
  canSeeConfidential,
  isDirector,
  isDirectorRole,
  isSysAdmin,
} from './confidentiality';

const TEAM = { visibility: BoardVisibility.TEAM };
const CONF = { visibility: BoardVisibility.DIRECTOR_CONFIDENTIAL };

describe('isDirectorRole', () => {
  it('matches any *_DIRECTOR role', () => {
    expect(isDirectorRole('FINANCE_DIRECTOR')).toBe(true);
    expect(isDirectorRole('OPS_DIRECTOR')).toBe(true);
    expect(isDirectorRole('DIRECTOR')).toBe(false); // does not end in _DIRECTOR
  });
  it('rejects non-director roles', () => {
    expect(isDirectorRole('SYS_ADMIN')).toBe(false);
    expect(isDirectorRole('OPS_STAFF')).toBe(false);
    expect(isDirectorRole('SITE_MANAGER')).toBe(false);
  });
});

describe('isDirector / isSysAdmin', () => {
  it('detects a director among mixed roles', () => {
    expect(isDirector(['OPS_STAFF', 'FINANCE_DIRECTOR'])).toBe(true);
    expect(isDirector(['OPS_STAFF', 'SYS_ADMIN'])).toBe(false);
    expect(isDirector([])).toBe(false);
  });
  it('detects sys admin', () => {
    expect(isSysAdmin(['SYS_ADMIN'])).toBe(true);
    expect(isSysAdmin(['FINANCE_DIRECTOR'])).toBe(false);
  });
});

describe('canSeeConfidential — THE security predicate', () => {
  it('TEAM boards are visible to everyone (governed by route roles)', () => {
    expect(canSeeConfidential([], TEAM, [], 'u1')).toBe(true);
    expect(canSeeConfidential(['OPS_STAFF'], TEAM, [], 'u1')).toBe(true);
  });

  it('confidential board is INVISIBLE to a non-director', () => {
    expect(canSeeConfidential(['OPS_STAFF'], CONF, [], 'u1')).toBe(false);
    expect(canSeeConfidential(['SITE_MANAGER', 'OPS_STAFF'], CONF, [], 'u1')).toBe(false);
  });

  it('confidential board is INVISIBLE to a SYS_ADMIN who is not a director', () => {
    expect(canSeeConfidential(['SYS_ADMIN'], CONF, [], 'admin')).toBe(false);
  });

  it('confidential board with no members is visible to ANY director', () => {
    expect(canSeeConfidential(['FINANCE_DIRECTOR'], CONF, [], 'd1')).toBe(true);
    expect(canSeeConfidential(['OPS_DIRECTOR'], CONF, [], 'd2')).toBe(true);
  });

  it('member-restricted confidential board is visible ONLY to named directors', () => {
    const members = [{ userId: 'd1' }, { userId: 'd2' }];
    expect(canSeeConfidential(['FINANCE_DIRECTOR'], CONF, members, 'd1')).toBe(true);
    expect(canSeeConfidential(['OPS_DIRECTOR'], CONF, members, 'd2')).toBe(true);
    // a director NOT named as a member is excluded
    expect(canSeeConfidential(['OPS_DIRECTOR'], CONF, members, 'd3')).toBe(false);
  });

  it('member-restricted board still excludes non-directors even if listed', () => {
    const members = [{ userId: 'staff1' }];
    expect(canSeeConfidential(['OPS_STAFF'], CONF, members, 'staff1')).toBe(false);
  });

  it('a member-restricted board without a userId cannot be seen', () => {
    const members = [{ userId: 'd1' }];
    expect(canSeeConfidential(['FINANCE_DIRECTOR'], CONF, members)).toBe(false);
  });
});
