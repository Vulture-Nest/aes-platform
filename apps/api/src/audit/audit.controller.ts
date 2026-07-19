import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Prisma, Role } from '@prisma/client';
import { Roles } from '../rbac/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { AuditQueryDto } from './dto/audit-query.dto';

@ApiTags('audit')
@ApiBearerAuth()
@Roles(Role.SYS_ADMIN, Role.AUDITOR)
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

    const [total, items] = await this.prisma.$transaction([
      this.prisma.auditLog.count({ where }),
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.take,
        skip: q.skip,
      }),
    ]);

    return { total, take: q.take, skip: q.skip, items };
  }
}
