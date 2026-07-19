import { Injectable } from '@nestjs/common';
import { Currency, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * One line to post to the ledger. Callers pass their own `sourceTable`/`sourceId` so
 * posting is idempotent-friendly: a caller can look up existing entries by its source ref
 * before posting to avoid double-posting.
 */
export interface LedgerPostEntry {
  accountId: string;
  debit?: number;
  credit?: number;
  currency: Currency;
  sourceTable?: string;
  sourceId?: string;
  entryDate?: Date;
  description?: string;
  createdBy?: string;
}

export interface AccountBalance {
  accountId: string;
  name: string;
  type: string;
  currency: Currency;
  balance: number;
}

export interface CashPosition {
  accounts: AccountBalance[];
  totals: Record<Currency, number>;
}

/**
 * Shared ledger foundation. Every workflow module posts money movements here and reads
 * cash position / funds availability from here.
 *
 * Balance convention (cash / bank / wallet accounts):
 *   balance = SUM(credit)  [inflows]  -  SUM(debit)  [outflows]
 * i.e. money received into the account is recorded as a CREDIT and money paid out is a
 * DEBIT. A positive balance means available funds.
 */
@Injectable()
export class LedgerService {
  constructor(private readonly prisma: PrismaService) {}

  private toNumber(value: Prisma.Decimal | number | null | undefined): number {
    if (value === null || value === undefined) {
      return 0;
    }
    return typeof value === 'number' ? value : value.toNumber();
  }

  /**
   * Create ledger_entries rows. Each entry's debit/credit default to 0. Callers pass their
   * own source ref for idempotency; this method does not dedupe on its own.
   */
  async post(entries: LedgerPostEntry[]) {
    if (entries.length === 0) {
      return [];
    }
    const now = new Date();
    const data: Prisma.LedgerEntryCreateManyInput[] = entries.map((e) => ({
      accountId: e.accountId,
      debit: new Prisma.Decimal(e.debit ?? 0),
      credit: new Prisma.Decimal(e.credit ?? 0),
      currency: e.currency,
      sourceTable: e.sourceTable ?? null,
      sourceId: e.sourceId ?? null,
      entryDate: e.entryDate ?? now,
      description: e.description ?? null,
      createdBy: e.createdBy ?? null,
    }));
    await this.prisma.ledgerEntry.createMany({ data });
    // Return the freshly-created rows so callers can reference their ids.
    return this.prisma.ledgerEntry.findMany({
      where: {
        accountId: { in: entries.map((e) => e.accountId) },
        createdAt: { gte: now },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Balance for a single account: SUM(credit) - SUM(debit) as a number.
   * Positive = funds available in (inflows exceed outflows).
   */
  async accountBalance(accountId: string): Promise<number> {
    const agg = await this.prisma.ledgerEntry.aggregate({
      where: { accountId },
      _sum: { credit: true, debit: true },
    });
    return this.toNumber(agg._sum.credit) - this.toNumber(agg._sum.debit);
  }

  /**
   * Per-account balances for every cash/bank/wallet account plus per-currency totals.
   */
  async cashPosition(): Promise<CashPosition> {
    const accounts = await this.prisma.account.findMany({ orderBy: { name: 'asc' } });
    const grouped = await this.prisma.ledgerEntry.groupBy({
      by: ['accountId'],
      _sum: { credit: true, debit: true },
    });
    const byAccount = new Map(
      grouped.map((g) => [g.accountId, this.toNumber(g._sum.credit) - this.toNumber(g._sum.debit)]),
    );

    const totals: Record<Currency, number> = { [Currency.USD]: 0, [Currency.ZWG]: 0 };
    const rows: AccountBalance[] = accounts.map((a) => {
      const balance = byAccount.get(a.id) ?? 0;
      totals[a.currency] += balance;
      return {
        accountId: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        balance,
      };
    });

    return { accounts: rows, totals };
  }

  /** True when the account balance covers `amount`. Never blocks approval — callers use */
  /** this only to choose READY_TO_PAY vs PENDING_FUNDS. */
  async fundsAvailable(accountId: string, amount: number): Promise<boolean> {
    const balance = await this.accountBalance(accountId);
    return balance >= amount;
  }

  /** List ledger entries, optionally filtered by account, newest first. */
  listEntries(accountId?: string) {
    return this.prisma.ledgerEntry.findMany({
      where: accountId ? { accountId } : undefined,
      orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
    });
  }
}
