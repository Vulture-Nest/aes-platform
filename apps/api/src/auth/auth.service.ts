import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { TokenPair, TokenService } from './token.service';

/**
 * Local authentication: verifies email/password against the own user store (argon2),
 * issues the access + refresh token pair, and audits login/logout.
 */
@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  async login(email: string, password: string, correlationId?: string): Promise<TokenPair> {
    const user = await this.prisma.user.findUnique({ where: { email } });

    // Verify even when the user is missing/inactive to keep timing uniform, but still reject.
    const passwordOk = user
      ? await argon2.verify(user.passwordHash, password).catch(() => false)
      : await argon2
          .hash(password)
          .then(() => false)
          .catch(() => false);

    if (!user || user.status !== 'ACTIVE' || !passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const pair = await this.tokens.issuePair(user.id, user.email);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'LOGIN',
      tableName: 'users',
      recordId: user.id,
      correlationId,
    });
    return pair;
  }

  refresh(refreshToken: string): Promise<TokenPair> {
    return this.tokens.rotate(refreshToken);
  }

  async logout(refreshToken: string, actorUserId?: string, correlationId?: string): Promise<void> {
    await this.tokens.revoke(refreshToken);
    if (actorUserId) {
      await this.audit.record({
        actorUserId,
        action: 'LOGOUT',
        tableName: 'users',
        recordId: actorUserId,
        correlationId,
      });
    }
  }
}
