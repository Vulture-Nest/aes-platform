import { Injectable } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditRecord {
  actorUserId?: string | null;
  action: AuditAction;
  tableName: string;
  recordId?: string | null;
  before?: unknown;
  after?: unknown;
  correlationId?: string | null;
}

/** Coerce an arbitrary payload into a Prisma JSON write value (JSON null when absent). */
function toJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === undefined || value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

/**
 * Service-level writer for the append-only audit_log. Every approval, status change
 * and privileged mutation records here (Postgres triggers add row-level before/after
 * capture for business tables from S3).
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditRecord): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: entry.actorUserId ?? null,
        action: entry.action,
        tableName: entry.tableName,
        recordId: entry.recordId ?? null,
        before: toJson(entry.before),
        after: toJson(entry.after),
        correlationId: entry.correlationId ?? null,
      },
    });
  }
}
