import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Account, Prisma } from '@prisma/client';
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
  currency: string;
  sourceTable?: string;
  sourceId?: string;
  entryDate?: Date;
  description?: string;
  createdBy?: string;
}

/** Options for a balanced journal — shared metadata applied to every leg that omits its own. */
export interface JournalOptions {
  sourceTable?: string;
  sourceId?: string;
  entryDate?: Date;
  createdBy?: string;
}

/**
 * Account types that hold real cash and count toward the cash position. Contra/control
 * accounts (RECEIVABLE, REVENUE, PAYABLE, DRAWINGS, TAX_PAYABLE, LOAN_PAYABLE) are excluded so
 * posting the balancing leg of a journal never moves the cash figure.
 */
export const CASH_TYPES = ['BANK', 'PETTY_CASH', 'WALLET', 'MOBILE_MONEY', 'MOBILE_WALLET'];

/** Tolerance (in currency units) for the double-entry balance invariant. */
const BALANCE_TOLERANCE = 0.01;

export interface AccountBalance {
  accountId: string;
  name: string;
  type: string;
  currency: string;
  balance: number;
}

export interface CashPosition {
  accounts: AccountBalance[];
  totals: Record<string, number>;
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
   *
   * `txnId` (when supplied) groups the rows as one journal. `post()` itself does NOT enforce
   * the double-entry balance invariant — it is the low-level writer used internally and by
   * postJournal(). Callers that must balance use postJournal().
   */
  async post(entries: LedgerPostEntry[], txnId?: string) {
    if (entries.length === 0) {
      return [];
    }
    const now = new Date();
    const data: Prisma.LedgerEntryCreateManyInput[] = entries.map((e) => ({
      accountId: e.accountId,
      txnId: txnId ?? null,
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
   * Post a BALANCED double-entry journal: assigns one shared `txnId` to every leg and enforces
   * Σdebit == Σcredit per currency (within {@link BALANCE_TOLERANCE}). Throws
   * BadRequestException if the set does not balance. This is the posting path every money
   * movement should use so the ledger stays a genuine double-entry system.
   *
   * `opts` supplies shared source ref / entryDate / createdBy applied to any leg that omits its
   * own. Returns the created rows plus the assigned `txnId`.
   */
  async postJournal(lines: LedgerPostEntry[], opts: JournalOptions = {}) {
    if (lines.length === 0) {
      return { txnId: null as string | null, rows: [] as Prisma.LedgerEntryGetPayload<object>[] };
    }

    // Enforce the double-entry invariant per currency.
    const perCurrency = new Map<string, { debit: number; credit: number }>();
    for (const line of lines) {
      const bucket = perCurrency.get(line.currency) ?? { debit: 0, credit: 0 };
      bucket.debit += line.debit ?? 0;
      bucket.credit += line.credit ?? 0;
      perCurrency.set(line.currency, bucket);
    }
    for (const [currency, { debit, credit }] of perCurrency) {
      if (Math.abs(debit - credit) > BALANCE_TOLERANCE) {
        throw new BadRequestException(
          `Unbalanced ledger journal for ${currency}: debit ${debit} != credit ${credit}`,
        );
      }
    }

    const txnId = randomUUID();
    const merged: LedgerPostEntry[] = lines.map((line) => ({
      ...line,
      sourceTable: line.sourceTable ?? opts.sourceTable,
      sourceId: line.sourceId ?? opts.sourceId,
      entryDate: line.entryDate ?? opts.entryDate,
      createdBy: line.createdBy ?? opts.createdBy,
    }));
    const rows = await this.post(merged, txnId);
    return { txnId, rows };
  }

  /**
   * Resolve (creating if absent) the single system contra/control account for a `type`
   * (RECEIVABLE, REVENUE, PAYABLE, DRAWINGS, TAX_PAYABLE, LOAN_PAYABLE) and `currency`. Upsert
   * by name so postings can always find a balancing leg even on a DB that was not re-seeded.
   * Idempotent under concurrency (unique-violation → re-read).
   */
  async ensureSystemAccount(type: string, currency: string): Promise<Account> {
    const name = `System ${type} ${currency}`;
    const existing = await this.prisma.account.findFirst({ where: { name, currency } });
    if (existing) {
      return existing;
    }
    try {
      return await this.prisma.account.create({ data: { name, type, currency } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const found = await this.prisma.account.findFirst({ where: { name, currency } });
        if (found) {
          return found;
        }
      }
      throw err;
    }
  }

  /** True if a journal has already been posted for this (sourceTable, sourceId). Used by */
  /** revenue posting so re-recording the same receipt/claim never double-posts. */
  async alreadyPosted(sourceTable: string, sourceId: string): Promise<boolean> {
    const count = await this.prisma.ledgerEntry.count({ where: { sourceTable, sourceId } });
    return count > 0;
  }

  /**
   * Revenue inflow — an OrderReceipt (money in). CREDIT the system BANK (cash) account for the
   * currency and DEBIT the REVENUE contra account for the same amount. Idempotent by
   * (order_receipts, receiptId): a second call for the same receipt is a no-op.
   *
   * `prisma`/`tx` optional so the caller can post inside its own transaction (the importer does).
   */
  async postOrderReceipt(
    receipt: { id: string; amount: number; currency: string; createdBy?: string | null; receivedDate?: Date },
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    if ((await tx.ledgerEntry.count({ where: { sourceTable: 'order_receipts', sourceId: receipt.id } })) > 0) {
      return; // already posted for this receipt
    }
    const bank = await this.ensureSystemAccountTx(tx, 'BANK', receipt.currency);
    const revenue = await this.ensureSystemAccountTx(tx, 'REVENUE', receipt.currency);
    await tx.ledgerEntry.createMany({
      data: this.journalRows(
        [
          { accountId: bank.id, credit: receipt.amount, currency: receipt.currency, description: 'Order receipt (cash in)' },
          { accountId: revenue.id, debit: receipt.amount, currency: receipt.currency, description: 'Order receipt revenue' },
        ],
        { sourceTable: 'order_receipts', sourceId: receipt.id, entryDate: receipt.receivedDate, createdBy: receipt.createdBy ?? undefined },
      ),
    });
  }

  /**
   * Revenue accrual — a ContractClaim (revenue recognised, cash not yet received). DEBIT the
   * RECEIVABLE contra account and CREDIT the REVENUE contra account for the same amount.
   * Neither leg is a cash account, so the cash position is unaffected. Idempotent by
   * (contract_claims, claimId).
   */
  async postContractClaim(
    claim: { id: string; amountExVat: number; currency: string; createdBy?: string | null; claimDate?: Date },
    tx: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    if ((await tx.ledgerEntry.count({ where: { sourceTable: 'contract_claims', sourceId: claim.id } })) > 0) {
      return; // already posted for this claim
    }
    const receivable = await this.ensureSystemAccountTx(tx, 'RECEIVABLE', claim.currency);
    const revenue = await this.ensureSystemAccountTx(tx, 'REVENUE', claim.currency);
    await tx.ledgerEntry.createMany({
      data: this.journalRows(
        [
          { accountId: receivable.id, debit: claim.amountExVat, currency: claim.currency, description: 'Contract claim receivable' },
          { accountId: revenue.id, credit: claim.amountExVat, currency: claim.currency, description: 'Contract claim revenue' },
        ],
        { sourceTable: 'contract_claims', sourceId: claim.id, entryDate: claim.claimDate, createdBy: claim.createdBy ?? undefined },
      ),
    });
  }

  /** Transaction-aware variant of ensureSystemAccount (find-or-create by name+currency). */
  private async ensureSystemAccountTx(
    tx: Prisma.TransactionClient,
    type: string,
    currency: string,
  ): Promise<Account> {
    const name = `System ${type} ${currency}`;
    const existing = await tx.account.findFirst({ where: { name, currency } });
    if (existing) {
      return existing;
    }
    try {
      return await tx.account.create({ data: { name, type, currency } });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const found = await tx.account.findFirst({ where: { name, currency } });
        if (found) {
          return found;
        }
      }
      throw err;
    }
  }

  /** Build balanced createMany rows for a journal, asserting Σdebit == Σcredit per currency. */
  private journalRows(
    lines: LedgerPostEntry[],
    opts: JournalOptions,
  ): Prisma.LedgerEntryCreateManyInput[] {
    const perCurrency = new Map<string, { debit: number; credit: number }>();
    for (const line of lines) {
      const bucket = perCurrency.get(line.currency) ?? { debit: 0, credit: 0 };
      bucket.debit += line.debit ?? 0;
      bucket.credit += line.credit ?? 0;
      perCurrency.set(line.currency, bucket);
    }
    for (const [currency, { debit, credit }] of perCurrency) {
      if (Math.abs(debit - credit) > BALANCE_TOLERANCE) {
        throw new BadRequestException(
          `Unbalanced ledger journal for ${currency}: debit ${debit} != credit ${credit}`,
        );
      }
    }
    const txnId = randomUUID();
    const now = new Date();
    return lines.map((line) => ({
      accountId: line.accountId,
      txnId,
      debit: new Prisma.Decimal(line.debit ?? 0),
      credit: new Prisma.Decimal(line.credit ?? 0),
      currency: line.currency,
      sourceTable: line.sourceTable ?? opts.sourceTable ?? null,
      sourceId: line.sourceId ?? opts.sourceId ?? null,
      entryDate: line.entryDate ?? opts.entryDate ?? now,
      description: line.description ?? null,
      createdBy: line.createdBy ?? opts.createdBy ?? null,
    }));
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
   *
   * Only CASH_TYPES accounts count toward `totals` — contra/control accounts (RECEIVABLE,
   * REVENUE, PAYABLE, DRAWINGS, TAX_PAYABLE, LOAN_PAYABLE) are excluded so the balancing leg
   * of a double-entry journal never moves the cash figure. Contra accounts are also omitted
   * from the returned `accounts` list, so the cash position reads as a pure cash statement.
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

    const totals: Record<string, number> = { ['USD']: 0, ['ZWG']: 0 };
    const rows: AccountBalance[] = [];
    for (const a of accounts) {
      if (!CASH_TYPES.includes(a.type)) {
        continue; // contra/control account — not part of the cash position.
      }
      const balance = byAccount.get(a.id) ?? 0;
      totals[a.currency] = (totals[a.currency] ?? 0) + balance;
      rows.push({
        accountId: a.id,
        name: a.name,
        type: a.type,
        currency: a.currency,
        balance,
      });
    }

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
