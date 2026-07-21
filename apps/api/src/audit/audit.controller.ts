import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { Roles } from '../rbac/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('audit')
@ApiBearerAuth()
@Roles('SYS_ADMIN', 'AUDITOR')
@Controller({ path: 'audit', version: '1' })
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Search the append-only audit log (admin/auditor)' })
  async search(@Query() q: AuditQueryDto) {
    const where: Prisma.AuditLogWhereInput = {
      actorUserId: q.actorUserId,
      tableName: q.tableName,
      recordId: q.recordId,
      action: q.action,
      createdAt: q.from || q.to ? { gte: q.from, lte: q.to } : undefined,
    };

    const { total, items } = await this.prisma.rlsTx(async (tx) => ({
      total: await tx.auditLog.count({ where }),
      items: await tx.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.take,
        skip: q.skip,
      }),
    }));

    return { total, take: q.take, skip: q.skip, items };
  }
}
