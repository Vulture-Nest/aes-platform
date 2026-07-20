import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { LookupService } from '../settings/lookup.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookups: LookupService,
  ) {}

  list() {
    return this.prisma.account.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return account;
  }

  async create(dto: CreateAccountDto, actorId: string) {
    await this.lookups.assertValid('account_type', dto.type);
    await this.lookups.assertValid('currency', dto.currency);
    const account = await this.prisma.account.create({
      data: { ...dto, createdBy: actorId, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'accounts',
      recordId: account.id,
      after: {
        name: account.name,
        type: account.type,
        currency: account.currency,
        siteId: account.siteId,
      },
    });
    return account;
  }

  async update(id: string, dto: UpdateAccountDto, actorId: string) {
    const before = await this.findOne(id);
    if (dto.type) await this.lookups.assertValid('account_type', dto.type);
    if (dto.currency) await this.lookups.assertValid('currency', dto.currency);
    const account = await this.prisma.account.update({
      where: { id },
      data: { ...dto, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'accounts',
      recordId: id,
      before: { name: before.name, type: before.type, currency: before.currency },
      after: { name: account.name, type: account.type, currency: account.currency },
    });
    return account;
  }

  /**
   * Idempotently ensure the standard head-office + per-site default accounts exist.
   * Safe to call from a bootstrap or seed helper repeatedly.
   */
  async ensureDefaults(siteIds: string[] = []): Promise<void> {
    const wanted: Array<{
      name: string;
      type: string;
      currency: string;
      siteId: string | null;
    }> = [
      { name: 'Bank USD', type: 'BANK', currency: 'USD', siteId: null },
      { name: 'Bank ZWG', type: 'BANK', currency: 'ZWG', siteId: null },
    ];
    for (const siteId of siteIds) {
      wanted.push({
        name: `Petty Cash (${siteId})`,
        type: 'PETTY_CASH',
        currency: 'USD',
        siteId,
      });
    }
    for (const acc of wanted) {
      const existing = await this.prisma.account.findFirst({
        where: { name: acc.name, currency: acc.currency, siteId: acc.siteId },
      });
      if (!existing) {
        await this.prisma.account.create({ data: acc });
      }
    }
  }
}
