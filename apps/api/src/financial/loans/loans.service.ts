import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../../audit/audit.service';
import { PrismaService } from '../../prisma/prisma.service';
import { LookupService } from '../../settings/lookup.service';
import { CreateLoanDto, CreateLoanRepaymentDto } from './dto/loan.dto';

@Injectable()
export class LoansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly lookups: LookupService,
  ) {}

  list() {
    return this.prisma.loan.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const loan = await this.prisma.loan.findUnique({
      where: { id },
      include: { repayments: true },
    });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    return loan;
  }

  async create(dto: CreateLoanDto, actorId: string) {
    await this.lookups.assertValid('currency', dto.currency);
    const loan = await this.prisma.loan.create({
      data: {
        lender: dto.lender,
        principal: dto.principal,
        currency: dto.currency,
        fxRateId: dto.fxRateId ?? null,
        rateType: dto.rateType ?? null,
        weeklyRatePct: dto.weeklyRatePct,
        interestMethod: dto.interestMethod,
        startDate: dto.startDate,
        status: dto.status,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'loans',
      recordId: loan.id,
      after: {
        lender: loan.lender,
        principal: loan.principal.toString(),
        currency: loan.currency,
        weeklyRatePct: loan.weeklyRatePct.toString(),
      },
    });
    return loan;
  }

  async recordRepayment(loanId: string, dto: CreateLoanRepaymentDto, actorId: string) {
    await this.findOne(loanId);
    const repayment = await this.prisma.loanRepayment.create({
      data: {
        loanId,
        amount: dto.amount,
        currency: dto.currency,
        fxRateId: dto.fxRateId ?? null,
        rateType: dto.rateType ?? null,
        repaidDate: dto.repaidDate,
        createdBy: actorId,
        updatedBy: actorId,
      },
    });
    await this.audit.record({
      actorUserId: actorId,
      action: 'CREATE',
      tableName: 'loan_repayments',
      recordId: repayment.id,
      after: {
        loanId: repayment.loanId,
        amount: repayment.amount.toString(),
        currency: repayment.currency,
      },
    });
    return repayment;
  }
}
