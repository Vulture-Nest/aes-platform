import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { LookupService } from '../settings/lookup.service';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';

@Injectable()
export class SitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookups: LookupService,
  ) {}

  list() {
    return this.prisma.site.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const site = await this.prisma.site.findUnique({ where: { id } });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    return site;
  }

  async create(dto: CreateSiteDto, actorId: string) {
    await this.lookups.assertValid('site_type', dto.type);
    try {
      const site = await this.prisma.site.create({ data: { ...dto, createdBy: actorId } });
      await this.audit.record({
        actorUserId: actorId,
        action: 'CREATE',
        tableName: 'sites',
        recordId: site.id,
        after: { name: site.name, type: site.type },
      });
      return site;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A site with this name already exists');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateSiteDto, actorId: string) {
    if (dto.type !== undefined) {
      await this.lookups.assertValid('site_type', dto.type);
    }
    const before = await this.findOne(id);
    const site = await this.prisma.site.update({
      where: { id },
      data: { ...dto, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'sites',
      recordId: id,
      before: { name: before.name, type: before.type, active: before.active },
      after: { name: site.name, type: site.type, active: site.active },
    });
    return site;
  }
}
