import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../prisma/prisma.service';
import { RlsContext, scopeFromUser } from '../../rls/rls-context';
import { AccessTokenPayload, AuthenticatedUser } from '../types/authenticated-user';

/**
 * Validates the access JWT and loads the user's current roles from the DB on every
 * request (roles are NOT embedded in the token) so revocation/role changes take
 * effect immediately. Attaches an AuthenticatedUser to request.user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly rls: RlsContext,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('auth', { infer: true }).jwtSecret,
    });
  }

  async validate(payload: AccessTokenPayload): Promise<AuthenticatedUser> {
    // Runs during the guard phase, before the request scope is narrowed — this lookup
    // itself executes in the default bypass scope so any user can be validated.
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      include: { siteRoles: { select: { siteId: true, role: true } } },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User is inactive or no longer exists');
    }

    const authenticated: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      status: user.status,
      roles: user.siteRoles,
    };

    // Narrow the RLS scope for the remainder of this request to the user's site(s).
    this.rls.set(scopeFromUser(authenticated));
    return authenticated;
  }
}
