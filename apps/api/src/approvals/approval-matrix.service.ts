import { Injectable } from '@nestjs/common';
import { ApprovalMatrix } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateApprovalMatrixDto } from './dto/approval-matrix.dto';

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
}
