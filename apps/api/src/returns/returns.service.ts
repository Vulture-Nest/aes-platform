import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { PostFromPayrollDto, PostVatDto, RemitDto } from './dto/returns.dto';
import { computeReturnState, defaultFilingDeadline } from './returns.logic';

/**
 * The statutory heads a payroll run can carry, in canonical filing order, each with the
 * line components it sums. Heads are NOT posted as a fixed tuple: `postFromPayroll` derives
 * a run's actual head list from the components that are non-zero on its lines, so an entity in
 * a different country (with different statutory types) files only the heads it actually levies,
 * while a ZW run keeps producing its full ZW head set. This keeps the head list data-driven
 * per country without hardcoding a per-country tuple.
 */
const PAYROLL_HEAD_DEFS: { head: string; components: (line: PayrollLineHeads) => number }[] = [
  { head: 'PAYE', components: (l) => num(l.paye) },
  { head: 'AIDS_LEVY', components: (l) => num(l.aidsLevy) },
  { head: 'NSSA', components: (l) => num(l.nssaEe) + num(l.nssaEr) },
  { head: 'ZIMDEF', components: (l) => num(l.zimdef) },
  { head: 'NEC', components: (l) => num(l.nec) },
  { head: 'MIPF', components: (l) => num(l.mipf) },
  { head: 'NYARADZO', components: (l) => num(l.nyaradzo) },
];

/** The statutory-line fields on a payroll line consumed when deriving return heads. */
type PayrollLineHeads = {
  paye?: Prisma.Decimal | number | null;
  aidsLevy?: Prisma.Decimal | number | null;
  nssaEe?: Prisma.Decimal | number | null;
  nssaEr?: Prisma.Decimal | number | null;
  zimdef?: Prisma.Decimal | number | null;
  nec?: Prisma.Decimal | number | null;
  mipf?: Prisma.Decimal | number | null;
  nyaradzo?: Prisma.Decimal | number | null;
};

const num = (v: Prisma.Decimal | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : v.toNumber();
};

@Injectable()
export class ReturnsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Decorate a persisted return row with computed balance/status/days. */
  private decorate<T extends { amountDue: Prisma.Decimal; amountPaid: Prisma.Decimal; filingDeadline: Date | null; status: string }>(
    row: T,
    now = new Date(),
  ) {
    const state = computeReturnState(
      { amountDue: row.amountDue, amountPaid: row.amountPaid, filingDeadline: row.filingDeadline },
      now,
    );
    return {
      ...row,
      amountDue: num(row.amountDue),
      amountPaid: num(row.amountPaid),
      balance: state.balance,
      status: state.status,
      daysToDeadline: state.daysToDeadline,
    };
  }

  /** Returns Hub: one row per taxType/currency for the period, status computed on read. */
  async hub(period: string, entityId?: string) {
    const rows = await this.prisma.statutoryReturn.findMany({
      where: { periodMonth: period, ...(entityId ? { entityId } : {}) },
      orderBy: [{ taxType: 'asc' }, { currency: 'asc' }],
    });
    const now = new Date();
    return rows.map((r) => this.decorate(r, now));
  }

  /** Persist the freshly-computed status onto every return for a period (or all if omitted). */
  async persistStatuses(period?: string) {
    const rows = await this.prisma.statutoryReturn.findMany({
      where: period ? { periodMonth: period } : undefined,
    });
    const now = new Date();
    let updated = 0;
    for (const r of rows) {
      const { status } = computeReturnState(
        { amountDue: r.amountDue, amountPaid: r.amountPaid, filingDeadline: r.filingDeadline },
        now,
      );
      if (status !== r.status) {
        await this.prisma.statutoryReturn.update({ where: { id: r.id }, data: { status } });
        updated += 1;
      }
    }
    return { scanned: rows.length, updated };
  }

  async findOne(id: string) {
    const row = await this.prisma.statutoryReturn.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Statutory return not found');
    return row;
  }

  /**
   * Upsert a statutory return keyed by (taxType, periodMonth, currency, entityId).
   * Idempotent: re-posting from the same source overwrites amountDue rather than adding.
   */
  private async upsertReturn(
    key: { taxType: string; periodMonth: string; currency: string; entityId: string | null },
    data: { amountDue: number; source: string; sourceRef?: string | null; filingDeadline?: Date },
    actorId: string,
  ) {
    const existing = await this.prisma.statutoryReturn.findFirst({
      where: {
        taxType: key.taxType,
        periodMonth: key.periodMonth,
        currency: key.currency,
        entityId: key.entityId,
      },
    });
    const filingDeadline =
      data.filingDeadline ?? defaultFilingDeadline(key.periodMonth, key.taxType);

    if (existing) {
      const { status } = computeReturnState(
        {
          amountDue: data.amountDue,
          amountPaid: existing.amountPaid,
          filingDeadline,
        },
      );
      const updated = await this.prisma.statutoryReturn.update({
        where: { id: existing.id },
        data: {
          amountDue: new Prisma.Decimal(data.amountDue),
          filingDeadline,
          source: data.source,
          sourceRef: data.sourceRef ?? existing.sourceRef,
          status,
          updatedBy: actorId,
        },
      });
      await this.audit.record({
        actorUserId: actorId,
        action: 'UPDATE',
        tableName: 'statutory_returns',
        recordId: updated.id,
        before: { amountDue: num(existing.amountDue) },
        after: { amountDue: data.amountDue, source: data.source },
      });
      return updated;
    }

    const { status } = computeReturnState({
      amountDue: data.amountDue,
      amountPaid: 0,
      filingDeadline,
    });
    const created = await this.prisma.statutoryReturn.create({
      data: {
        entityId: key.entityId,
        taxType: key.taxType,
        periodMonth: key.periodMonth,
        currency: key.currency,
        amountDue: new Prisma.Decimal(data.amountDue),
        amountPaid: new Prisma.Decimal(0),
        filingDeadline,
        status,
        source: data.source,
        sourceRef: data.sourceRef ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'statutory_returns',
      recordId: created.id,
      after: { taxType: key.taxType, amountDue: data.amountDue, source: data.source },
    });
    return created;
  }

  /**
   * Post statutory returns from APPROVED payroll runs for a period. Sums each head
   * across all lines (NSSA = ee + er). Currency is USD (payroll heads are USD-denominated).
   * Idempotent per (head, period, currency).
   */
  async postFromPayroll(dto: PostFromPayrollDto, actorId: string) {
    const runs = await this.prisma.payrollRun.findMany({
      where: {
        month: dto.period,
        status: 'APPROVED',
        ...(dto.siteId ? { siteId: dto.siteId } : {}),
      },
      include: { lines: true },
    });

    const totals: Record<string, number> = Object.fromEntries(
      PAYROLL_HEAD_DEFS.map((d) => [d.head, 0]),
    );
    // Entity dimension: post per entity if runs share one, else null (default entity).
    const entityIds = new Set(runs.map((r) => r.entityId ?? null));
    const entityId = entityIds.size === 1 ? [...entityIds][0] : null;

    for (const run of runs) {
      for (const line of run.lines) {
        for (const def of PAYROLL_HEAD_DEFS) {
          totals[def.head] += def.components(line);
        }
      }
    }

    // Data-driven per country: only file the heads this run's lines actually levy (non-zero).
    // A ZW run keeps its full head set; a run in a country without (say) NEC/MIPF/NYARADZO
    // simply won't produce those returns, without a per-country tuple to maintain.
    const activeHeads = PAYROLL_HEAD_DEFS.filter((d) => totals[d.head] !== 0);

    const results = [];
    for (const { head } of activeHeads) {
      const amountDue = Math.round(totals[head] * 100) / 100;
      const row = await this.upsertReturn(
        { taxType: head, periodMonth: dto.period, currency: 'USD', entityId },
        { amountDue, source: 'PAYROLL', sourceRef: dto.siteId ?? null },
        actorId,
      );
      results.push(this.decorate(row));
    }
    return { period: dto.period, runsProcessed: runs.length, returns: results };
  }

  /**
   * Post the VAT return for a period. Net VAT is consolidated from the tax_ledger
   * (output VAT from serviced orders + contract claims LESS recoverable input VAT
   * from expenses is already accumulated there per currency). source=INVOICE.
   */
  async postVat(dto: PostVatDto, actorId: string) {
    const ledger = await this.prisma.taxLedger.findMany({
      where: { taxType: 'VAT', periodMonth: dto.period },
    });

    // Group net VAT (due - paid) by currency.
    const byCurrency = new Map<string, { net: number; entityId: string | null }>();
    for (const row of ledger) {
      const net = num(row.amountDue) - num(row.amountPaid);
      const cur = row.currency;
      const acc = byCurrency.get(cur) ?? { net: 0, entityId: row.entityId ?? null };
      acc.net += net;
      byCurrency.set(cur, acc);
    }

    const results = [];
    for (const [currency, { net, entityId }] of byCurrency) {
      const amountDue = Math.round(Math.max(0, net) * 100) / 100;
      const row = await this.upsertReturn(
        { taxType: 'VAT', periodMonth: dto.period, currency, entityId },
        { amountDue, source: 'INVOICE' },
        actorId,
      );
      results.push(this.decorate(row));
    }
    return { period: dto.period, returns: results };
  }

  /**
   * Record a remittance against a return: creates a ReturnRemittance, increments
   * amountPaid, and recomputes status (a partial payment leaves a balance / PARTIAL).
   */
  async remit(id: string, dto: RemitDto, actorId: string) {
    const existing = await this.findOne(id);
    const newPaid = num(existing.amountPaid) + dto.amount;

    const remittance = await this.prisma.returnRemittance.create({
      data: {
        returnId: id,
        paidAt: new Date(dto.paidAt),
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency,
        reference: dto.reference ?? null,
        proofAttachmentKey: dto.proofAttachmentKey ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });

    const { status } = computeReturnState(
      {
        amountDue: existing.amountDue,
        amountPaid: newPaid,
        filingDeadline: existing.filingDeadline,
      },
    );

    const updated = await this.prisma.statutoryReturn.update({
      where: { id },
      data: {
        amountPaid: new Prisma.Decimal(newPaid),
        status,
        updatedBy: actorId,
      },
    });

    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: 'statutory_returns',
      recordId: id,
      before: { amountPaid: num(existing.amountPaid), status: existing.status },
      after: { amountPaid: newPaid, status, remittanceId: remittance.id },
    });

    return { remittance, return: this.decorate(updated) };
  }

  /**
   * Year-to-date + per-period summary for the year of `period`. Returns per-period,
   * per-taxType totals plus a YTD roll-up. JSON only (a later UI/report formats it).
   */
  async summary(period: string, entityId?: string) {
    const year = period.split('-')[0];
    const rows = await this.prisma.statutoryReturn.findMany({
      where: {
        periodMonth: { gte: `${year}-01`, lte: period },
        ...(entityId ? { entityId } : {}),
      },
      orderBy: [{ periodMonth: 'asc' }, { taxType: 'asc' }],
    });
    const now = new Date();

    const perPeriod: Record<string, { taxType: string; currency: string; due: number; paid: number; balance: number; status: string }[]> = {};
    const ytd = { due: 0, paid: 0, balance: 0 };
    const ytdByTaxType: Record<string, { due: number; paid: number; balance: number }> = {};

    for (const r of rows) {
      const d = this.decorate(r, now);
      (perPeriod[r.periodMonth] ??= []).push({
        taxType: r.taxType,
        currency: r.currency,
        due: d.amountDue,
        paid: d.amountPaid,
        balance: d.balance,
        status: d.status,
      });
      ytd.due += d.amountDue;
      ytd.paid += d.amountPaid;
      ytd.balance += d.balance;
      const t = (ytdByTaxType[r.taxType] ??= { due: 0, paid: 0, balance: 0 });
      t.due += d.amountDue;
      t.paid += d.amountPaid;
      t.balance += d.balance;
    }

    const round = (n: number) => Math.round(n * 100) / 100;
    return {
      year,
      anchorPeriod: period,
      ytd: { due: round(ytd.due), paid: round(ytd.paid), balance: round(ytd.balance) },
      ytdByTaxType: Object.fromEntries(
        Object.entries(ytdByTaxType).map(([k, v]) => [
          k,
          { due: round(v.due), paid: round(v.paid), balance: round(v.balance) },
        ]),
      ),
      perPeriod,
    };
  }
}
