import { Injectable } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LookupService } from '../../settings/lookup.service';
import { CreateGeneralExpenseDto } from './dto/general-expense.dto';
import { CreateOverheadDto } from './dto/overhead.dto';

/** Non-order costs: general expenses and monthly overheads (feed the P&L and input VAT). */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookups: LookupService,
  ) {}

  listGeneral() {
    return this.prisma.generalExpense.findMany({ orderBy: { expenseDate: 'desc' } });
  }

  async createGeneral(dto: CreateGeneralExpenseDto, actorId: string) {
    await this.lookups.assertValid('currency', dto.currency);
    const row = await this.prisma.generalExpense.create({
      data: {
        amount: dto.amount,
        currency: dto.currency,
        vatClaimable: dto.vatClaimable,
        category: dto.category ?? null,
        expenseDate: dto.expenseDate,
        rateType: dto.rateType ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'general_expenses',
      recordId: row.id,
      after: { amount: row.amount.toString(), currency: row.currency, category: row.category },
    });
    return row;
  }

  listOverheads() {
    return this.prisma.overhead.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async createOverhead(dto: CreateOverheadDto, actorId: string) {
    await this.lookups.assertValid('currency', dto.currency);
    const row = await this.prisma.overhead.create({
      data: {
        amount: dto.amount,
        currency: dto.currency,
        category: dto.category ?? null,
        periodMonth: dto.periodMonth ?? null,
        rateType: dto.rateType ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'overheads',
      recordId: row.id,
      after: { amount: row.amount.toString(), currency: row.currency, category: row.category },
    });
    return row;
  }
}
