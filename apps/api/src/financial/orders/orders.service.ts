import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { LedgerService } from '../../ledger/ledger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LookupService } from '../../settings/lookup.service';
import {
  CreateOrderDto,
  CreateOrderExpenseDto,
  CreateOrderReceiptDto,
  UpdateOrderDto,
} from './dto/order.dto';

/** Roles that manage the whole order book (beyond just their assigned orders). */
const ORDER_MANAGER_ROLES = ['SYS_ADMIN', 'FINANCE_DIRECTOR', 'FINANCE_OFFICER'];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookups: LookupService,
    private readonly ledger: LedgerService,
  ) {}

  list() {
    return this.prisma.order.findMany({ orderBy: { createdAt: 'desc' } });
  }

  /** Orders assigned to a given user (their "My Orders" list). */
  listAssigned(userId: string) {
    return this.prisma.order.findMany({
      where: { assignedUserId: userId },
      orderBy: { createdAt: 'desc' },
    });
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

  /** Load an order, enforcing that the caller may see/act on it. */
  async findOneForActor(id: string, user: AuthenticatedUser) {
    const order = await this.findOne(id);
    this.assertAccess(order, user, false);
    return order;
  }

  /** A manager sees every order; the assignee sees only their own. Auditor = read-only. */
  private assertAccess(
    order: { assignedUserId: string | null },
    user: AuthenticatedUser,
    write: boolean,
  ): void {
    const isManager = user.roles.some((r) => ORDER_MANAGER_ROLES.includes(r.role));
    const isAuditor = user.roles.some((r) => r.role === 'AUDITOR');
    const isAssignee = order.assignedUserId === user.id;
    const allowed = write ? isManager || isAssignee : isManager || isAuditor || isAssignee;
    if (!allowed) {
      throw new ForbiddenException('You do not have access to this order');
    }
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
        assignedUserId: dto.assignedUserId ?? null,
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
        assignedUserId: order.assignedUserId,
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
        assignedUserId: dto.assignedUserId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'orders',
      recordId: id,
      before: { reference: before.reference, assignedUserId: before.assignedUserId },
      after: { reference: order.reference, assignedUserId: order.assignedUserId },
    });
    return order;
  }

  async recordReceipt(orderId: string, dto: CreateOrderReceiptDto, user: AuthenticatedUser) {
    const order = await this.findOne(orderId);
    this.assertAccess(order, user, true);
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
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'CREATE',
      tableName: 'order_receipts',
      recordId: receipt.id,
      after: {
        orderId: receipt.orderId,
        amount: receipt.amount.toString(),
        currency: receipt.currency,
      },
    });
    // G14: post the revenue inflow (CREDIT cash/bank + DEBIT revenue). Idempotent per receipt.
    await this.ledger.postOrderReceipt({
      id: receipt.id,
      amount: receipt.amount.toNumber(),
      currency: receipt.currency,
      createdBy: user.id,
      receivedDate: receipt.receivedDate,
    });
    return receipt;
  }

  /** Record an expense against an order (feeds spent-to-date, profit and input VAT). */
  async addExpense(orderId: string, dto: CreateOrderExpenseDto, actorId: string) {
    await this.findOne(orderId);
    await this.lookups.assertValid('currency', dto.currency);
    const expense = await this.prisma.orderExpense.create({
      data: {
        orderId,
        amount: dto.amount,
        currency: dto.currency,
        vatClaimable: dto.vatClaimable ?? false,
        description: dto.description ?? null,
        rateType: dto.rateType ?? null,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'order_expenses',
      recordId: expense.id,
      after: { orderId, amount: expense.amount.toString(), currency: expense.currency },
    });
    return expense;
  }

  async markServiced(orderId: string, user: AuthenticatedUser) {
    const before = await this.findOne(orderId);
    this.assertAccess(before, user, true);
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { serviced: true, servicedAt: new Date(), updatedBy: user.id },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'STATUS_CHANGE',
      tableName: 'orders',
      recordId: orderId,
      before: { serviced: before.serviced, servicedAt: before.servicedAt },
      after: { serviced: order.serviced, servicedAt: order.servicedAt },
    });
    return order;
  }
}
