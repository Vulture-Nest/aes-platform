import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { LookupValue, Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';

export interface LookupInput {
  category: string;
  code: string;
  label: string;
  sortOrder?: number;
  active?: boolean;
  metadata?: Record<string, unknown>;
}

/** The known setting categories the admin can manage. */
export const LOOKUP_CATEGORIES = [
  'currency',
  'currency_pair',
  'site_type',
  'account_type',
  'statutory_key',
  'threshold_key',
  'employment_type',
  'pay_mode',
  'role',
] as const;

type SeedRow = { code: string; label: string; metadata?: Record<string, unknown> };

/** Default catalog seeded on boot (idempotent — only missing (category, code) pairs are added). */
const DEFAULTS: Record<string, SeedRow[]> = {
  currency: [
    { code: 'USD', label: 'US Dollar' },
    { code: 'ZWG', label: 'Zimbabwe Gold' },
  ],
  currency_pair: [{ code: 'USD/ZWG', label: 'USD → ZWG', metadata: { base: 'USD', quote: 'ZWG' } }],
  site_type: [
    { code: 'MINE_SITE', label: 'Mine site', metadata: { isMineSite: true } },
    { code: 'HEAD_OFFICE', label: 'Head office', metadata: { isMineSite: false } },
  ],
  account_type: [
    { code: 'BANK', label: 'Bank' },
    { code: 'PETTY_CASH', label: 'Petty cash' },
    { code: 'MOBILE_WALLET', label: 'Mobile wallet' },
  ],
  statutory_key: [
    { code: 'vat_pct', label: 'VAT %' },
    { code: 'zimra_interest_pct', label: 'ZIMRA interest % p.a.' },
    { code: 'aids_levy_pct', label: 'AIDS levy % (of PAYE)' },
    { code: 'zimdef_pct', label: 'ZIMDEF %' },
    { code: 'nssa_ee_pct', label: 'NSSA employee %' },
    { code: 'nssa_er_pct', label: 'NSSA employer %' },
    { code: 'nssa_ceiling', label: 'NSSA insurable ceiling' },
    { code: 'paye_bands', label: 'PAYE bands (JSON, per currency)' },
    { code: 'nec_pct', label: 'NEC %' },
    { code: 'mipf_pct', label: 'MIPF %' },
  ],
  threshold_key: [
    { code: 'petty_cash_fd_threshold', label: 'Petty-cash FD threshold' },
    { code: 'sla_reminder_hours', label: 'SLA reminder (hours)' },
    { code: 'sla_escalation_hours', label: 'SLA escalation (hours)' },
    { code: 'danger_cash_runway_weeks', label: 'Danger: cash runway (weeks)' },
    { code: 'coverage_ratio_watch', label: 'Coverage ratio watch' },
    { code: 'coverage_ratio_danger', label: 'Coverage ratio danger' },
  ],
  employment_type: [
    { code: 'PERMANENT', label: 'Permanent' },
    { code: 'CONTRACT', label: 'Contract' },
    { code: 'CASUAL', label: 'Casual' },
  ],
  pay_mode: [
    { code: 'CLIENT_RATIO', label: 'Client ratio', metadata: { splitMode: 'client_ratio' } },
    { code: 'FIXED_SPLIT', label: 'Fixed split', metadata: { splitMode: 'fixed' } },
  ],
  role: [
    { code: 'SITE_CLERK', label: 'Site Clerk' },
    { code: 'SITE_MANAGER', label: 'Site Manager' },
    { code: 'OPS_STAFF', label: 'Operations Staff' },
    { code: 'FINANCE_OFFICER', label: 'Finance Officer' },
    { code: 'FINANCE_DIRECTOR', label: 'Finance Director' },
    { code: 'OPS_DIRECTOR', label: 'Operations Director' },
    { code: 'DIRECTOR', label: 'Director' },
    { code: 'SYS_ADMIN', label: 'System Administrator' },
    { code: 'AUDITOR', label: 'Auditor (read-only)' },
  ],
};

@Injectable()
export class LookupService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedDefaults();
  }

  async seedDefaults(): Promise<void> {
    for (const [category, rows] of Object.entries(DEFAULTS)) {
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const exists = await this.prisma.lookupValue.findUnique({
          where: { category_code: { category, code: row.code } },
        });
        if (!exists) {
          await this.prisma.lookupValue.create({
            data: {
              category,
              code: row.code,
              label: row.label,
              sortOrder: i,
              metadata: { system: true, ...(row.metadata ?? {}) },
            },
          });
        }
      }
    }
  }

  list(category?: string): Promise<LookupValue[]> {
    return this.prisma.lookupValue.findMany({
      where: category ? { category } : undefined,
      orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  values(category: string): Promise<LookupValue[]> {
    return this.prisma.lookupValue.findMany({
      where: { category, active: true },
      orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    });
  }

  /** True if `code` is an active value in `category` (used by services to validate inputs). */
  async isValid(category: string, code: string): Promise<boolean> {
    const row = await this.prisma.lookupValue.findUnique({
      where: { category_code: { category, code } },
    });
    return Boolean(row?.active);
  }

  async assertValid(category: string, code: string): Promise<void> {
    if (!(await this.isValid(category, code))) {
      throw new BadRequestException(`"${code}" is not a configured ${category} value`);
    }
  }

  async create(input: LookupInput, actorId: string): Promise<LookupValue> {
    try {
      const created = await this.prisma.lookupValue.create({
        data: {
          category: input.category,
          code: input.code,
          label: input.label,
          sortOrder: input.sortOrder ?? 0,
          active: input.active ?? true,
          metadata: (input.metadata as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          createdBy: actorId,
        },
      });
      await this.audit.record({
        actorUserId: actorId,
        action: 'CREATE',
        tableName: 'lookup_values',
        recordId: created.id,
        after: { category: input.category, code: input.code },
      });
      return created;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException(`"${input.code}" already exists in ${input.category}`);
      }
      throw err;
    }
  }

  async update(
    id: string,
    changes: Partial<Pick<LookupInput, 'label' | 'sortOrder' | 'active' | 'metadata'>>,
    actorId: string,
  ): Promise<LookupValue> {
    const existing = await this.prisma.lookupValue.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Lookup value not found');
    }
    const updated = await this.prisma.lookupValue.update({
      where: { id },
      data: {
        label: changes.label ?? undefined,
        sortOrder: changes.sortOrder ?? undefined,
        active: changes.active ?? undefined,
        metadata:
          changes.metadata !== undefined ? (changes.metadata as Prisma.InputJsonValue) : undefined,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'lookup_values',
      recordId: id,
      after: { active: updated.active, label: updated.label },
    });
    return updated;
  }

  async remove(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.lookupValue.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Lookup value not found');
    }
    // Soft-guard system values: deactivate rather than delete.
    const isSystem =
      existing.metadata && typeof existing.metadata === 'object'
        ? (existing.metadata as Record<string, unknown>).system === true
        : false;
    if (isSystem) {
      throw new BadRequestException('System values cannot be deleted; disable them instead');
    }
    await this.prisma.lookupValue.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actorId,
      action: 'DELETE',
      tableName: 'lookup_values',
      recordId: id,
      before: { category: existing.category, code: existing.code },
    });
  }
}
