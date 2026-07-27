import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { AuthenticatedUser } from '../../auth/types/authenticated-user';
import { OrderFinancialsFacadeService } from '../domain/order-financials-facade.service';
import { LedgerService } from '../../ledger/ledger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LookupService } from '../../settings/lookup.service';
import {
  CreateOrderDto,
  CreateOrderExpenseDto,
  CreateOrderMilestoneDto,
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
    private readonly financials: OrderFinancialsFacadeService,
  ) {}

  /**
   * G16: list orders, each enriched with a computed financial summary (health,
   * profit ex VAT, margin, outstanding, spent-to-date, total incl VAT, serviced%).
   * The raw order fields are kept; `financials` is added alongside. VAT is resolved
   * once for the whole list.
   */
  async list() {
    const orders = await this.prisma.order.findMany({
      orderBy: { createdAt: 'desc' },
      include: { receipts: true, expenses: true, milestones: true },
    });
    return this.withFinancials(orders);
  }

  /** Orders assigned to a given user (their "My Orders" list), enriched like list(). */
  async listAssigned(userId: string) {
    const orders = await this.prisma.order.findMany({
      where: { assignedUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: { receipts: true, expenses: true, milestones: true },
    });
    return this.withFinancials(orders);
  }

  /** Attach a computed financials summary to each order (single VAT resolution). */
  private async withFinancials(
    orders: Array<Parameters<OrderFinancialsFacadeService['forOrder']>[0]>,
  ) {
    if (orders.length === 0) {
      return [];
    }
    const asOf = new Date();
    const vatPct = await this.financials.resolveVatPct(asOf);
    return Promise.all(
      orders.map(async (order) => ({
        ...order,
        financials: await this.financials.forOrder(order, asOf, vatPct),
      })),
    );
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: { receipts: true, expenses: true, milestones: true },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    return order;
  }

  /** G16: an order with its computed financial + health summary attached. */
  async findOneWithFinancials(id: string, user: AuthenticatedUser) {
    const order = await this.findOneForActor(id, user);
    const financials = await this.financials.forOrder(order);
    return { ...order, financials };
  }

  /** G16: just the computed financials for an order (GET /orders/:id/financials). */
  async getFinancials(id: string, user: AuthenticatedUser) {
    const order = await this.findOneForActor(id, user);
    return this.financials.forOrder(order);
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
        title: dto.title ?? null,
        valueExVat: dto.valueExVat,
        currency: dto.currency,
        fxRateId: dto.fxRateId ?? null,
        rateType: dto.rateType ?? null,
        issueDate: dto.issueDate ?? null,
        advancePayment: dto.advancePayment ?? false,
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
        title: dto.title,
        valueExVat: dto.valueExVat,
        currency: dto.currency,
        fxRateId: dto.fxRateId,
        rateType: dto.rateType,
        issueDate: dto.issueDate,
        advancePayment: dto.advancePayment,
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
        category: dto.category ?? null,
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

  /**
   * G18 (Appendix B.2a): add a partial-servicing milestone to an order. Records the
   * portion of the order value (and/or % of scope) delivered by this milestone.
   */
  async addMilestone(orderId: string, dto: CreateOrderMilestoneDto, user: AuthenticatedUser) {
    const order = await this.findOne(orderId);
    this.assertAccess(order, user, true);
    const milestone = await this.prisma.orderMilestone.create({
      data: {
        orderId,
        description: dto.description,
        valuePortion: dto.valuePortion ?? 0,
        percentPortion: dto.percentPortion ?? null,
        completedAt: dto.completedAt ?? null,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });
    await this.audit.record({
      actorUserId: user.id,
      action: 'CREATE',
      tableName: 'order_milestones',
      recordId: milestone.id,
      after: {
        orderId,
        description: milestone.description,
        valuePortion: milestone.valuePortion.toString(),
        completedAt: milestone.completedAt,
      },
    });
    return milestone;
  }

  /** G18: list an order's milestones (oldest first). */
  async listMilestones(orderId: string, user: AuthenticatedUser) {
    await this.findOneForActor(orderId, user);
    return this.prisma.orderMilestone.findMany({
      where: { orderId },
      orderBy: { createdAt: 'asc' },
    });
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
