import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateOrganisationDto,
  ListOrganisationsQueryDto,
  UpdateOrganisationDto,
} from './dto/organisation.dto';

@Injectable()
export class OrganisationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListOrganisationsQueryDto = {}) {
    return this.prisma.crmOrganisation.findMany({
      where: query.clientId ? { clientId: query.clientId } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const organisation = await this.prisma.crmOrganisation.findUnique({ where: { id } });
    if (!organisation) {
      throw new NotFoundException('Organisation not found');
    }
    return organisation;
  }

  async create(dto: CreateOrganisationDto, actorId: string) {
    if (dto.clientId) {
      const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
      if (!client) {
        throw new BadRequestException('Linked client does not exist');
      }
    }

    const organisation = await this.prisma.crmOrganisation.create({
      data: { ...dto, createdBy: actorId, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'crm_organisations',
      recordId: organisation.id,
      after: {
        name: organisation.name,
        clientId: organisation.clientId,
        industry: organisation.industry,
        source: organisation.source,
        ownerUserId: organisation.ownerUserId,
      },
    });
    return organisation;
  }

  async update(id: string, dto: UpdateOrganisationDto, actorId: string) {
    const before = await this.findOne(id);
    if (dto.clientId) {
      const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
      if (!client) {
        throw new BadRequestException('Linked client does not exist');
      }
    }

    const organisation = await this.prisma.crmOrganisation.update({
      where: { id },
      data: { ...dto, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'crm_organisations',
      recordId: id,
      before: {
        name: before.name,
        clientId: before.clientId,
        industry: before.industry,
        source: before.source,
        ownerUserId: before.ownerUserId,
      },
      after: {
        name: organisation.name,
        clientId: organisation.clientId,
        industry: organisation.industry,
        source: organisation.source,
        ownerUserId: organisation.ownerUserId,
      },
    });
    return organisation;
  }
}
