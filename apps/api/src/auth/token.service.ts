import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenPayload } from './types/authenticated-user';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Issues stateless access JWTs and opaque, revocable refresh tokens.
 *
 * Refresh tokens are high-entropy random strings; only their SHA-256 hash is stored,
 * so a DB leak does not expose usable tokens, yet we can still look them up. Rotation
 * revokes the old token and links it to its successor for reuse detection.
 */
@Injectable()
export class TokenService {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private get auth() {
    return this.config.get('auth', { infer: true });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  signAccessToken(userId: string, email: string): string {
    const payload: AccessTokenPayload = { sub: userId, email };
    return this.jwt.sign(payload, { expiresIn: this.auth.accessTtl });
  }

  /** Creates and persists a new refresh token, returning the raw value (shown once). */
  async issueRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.auth.refreshTtl * 1000);
    await this.prisma.refreshToken.create({
      data: { userId, tokenHash: this.hash(raw), expiresAt },
    });
    return raw;
  }

  async issuePair(userId: string, email: string): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      Promise.resolve(this.signAccessToken(userId, email)),
      this.issueRefreshToken(userId),
    ]);
    return { accessToken, refreshToken, expiresIn: this.auth.accessTtl };
  }

  /**
   * Rotates a refresh token: validates it, revokes it, and issues a fresh pair.
   * If a already-revoked token is presented (reuse), every token for that user is
   * revoked — a stolen-token signal.
   */
  async rotate(rawRefreshToken: string): Promise<TokenPair> {
    const tokenHash = this.hash(rawRefreshToken);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
      include: { user: true },
    });

    if (!existing) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (existing.revokedAt) {
      // Reuse of a revoked token → revoke the whole family.
      await this.prisma.refreshToken.updateMany({
        where: { userId: existing.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedException('Refresh token reuse detected');
    }
    if (existing.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired');
    }
    if (existing.user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is inactive');
    }

    const pair = await this.issuePair(existing.userId, existing.user.email);
    const successor = await this.prisma.refreshToken.findFirst({
      where: { tokenHash: this.hash(pair.refreshToken) },
      select: { id: true },
    });
    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedBy: successor?.id ?? null },
    });
    return pair;
  }

  /** Revokes a single refresh token (logout). Idempotent. */
  async revoke(rawRefreshToken: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: this.hash(rawRefreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
