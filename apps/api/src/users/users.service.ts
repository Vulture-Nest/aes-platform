import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import * as argon2 from 'argon2';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, SiteRoleAssignmentDto } from './dto/create-user.dto';

/** Roles that must complete MFA (enforced at login from a later stage). */
const MFA_REQUIRED_ROLES = new Set<Role>([
  Role.FINANCE_DIRECTOR,
  Role.OPS_DIRECTOR,
  Role.DIRECTOR,
  Role.SYS_ADMIN,
]);

type UserWithRoles = Prisma.UserGetPayload<{ include: { siteRoles: true } }>;

/** Admin-provisioned identity management (no open self-signup). */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Never leak the password hash over the API. */
  private toDto(user: UserWithRoles) {
    const { passwordHash: _omit, ...rest } = user;
    return rest;
  }

  async create(dto: CreateUserDto, actorId: string) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const roles = dto.roles ?? [];
    const mfaRequired =
      Boolean(dto.mfaRequired) || roles.some((r) => MFA_REQUIRED_ROLES.has(r.role));
    const passwordHash = await argon2.hash(dto.password);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        mfaRequired,
        createdBy: actorId,
        siteRoles: {
          create: roles.map((r) => ({
            siteId: r.siteId ?? null,
            role: r.role,
            createdBy: actorId,
          })),
        },
      },
      include: { siteRoles: true },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'users',
      recordId: user.id,
      after: { email: user.email, roles },
    });
    return this.toDto(user);
  }

  async assignRole(userId: string, dto: SiteRoleAssignmentDto, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    try {
      await this.prisma.userSiteRole.create({
        data: { userId, siteId: dto.siteId ?? null, role: dto.role, createdBy: actorId },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('User already has this role for this site');
      }
      throw err;
    }

    if (MFA_REQUIRED_ROLES.has(dto.role) && !user.mfaRequired) {
      await this.prisma.user.update({ where: { id: userId }, data: { mfaRequired: true } });
    }

    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'user_site_roles',
      recordId: userId,
      after: { siteId: dto.siteId ?? null, role: dto.role },
    });
    return this.findOne(userId);
  }

  async list() {
    const users = await this.prisma.user.findMany({
      include: { siteRoles: true },
      orderBy: { createdAt: 'asc' },
    });
    return users.map((u: UserWithRoles) => this.toDto(u));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, include: { siteRoles: true } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toDto(user);
  }
}
