import { Injectable, NotFoundException } from '@nestjs/common';
import { ApprovalMatrix } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateApprovalMatrixDto, UpdateApprovalMatrixDto } from './dto/approval-matrix.dto';

/** CRUD for the approval_matrix configuration (SYS_ADMIN / FINANCE_DIRECTOR only). */
@Injectable()
export class ApprovalMatrixService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(dto: CreateApprovalMatrixDto, actorId: string): Promise<ApprovalMatrix> {
    const row = await this.prisma.approvalMatrix.create({
      data: {
        module: dto.module,
        minAmount: dto.minAmount ?? null,
        maxAmount: dto.maxAmount ?? null,
        currency: dto.currency ?? null,
        siteId: dto.siteId ?? null,
        stepOrder: dto.stepOrder,
        approverRole: dto.approverRole,
        mode: dto.mode ?? undefined,
        active: dto.active ?? undefined,
        createdBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'approval_matrix',
      recordId: row.id,
      after: {
        module: row.module,
        stepOrder: row.stepOrder,
        approverRole: row.approverRole,
        mode: row.mode,
      },
    });
    return row;
  }

  list(module?: string): Promise<ApprovalMatrix[]> {
    return this.prisma.approvalMatrix.findMany({
      where: module ? { module } : undefined,
      orderBy: [{ module: 'asc' }, { stepOrder: 'asc' }],
    });
  }

  /** Enable/disable a rule (existing approval chains are unaffected). */
  async update(id: string, dto: UpdateApprovalMatrixDto, actorId: string): Promise<ApprovalMatrix> {
    const existing = await this.prisma.approvalMatrix.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Approval rule not found');
    }
    const row = await this.prisma.approvalMatrix.update({
      where: { id },
      data: { active: dto.active ?? undefined },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'approval_matrix',
      recordId: id,
      after: { active: row.active },
    });
    return row;
  }

  /** Delete a routing rule. Already-instantiated chains keep their snapshot. */
  async remove(id: string, actorId: string): Promise<void> {
    const existing = await this.prisma.approvalMatrix.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('Approval rule not found');
    }
    await this.prisma.approvalMatrix.delete({ where: { id } });
    await this.audit.record({
      actorUserId: actorId,
      action: 'DELETE',
      tableName: 'approval_matrix',
      recordId: id,
      before: {
        module: existing.module,
        stepOrder: existing.stepOrder,
        approverRole: existing.approverRole,
      },
    });
  }
}
