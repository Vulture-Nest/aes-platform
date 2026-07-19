import { UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';

jest.mock('argon2');

describe('AuthService', () => {
  const prisma = { user: { findUnique: jest.fn(), update: jest.fn() } };
  const tokens = { issuePair: jest.fn() };
  const audit = { record: jest.fn() };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    service = new AuthService(prisma as any, tokens as any, audit as any);
  });

  it('issues tokens and audits LOGIN for valid credentials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      status: 'ACTIVE',
      passwordHash: 'hash',
    });
    (argon2.verify as jest.Mock).mockResolvedValue(true);
    tokens.issuePair.mockResolvedValue({ accessToken: 'at', refreshToken: 'rt', expiresIn: 900 });
    prisma.user.update.mockResolvedValue({});

    const result = await service.login('a@b.c', 'pw');

    expect(result.accessToken).toBe('at');
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u1' } }),
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'LOGIN' }));
  });

  it('rejects an invalid password', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      status: 'ACTIVE',
      passwordHash: 'hash',
    });
    (argon2.verify as jest.Mock).mockResolvedValue(false);

    await expect(service.login('a@b.c', 'bad')).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokens.issuePair).not.toHaveBeenCalled();
  });

  it('rejects an unknown user without leaking existence', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    (argon2.hash as jest.Mock).mockResolvedValue('x');

    await expect(service.login('nobody@aes.local', 'pw')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a disabled user', async () => {
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'a@b.c',
      status: 'DISABLED',
      passwordHash: 'hash',
    });
    (argon2.verify as jest.Mock).mockResolvedValue(true);

    await expect(service.login('a@b.c', 'pw')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
