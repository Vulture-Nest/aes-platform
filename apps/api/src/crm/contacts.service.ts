import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactDto, ListContactsQueryDto, UpdateContactDto } from './dto/contact.dto';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListContactsQueryDto = {}) {
    return this.prisma.crmContact.findMany({
      where: query.organisationId ? { organisationId: query.organisationId } : undefined,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findOne(id: string) {
    const contact = await this.prisma.crmContact.findUnique({ where: { id } });
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }
    return contact;
  }

  async create(dto: CreateContactDto, actorId: string) {
    const organisation = await this.prisma.crmOrganisation.findUnique({
      where: { id: dto.organisationId },
    });
    if (!organisation) {
      throw new BadRequestException('Organisation does not exist');
    }

    const contact = await this.prisma.crmContact.create({
      data: { ...dto, createdBy: actorId, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'crm_contacts',
      recordId: contact.id,
      after: {
        organisationId: contact.organisationId,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        title: contact.title,
      },
    });
    return contact;
  }

  async update(id: string, dto: UpdateContactDto, actorId: string) {
    const before = await this.findOne(id);
    if (dto.organisationId && dto.organisationId !== before.organisationId) {
      const organisation = await this.prisma.crmOrganisation.findUnique({
        where: { id: dto.organisationId },
      });
      if (!organisation) {
        throw new BadRequestException('Organisation does not exist');
      }
    }

    const contact = await this.prisma.crmContact.update({
      where: { id },
      data: { ...dto, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'crm_contacts',
      recordId: id,
      before: {
        organisationId: before.organisationId,
        firstName: before.firstName,
        lastName: before.lastName,
        email: before.email,
        phone: before.phone,
        title: before.title,
      },
      after: {
        organisationId: contact.organisationId,
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        title: contact.title,
      },
    });
    return contact;
  }
}
