import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateStoresWithdrawalDto,
  ListStoresWithdrawalsQueryDto,
  UpdateStoresWithdrawalDto,
} from './dto/stores-withdrawal.dto';

/** A withdrawal whose drawn quantity exceeds its authorised allocation is flagged. */
export function overAllocation(
  quantity: number,
  allocation: number | null | undefined,
): { overAllocation: boolean; variance: number | null } {
  if (allocation == null) return { overAllocation: false, variance: null };
  const variance = quantity - allocation;
  return { overAllocation: variance > 0, variance };
}

@Injectable()
export class StoresWithdrawalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private decorate<
    T extends { quantity: Prisma.Decimal; allocation: Prisma.Decimal | null },
  >(w: T) {
    const flag = overAllocation(Number(w.quantity), w.allocation == null ? null : Number(w.allocation));
    return { ...w, ...flag };
  }

  async list(query: ListStoresWithdrawalsQueryDto = {}) {
    const where: Prisma.StoresWithdrawalWhereInput = {};
    if (query.siteId) where.siteId = query.siteId;
    if (query.itemType) where.itemType = query.itemType;
    const rows = await this.prisma.storesWithdrawal.findMany({
      where,
      orderBy: { drawnAt: 'desc' },
    });
    return rows.map((r) => this.decorate(r));
  }

  async findOne(id: string) {
    const row = await this.prisma.storesWithdrawal.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Stores withdrawal not found');
    return this.decorate(row);
  }

  async create(dto: CreateStoresWithdrawalDto, actorId: string) {
    const site = await this.prisma.site.findUnique({ where: { id: dto.siteId } });
    const row = await this.prisma.storesWithdrawal.create({
      data: {
        siteId: dto.siteId,
        entityId: site?.entityId ?? null,
        itemType: dto.itemType,
        description: dto.description,
        quantity: new Prisma.Decimal(dto.quantity),
        unit: dto.unit,
        value: new Prisma.Decimal(dto.value),
        currency: dto.currency ?? 'USD',
        vehicleRef: dto.vehicleRef,
        drawnAt: new Date(dto.drawnAt),
        allocation: dto.allocation != null ? new Prisma.Decimal(dto.allocation) : null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'stores_withdrawals',
      recordId: row.id,
      after: { siteId: row.siteId, itemType: row.itemType, value: Number(row.value) },
    });
    return this.decorate(row);
  }

  async update(id: string, dto: UpdateStoresWithdrawalDto, actorId: string) {
    await this.findOne(id);
    const data: Prisma.StoresWithdrawalUpdateInput = { updatedBy: actorId };
    if (dto.itemType !== undefined) data.itemType = dto.itemType;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.quantity !== undefined) data.quantity = new Prisma.Decimal(dto.quantity);
    if (dto.unit !== undefined) data.unit = dto.unit;
    if (dto.value !== undefined) data.value = new Prisma.Decimal(dto.value);
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.vehicleRef !== undefined) data.vehicleRef = dto.vehicleRef;
    if (dto.drawnAt !== undefined) data.drawnAt = new Date(dto.drawnAt);
    if (dto.allocation !== undefined) {
      data.allocation = dto.allocation != null ? new Prisma.Decimal(dto.allocation) : null;
    }
    const row = await this.prisma.storesWithdrawal.update({ where: { id }, data });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'stores_withdrawals',
      recordId: id,
      after: { itemType: row.itemType, value: Number(row.value) },
    });
    return this.decorate(row);
  }

  async remove(id: string, actorId: string) {
    await this.findOne(id);
    await this.prisma.storesWithdrawal.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actorId,
      action: 'DELETE',
      tableName: 'stores_withdrawals',
      recordId: id,
    });
    return { id, deleted: true };
  }
}
