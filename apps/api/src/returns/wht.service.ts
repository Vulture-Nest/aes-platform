import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateWhtRateDto,
  ListWhtRatesQueryDto,
  UpdateWhtRateDto,
  WhtCreditsQueryDto,
  WhtPayableDto,
  WhtSufferedDto,
} from './dto/returns.dto';
import { defaultFilingDeadline } from './returns.logic';

const num = (v: Prisma.Decimal | number | null | undefined): number => {
  if (v === null || v === undefined) return 0;
  return typeof v === 'number' ? v : v.toNumber();
};

@Injectable()
export class WhtService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // -------------------------------------------------------------------------
  // WhtRate CRUD (effective-dated, country + category keyed)
  // -------------------------------------------------------------------------

  listRates(query: ListWhtRatesQueryDto = {}) {
    return this.prisma.whtRate.findMany({
      where: {
        ...(query.country ? { country: query.country } : {}),
        ...(query.category ? { category: query.category } : {}),
      },
      orderBy: [{ country: 'asc' }, { category: 'asc' }, { effectiveFrom: 'desc' }],
    });
  }

  async createRate(dto: CreateWhtRateDto, actorId: string) {
    const rate = await this.prisma.whtRate.create({
      data: {
        country: dto.country ?? 'ZW',
        category: dto.category,
        rate: new Prisma.Decimal(dto.rate),
        thresholdAmount:
          dto.thresholdAmount !== undefined ? new Prisma.Decimal(dto.thresholdAmount) : null,
        effectiveFrom: new Date(dto.effectiveFrom),
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'wht_rates',
      recordId: rate.id,
      after: { country: rate.country, category: rate.category, rate: num(rate.rate) },
    });
    return rate;
  }

  async updateRate(id: string, dto: UpdateWhtRateDto, actorId: string) {
    const before = await this.prisma.whtRate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('WHT rate not found');
    const rate = await this.prisma.whtRate.update({
      where: { id },
      data: {
        ...(dto.country !== undefined ? { country: dto.country } : {}),
        ...(dto.category !== undefined ? { category: dto.category } : {}),
        ...(dto.rate !== undefined ? { rate: new Prisma.Decimal(dto.rate) } : {}),
        ...(dto.thresholdAmount !== undefined
          ? { thresholdAmount: new Prisma.Decimal(dto.thresholdAmount) }
          : {}),
        ...(dto.effectiveFrom !== undefined
          ? { effectiveFrom: new Date(dto.effectiveFrom) }
          : {}),
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'wht_rates',
      recordId: id,
      before: { rate: num(before.rate) },
      after: { rate: num(rate.rate) },
    });
    return rate;
  }

  async deleteRate(id: string, actorId: string) {
    const before = await this.prisma.whtRate.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('WHT rate not found');
    await this.prisma.whtRate.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actorId,
      action: 'DELETE',
      tableName: 'wht_rates',
      recordId: id,
      before: { country: before.country, category: before.category, rate: num(before.rate) },
    });
    return { deleted: true, id };
  }

  /** Resolve the effective WHT rate for country + category at a given date. */
  async resolveRate(country: string, category: string, asOf: Date) {
    const rate = await this.prisma.whtRate.findFirst({
      where: { country, category, effectiveFrom: { lte: asOf } },
      orderBy: { effectiveFrom: 'desc' },
    });
    return rate;
  }

  // -------------------------------------------------------------------------
  // WHT payable — withhold on outbound payments to suppliers without clearance
  // -------------------------------------------------------------------------

  /**
   * If clearance is NOT held, look up the configured WHT % and withhold automatically:
   * creates a WhtTransaction(direction PAYABLE) and a StatutoryReturn WHT liability row
   * (source=WHT) with its filing deadline. When clearance IS held, no tax is withheld.
   */
  async payable(dto: WhtPayableDto, actorId: string) {
    const country = dto.country ?? 'ZW';
    const asOf = dto.paymentDate ? new Date(dto.paymentDate) : new Date();
    const period = `${asOf.getUTCFullYear()}-${String(asOf.getUTCMonth() + 1).padStart(2, '0')}`;

    let rate = 0;
    let amount = 0;
    let withheld = false;

    if (!dto.supplierTaxClearanceHeld) {
      const configured = await this.resolveRate(country, dto.category, asOf);
      if (!configured) {
        throw new BadRequestException(
          `No WHT rate configured for ${country}/${dto.category} as of ${asOf.toISOString()}`,
        );
      }
      const threshold = num(configured.thresholdAmount);
      if (dto.taxBase >= threshold) {
        rate = num(configured.rate);
        amount = Math.round(dto.taxBase * rate * 100) / 100;
        withheld = true;
      }
    }

    const txn = await this.prisma.whtTransaction.create({
      data: {
        entityId: dto.entityId ?? null,
        direction: 'PAYABLE',
        counterparty: dto.counterparty,
        relatedPaymentRef: dto.relatedPaymentRef ?? null,
        taxBase: new Prisma.Decimal(dto.taxBase),
        rate: new Prisma.Decimal(rate),
        amount: new Prisma.Decimal(amount),
        currency: dto.currency,
        taxPeriod: period,
        status: withheld ? 'WITHHELD' : 'NIL',
        createdBy: actorId,
        updatedBy: actorId,
      },
    });

    let statutoryReturn = null;
    if (withheld && amount > 0) {
      statutoryReturn = await this.upsertWhtLiability(
        {
          entityId: dto.entityId ?? null,
          periodMonth: period,
          currency: dto.currency,
        },
        amount,
        txn.id,
        actorId,
      );
    }

    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'wht_transactions',
      recordId: txn.id,
      after: {
        direction: 'PAYABLE',
        counterparty: dto.counterparty,
        withheld,
        rate,
        amount,
      },
    });

    return {
      transaction: { ...txn, taxBase: num(txn.taxBase), rate: num(txn.rate), amount: num(txn.amount) },
      withheld,
      statutoryReturn,
    };
  }

  /** Increment the WHT payable statutory-return liability for a period/currency. */
  private async upsertWhtLiability(
    key: { entityId: string | null; periodMonth: string; currency: string },
    amount: number,
    sourceRef: string,
    actorId: string,
  ) {
    const existing = await this.prisma.statutoryReturn.findFirst({
      where: {
        taxType: 'WHT',
        periodMonth: key.periodMonth,
        currency: key.currency,
        entityId: key.entityId,
      },
    });
    const filingDeadline = defaultFilingDeadline(key.periodMonth, 'WHT');

    if (existing) {
      const newDue = num(existing.amountDue) + amount;
      const status = num(existing.amountPaid) >= newDue ? 'PAID' : existing.status === 'PAID' ? 'PARTIAL' : existing.status;
      return this.prisma.statutoryReturn.update({
        where: { id: existing.id },
        data: {
          amountDue: new Prisma.Decimal(newDue),
          status,
          updatedBy: actorId,
        },
      });
    }
    return this.prisma.statutoryReturn.create({
      data: {
        entityId: key.entityId,
        taxType: 'WHT',
        periodMonth: key.periodMonth,
        currency: key.currency,
        amountDue: new Prisma.Decimal(amount),
        amountPaid: new Prisma.Decimal(0),
        filingDeadline,
        status: 'DUE',
        source: 'WHT',
        sourceRef,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
  }

  // -------------------------------------------------------------------------
  // WHT suffered — WHT withheld from us, accumulated as a credit
  // -------------------------------------------------------------------------

  async suffered(dto: WhtSufferedDto, actorId: string) {
    const txn = await this.prisma.whtTransaction.create({
      data: {
        entityId: dto.entityId ?? null,
        direction: 'SUFFERED',
        counterparty: dto.counterparty,
        taxBase: new Prisma.Decimal(0),
        rate: new Prisma.Decimal(0),
        amount: new Prisma.Decimal(dto.amount),
        currency: dto.currency,
        certificateRef: dto.certificateRef ?? null,
        certificateReceived: dto.certificateReceived ?? !!dto.certificateRef,
        taxPeriod: dto.taxPeriod,
        status: 'OPEN',
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'wht_transactions',
      recordId: txn.id,
      after: { direction: 'SUFFERED', counterparty: dto.counterparty, amount: dto.amount },
    });
    return { ...txn, taxBase: num(txn.taxBase), rate: num(txn.rate), amount: num(txn.amount) };
  }

  /** Summary of WHT-suffered credits (total + pending-certificate), grouped by currency. */
  async credits(query: WhtCreditsQueryDto = {}) {
    const pendingOnly = query.pendingCertificateOnly === 'true';
    const txns = await this.prisma.whtTransaction.findMany({
      where: {
        direction: 'SUFFERED',
        ...(query.taxPeriod ? { taxPeriod: query.taxPeriod } : {}),
        ...(pendingOnly ? { certificateReceived: false } : {}),
        ...(query.entityId ? { entityId: query.entityId } : {}),
      },
      orderBy: { taxPeriod: 'asc' },
    });

    const byCurrency: Record<string, { totalCredit: number; certificatedCredit: number; pendingCertificateCredit: number; count: number }> = {};
    for (const t of txns) {
      const amt = num(t.amount);
      const acc = (byCurrency[t.currency] ??= {
        totalCredit: 0,
        certificatedCredit: 0,
        pendingCertificateCredit: 0,
        count: 0,
      });
      acc.totalCredit += amt;
      acc.count += 1;
      if (t.certificateReceived) acc.certificatedCredit += amt;
      else acc.pendingCertificateCredit += amt;
    }
    const round = (n: number) => Math.round(n * 100) / 100;
    for (const cur of Object.keys(byCurrency)) {
      byCurrency[cur].totalCredit = round(byCurrency[cur].totalCredit);
      byCurrency[cur].certificatedCredit = round(byCurrency[cur].certificatedCredit);
      byCurrency[cur].pendingCertificateCredit = round(byCurrency[cur].pendingCertificateCredit);
    }

    return {
      byCurrency,
      transactions: txns.map((t) => ({
        ...t,
        taxBase: num(t.taxBase),
        rate: num(t.rate),
        amount: num(t.amount),
      })),
    };
  }
}
