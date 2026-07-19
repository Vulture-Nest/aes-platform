import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';

@Injectable()
export class ClientsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  list() {
    return this.prisma.client.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string) {
    const client = await this.prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  async create(dto: CreateClientDto, actorId: string) {
    try {
      const client = await this.prisma.client.create({
        data: { ...dto, createdBy: actorId, updatedBy: actorId },
      });
      await this.audit.record({
        actorUserId: actorId,
        action: 'CREATE',
        tableName: 'clients',
        recordId: client.id,
        after: { name: client.name, contactEmail: client.contactEmail, active: client.active },
      });
      return client;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A client with this name already exists');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpdateClientDto, actorId: string) {
    const before = await this.findOne(id);
    try {
      const client = await this.prisma.client.update({
        where: { id },
        data: { ...dto, updatedBy: actorId },
      });
      await this.audit.record({
        actorUserId: actorId,
        action: 'UPDATE',
        tableName: 'clients',
        recordId: id,
        before: { name: before.name, contactEmail: before.contactEmail, active: before.active },
        after: { name: client.name, contactEmail: client.contactEmail, active: client.active },
      });
      return client;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('A client with this name already exists');
      }
      throw err;
    }
  }
}
