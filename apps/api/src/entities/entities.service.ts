import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEntityDto, UpdateEntityDto } from './dto/entity.dto';

/** The seed default entity that pre-existing rows were backfilled to. */
export const DEFAULT_ENTITY_ID = '00000000-0000-0000-0000-0000000000e1';

/** The minimal localisation bundle consumed by payroll / returns country packs. */
export interface CountryPack {
  country: string;
  baseCurrency: string;
  timezone: string;
  locale: string;
}

@Injectable()
export class EntitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.entity.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const entity = await this.prisma.entity.findUnique({ where: { id } });
    if (!entity) {
      throw new NotFoundException('Entity not found');
    }
    return entity;
  }

  async create(dto: CreateEntityDto, actorId: string) {
    const entity = await this.prisma.entity.create({
      data: { ...dto, createdBy: actorId, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'entities',
      recordId: entity.id,
      after: {
        name: entity.name,
        country: entity.country,
        baseCurrency: entity.baseCurrency,
        active: entity.active,
      },
    });
    return entity;
  }

  async update(id: string, dto: UpdateEntityDto, actorId: string) {
    const before = await this.findOne(id);
    const entity = await this.prisma.entity.update({
      where: { id },
      data: { ...dto, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'entities',
      recordId: id,
      before: {
        name: before.name,
        country: before.country,
        baseCurrency: before.baseCurrency,
        active: before.active,
      },
      after: {
        name: entity.name,
        country: entity.country,
        baseCurrency: entity.baseCurrency,
        active: entity.active,
      },
    });
    return entity;
  }

  // ---- Multinational seam helpers -----------------------------------------

  /** The default entity all backfilled rows point to. */
  getDefaultEntity() {
    return this.findOne(DEFAULT_ENTITY_ID);
  }

  /** Resolve the entity that owns a site (via site.entityId). */
  async resolveEntityForSite(siteId: string) {
    const site = await this.prisma.site.findUnique({
      where: { id: siteId },
      select: { entityId: true },
    });
    if (!site) {
      throw new NotFoundException('Site not found');
    }
    const entityId = site.entityId ?? DEFAULT_ENTITY_ID;
    return this.findOne(entityId);
  }

  /**
   * The localisation bundle (country pack) for an entity — the seam that
   * payroll / returns country-pack logic calls to localise calculations.
   */
  async countryPackFor(entityId: string): Promise<CountryPack> {
    const entity = await this.findOne(entityId);
    return {
      country: entity.country,
      baseCurrency: entity.baseCurrency,
      timezone: entity.timezone,
      locale: entity.locale,
    };
  }

  // ---- Public holidays -----------------------------------------------------

  async listHolidays(entityId: string) {
    await this.findOne(entityId);
    return this.prisma.publicHoliday.findMany({
      where: { entityId },
      orderBy: { date: 'asc' },
    });
  }

  async createHoliday(entityId: string, date: string, name: string, actorId: string) {
    await this.findOne(entityId);
    const holiday = await this.prisma.publicHoliday.create({
      data: {
        entityId,
        date: new Date(date),
        name,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'public_holidays',
      recordId: holiday.id,
      after: { entityId, date: holiday.date, name: holiday.name },
    });
    return holiday;
  }

  async deleteHoliday(entityId: string, holidayId: string, actorId: string) {
    const holiday = await this.prisma.publicHoliday.findFirst({
      where: { id: holidayId, entityId },
    });
    if (!holiday) {
      throw new NotFoundException('Public holiday not found');
    }
    await this.prisma.publicHoliday.delete({ where: { id: holidayId } });
    await this.audit.record({
      actorUserId: actorId,
      action: 'DELETE',
      tableName: 'public_holidays',
      recordId: holidayId,
      before: { entityId, date: holiday.date, name: holiday.name },
    });
    return { deleted: true };
  }

  // ---- Summary -------------------------------------------------------------

  /** Entity plus counts of the core linked dimensions (multinational proof). */
  async summary(id: string) {
    const entity = await this.findOne(id);
    const [sites, employees, orders] = await Promise.all([
      this.prisma.site.count({ where: { entityId: id } }),
      this.prisma.employee.count({ where: { entityId: id } }),
      this.prisma.order.count({ where: { entityId: id } }),
    ]);
    return { entity, counts: { sites, employees, orders } };
  }
}
