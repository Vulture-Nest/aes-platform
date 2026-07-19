import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LookupService } from '../../settings/lookup.service';
import { CreateContractDto, UpdateContractDto } from './dto/contract.dto';

@Injectable()
export class ContractsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookups: LookupService,
  ) {}

  list() {
    return this.prisma.contract.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) {
      throw new NotFoundException('Contract not found');
    }
    return contract;
  }

  async create(dto: CreateContractDto, actorId: string) {
    await this.lookups.assertValid('currency', dto.currency);
    const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
    if (!client) {
      throw new BadRequestException('Client not found');
    }
    const contract = await this.prisma.contract.create({
      data: {
        clientId: dto.clientId,
        reference: dto.reference,
        valueExVat: dto.valueExVat,
        currency: dto.currency,
        fxRateId: dto.fxRateId ?? null,
        rateType: dto.rateType ?? null,
        startDate: dto.startDate,
        endDate: dto.endDate,
        status: dto.status,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'contracts',
      recordId: contract.id,
      after: {
        clientId: contract.clientId,
        reference: contract.reference,
        valueExVat: contract.valueExVat.toString(),
        currency: contract.currency,
        status: contract.status,
      },
    });
    return contract;
  }

  async update(id: string, dto: UpdateContractDto, actorId: string) {
    const before = await this.findOne(id);
    const contract = await this.prisma.contract.update({
      where: { id },
      data: {
        reference: dto.reference,
        valueExVat: dto.valueExVat,
        currency: dto.currency,
        fxRateId: dto.fxRateId,
        rateType: dto.rateType,
        startDate: dto.startDate,
        endDate: dto.endDate,
        status: dto.status,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'UPDATE',
      tableName: 'contracts',
      recordId: id,
      before: {
        reference: before.reference,
        valueExVat: before.valueExVat.toString(),
        status: before.status,
      },
      after: {
        reference: contract.reference,
        valueExVat: contract.valueExVat.toString(),
        status: contract.status,
      },
    });
    return contract;
  }
}
