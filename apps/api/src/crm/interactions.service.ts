import { BadRequestException, Injectable } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInteractionDto, ListInteractionsQueryDto } from './dto/interaction.dto';

@Injectable()
export class InteractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list(query: ListInteractionsQueryDto = {}) {
    return this.prisma.crmInteraction.findMany({
      where: {
        ...(query.organisationId ? { organisationId: query.organisationId } : {}),
        ...(query.contactId ? { contactId: query.contactId } : {}),
      },
      orderBy: { occurredAt: 'desc' },
    });
  }

  async create(dto: CreateInteractionDto, actorId: string) {
    if (!dto.organisationId && !dto.contactId) {
      throw new BadRequestException('An interaction must reference an organisation or a contact');
    }
    if (dto.organisationId) {
      const organisation = await this.prisma.crmOrganisation.findUnique({
        where: { id: dto.organisationId },
      });
      if (!organisation) {
        throw new BadRequestException('Organisation does not exist');
      }
    }
    if (dto.contactId) {
      const contact = await this.prisma.crmContact.findUnique({ where: { id: dto.contactId } });
      if (!contact) {
        throw new BadRequestException('Contact does not exist');
      }
    }

    const interaction = await this.prisma.crmInteraction.create({
      data: { ...dto, byUserId: actorId, createdBy: actorId, updatedBy: actorId },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'crm_interactions',
      recordId: interaction.id,
      after: {
        organisationId: interaction.organisationId,
        contactId: interaction.contactId,
        type: interaction.type,
        occurredAt: interaction.occurredAt,
        outcome: interaction.outcome,
      },
    });
    return interaction;
  }
}
