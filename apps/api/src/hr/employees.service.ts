import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Employee, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { LookupService } from '../settings/lookup.service';
import { AuthenticatedUser } from '../auth/types/authenticated-user';
import { CreateEmployeeDto, ListEmployeesQueryDto, UpdateEmployeeDto } from './dto/employee.dto';

const SUBJECT_TABLE = 'employees';

/** Read shape returned by the API: `accountNo` masked to the last 4 digits. */
export type EmployeeView = Omit<Employee, 'accountNo'> & { accountNo: string | null };

/** Mask all but the last 4 characters of a bank account number (payroll privacy). */
export function maskAccountNo(accountNo: string | null): string | null {
  if (!accountNo) {
    return accountNo;
  }
  const last4 = accountNo.slice(-4);
  const hiddenLen = Math.max(accountNo.length - 4, 0);
  return `${'*'.repeat(hiddenLen)}${last4}`;
}

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookups: LookupService,
  ) {}

  // -------------------------------------------------------------------------
  // Reads
  // -------------------------------------------------------------------------

  /**
   * List employees. Finance/SysAdmin/Director see all (optionally filtered); a
   * SITE_MANAGER without a global role is restricted to sites they are assigned to.
   * Account numbers are masked and the read is audited.
   */
  async list(user: AuthenticatedUser, query: ListEmployeesQueryDto): Promise<EmployeeView[]> {
    const where: Prisma.EmployeeWhereInput = {};
    if (query.employmentType) {
      where.employmentType = query.employmentType;
    }

    const siteScope = this.siteScopeFor(user);
    if (siteScope) {
      // Site-scoped caller: intersect any requested site with their allowed sites.
      if (query.siteId && !siteScope.includes(query.siteId)) {
        throw new ForbiddenException('You may only view employees for your own site(s)');
      }
      where.siteId = query.siteId ? query.siteId : { in: siteScope };
    } else if (query.siteId) {
      where.siteId = query.siteId;
    }

    const employees = await this.prisma.employee.findMany({
      where,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });

    await this.audit.record({
      actorUserId: user.id,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: null,
      after: { event: 'employee_list_view', count: employees.length, filter: query },
    });

    return employees.map(toView);
  }

  /** Get one employee (masked + audited), enforcing site scope for site managers. */
  async findOne(user: AuthenticatedUser, id: string): Promise<EmployeeView> {
    const employee = await this.getOrThrow(id);
    this.assertCanAccessSite(user, employee.siteId);

    await this.audit.record({
      actorUserId: user.id,
      action: 'STATUS_CHANGE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      after: { event: 'employee_view' },
    });

    return toView(employee);
  }

  // -------------------------------------------------------------------------
  // Create / Update / Delete
  // -------------------------------------------------------------------------

  async create(dto: CreateEmployeeDto, actorId: string): Promise<EmployeeView> {
    await this.assertSiteExists(dto.siteId);
    await this.lookups.assertValid('employment_type', dto.employmentType);
    await this.lookups.assertValid('pay_mode', dto.payMode);
    this.assertPayModeConsistency(dto.payMode, dto.fixedUsdPct ?? null);

    if (dto.userId) {
      const linked = await this.prisma.user.findUnique({ where: { id: dto.userId } });
      if (!linked) {
        throw new BadRequestException('Linked user not found');
      }
    }

    const employee = await this.prisma.employee.create({
      data: {
        worksNo: dto.worksNo,
        firstName: dto.firstName,
        lastName: dto.lastName,
        nationalId: dto.nationalId ?? null,
        nssaNo: dto.nssaNo ?? null,
        grade: dto.grade ?? null,
        necClass: dto.necClass ?? null,
        occupation: dto.occupation ?? null,
        siteId: dto.siteId,
        employmentType: dto.employmentType,
        payMode: dto.payMode,
        fixedUsdPct: dto.fixedUsdPct ?? null,
        hourlyRate: dto.hourlyRate ?? null,
        bankName: dto.bankName ?? null,
        bankBranch: dto.bankBranch ?? null,
        accountNo: dto.accountNo ?? null,
        accountCurrency: dto.accountCurrency ?? null,
        leaveBalance: dto.leaveBalance ?? 0,
        startDate: dto.startDate,
        endDate: dto.endDate ?? null,
        userId: dto.userId ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: SUBJECT_TABLE,
      recordId: employee.id,
      after: { worksNo: employee.worksNo, siteId: employee.siteId },
    });

    return toView(employee);
  }

  async update(id: string, dto: UpdateEmployeeDto, actorId: string): Promise<EmployeeView> {
    const existing = await this.getOrThrow(id);

    if (dto.siteId) {
      await this.assertSiteExists(dto.siteId);
    }
    if (dto.employmentType !== undefined) {
      await this.lookups.assertValid('employment_type', dto.employmentType);
    }
    if (dto.payMode !== undefined) {
      await this.lookups.assertValid('pay_mode', dto.payMode);
    }
    const payMode = dto.payMode ?? existing.payMode;
    const fixedUsdPct =
      dto.fixedUsdPct !== undefined
        ? dto.fixedUsdPct
        : existing.fixedUsdPct != null
          ? existing.fixedUsdPct.toNumber()
          : null;
    this.assertPayModeConsistency(payMode, fixedUsdPct);

    if (dto.userId) {
      const linked = await this.prisma.user.findUnique({ where: { id: dto.userId } });
      if (!linked) {
        throw new BadRequestException('Linked user not found');
      }
    }

    const employee = await this.prisma.employee.update({
      where: { id },
      data: {
        worksNo: dto.worksNo,
        firstName: dto.firstName,
        lastName: dto.lastName,
        nationalId: dto.nationalId,
        nssaNo: dto.nssaNo,
        grade: dto.grade,
        necClass: dto.necClass,
        occupation: dto.occupation,
        siteId: dto.siteId,
        employmentType: dto.employmentType,
        payMode: dto.payMode,
        fixedUsdPct: dto.fixedUsdPct,
        hourlyRate: dto.hourlyRate,
        bankName: dto.bankName,
        bankBranch: dto.bankBranch,
        accountNo: dto.accountNo,
        accountCurrency: dto.accountCurrency,
        leaveBalance: dto.leaveBalance,
        startDate: dto.startDate,
        endDate: dto.endDate,
        userId: dto.userId,
        updatedBy: actorId,
      },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { worksNo: existing.worksNo, siteId: existing.siteId },
      after: { worksNo: employee.worksNo, siteId: employee.siteId },
    });

    return toView(employee);
  }

  async remove(id: string, actorId: string): Promise<{ id: string }> {
    const existing = await this.getOrThrow(id);
    await this.prisma.employee.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actorId,
      action: 'DELETE',
      tableName: SUBJECT_TABLE,
      recordId: id,
      before: { worksNo: existing.worksNo, siteId: existing.siteId },
    });
    return { id };
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private async getOrThrow(id: string): Promise<Employee> {
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) {
      throw new NotFoundException('Employee not found');
    }
    return employee;
  }

  private async assertSiteExists(siteId: string): Promise<void> {
    const site = await this.prisma.site.findUnique({ where: { id: siteId } });
    if (!site) {
      throw new BadRequestException('Site not found');
    }
  }

  /** FIXED_SPLIT requires a fixedUsdPct; CLIENT_RATIO must not carry one. */
  private assertPayModeConsistency(payMode: string, fixedUsdPct: number | null): void {
    if (payMode === 'FIXED_SPLIT' && (fixedUsdPct == null || Number.isNaN(fixedUsdPct))) {
      throw new BadRequestException('fixedUsdPct is required when payMode is FIXED_SPLIT');
    }
    if (payMode === 'CLIENT_RATIO' && fixedUsdPct != null) {
      throw new BadRequestException('fixedUsdPct must be omitted when payMode is CLIENT_RATIO');
    }
  }

  /**
   * The set of site ids a caller is restricted to, or null when they have an unscoped
   * (all-sites) role. Finance/SysAdmin/Director always see everything; a SITE_MANAGER is
   * limited to the sites their role is assigned to.
   */
  private siteScopeFor(user: AuthenticatedUser): string[] | null {
    const unscopedRoles: string[] = [
      'FINANCE_OFFICER',
      'FINANCE_DIRECTOR',
      'SYS_ADMIN',
      'DIRECTOR',
    ];
    const hasUnscoped = user.roles.some((r) => unscopedRoles.includes(r.role));
    if (hasUnscoped) {
      return null;
    }
    const siteIds = user.roles
      .filter((r) => r.role === 'SITE_MANAGER' && r.siteId !== null)
      .map((r) => r.siteId as string);
    return [...new Set(siteIds)];
  }

  private assertCanAccessSite(user: AuthenticatedUser, siteId: string): void {
    const scope = this.siteScopeFor(user);
    if (scope && !scope.includes(siteId)) {
      throw new ForbiddenException('You may only view employees for your own site(s)');
    }
  }
}

/** Map a raw Employee row to its masked read view. */
function toView(employee: Employee): EmployeeView {
  return { ...employee, accountNo: maskAccountNo(employee.accountNo) };
}
