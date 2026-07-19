import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LookupService } from '../../settings/lookup.service';
import { CreateOrderDto, CreateOrderReceiptDto, UpdateOrderDto } from './dto/order.dto';

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookups: LookupService,
  ) {}

  list() {
    return this.prisma.order.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { receipts: true, expenses: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  async create(dto: CreateOrderDto, actorId: string) {
    await this.lookups.assertValid('currency', dto.currency);
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) {
      throw new BadRequestException('Client not found');
    }
    if (dto.contractId) {
      const contract = await this.prisma.contract.findUnique({ where: { id: dto.contractId } });
      if (!contract) {
        throw new BadRequestException('Contract not found');
      }
    }
    const order = await this.prisma.order.create({
      data: {
        clientId: dto.clientId,
        contractId: dto.contractId ?? null,
        reference: dto.reference,
        valueExVat: dto.valueExVat,
        currency: dto.currency,
        fxRateId: dto.fxRateId ?? null,
        rateType: dto.rateType ?? null,
        closingDate: dto.closingDate ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'orders',
      recordId: order.id,
      after: {
        clientId: order.clientId,
        reference: order.reference,
        valueExVat: order.valueExVat.toString(),
        currency: order.currency,
      },
    });
    return order;
  }

  async update(id: string, dto: UpdateOrderDto, actorId: string) {
    const before = await this.findOne(id);
    const order = await this.prisma.order.update({
      where: { id },
      data: {
        reference: dto.reference,
        valueExVat: dto.valueExVat,
        currency: dto.currency,
        fxRateId: dto.fxRateId,
        rateType: dto.rateType,
        closingDate: dto.closingDate,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'orders',
      recordId: id,
      before: { reference: before.reference, valueExVat: before.valueExVat.toString() },
      after: { reference: order.reference, valueExVat: order.valueExVat.toString() },
    });
    return order;
  }

  async recordReceipt(orderId: string, dto: CreateOrderReceiptDto, actorId: string) {
    await this.findOne(orderId);
    await this.lookups.assertValid('currency', dto.currency);
    const receipt = await this.prisma.orderReceipt.create({
      data: {
        orderId,
        amount: dto.amount,
        currency: dto.currency,
        fxRateId: dto.fxRateId ?? null,
        rateType: dto.rateType ?? null,
        receivedDate: dto.receivedDate,
        reference: dto.reference ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'order_receipts',
      recordId: receipt.id,
      after: {
        orderId: receipt.orderId,
        amount: receipt.amount.toString(),
        currency: receipt.currency,
      },
    });
    return receipt;
  }

  async markServiced(orderId: string, actorId: string) {
    const before = await this.findOne(orderId);
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { serviced: true, servicedAt: new Date(), updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'STATUS_CHANGE',
      tableName: 'orders',
      recordId: orderId,
      before: { serviced: before.serviced, servicedAt: before.servicedAt },
      after: { serviced: order.serviced, servicedAt: order.servicedAt },
    });
    return order;
  }
}
